"""LIVEKIT TOKEN API (additive; existing routes untouched).

POST /api/livekit/token — mints a short-lived LiveKit participant token
for an existing application discussion room.

Security model:
  * Current user ALWAYS from the JWT (get_current_user_model) — never
    from a frontend-supplied user_id.
  * Membership enforced: host or joined participant only.
  * Room must not be ENDED/CANCELLED.
  * Participant limit enforced server-side (joined count >= max -> 409).
  * Returns ONLY {server_url, participant_token}. NEVER returns the
    API key/secret or any other server-side credential.

Mapping:
  application room id -> LiveKit room "skillshare_discussion_{id}"
  identity           -> "user_{id}" (stable, no email/PII)
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import config
from discussion_expiry import apply_expiry, is_expired, remaining_seconds
from discussions_models import (
    DiscussionJoinRequest,
    DiscussionParticipant,
    DiscussionRoom,
    livekit_room_name_for,
)


class LivekitTokenIn(BaseModel):
    room_id: int


def _livekit_configured() -> bool:
    return bool(config.LIVEKIT_URL and config.LIVEKIT_API_KEY and config.LIVEKIT_API_SECRET)


def _require_room(db: Session, room_id: int) -> DiscussionRoom:
    room = db.get(DiscussionRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Discussion room not found")
    return room


def register_livekit(app, get_db, get_current_user_model):
    """Register POST /api/livekit/token. Additive only."""

    @app.post("/api/livekit/token")
    def livekit_token(
        data: LivekitTokenIn,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        if not _livekit_configured():
            raise HTTPException(
                status_code=503,
                detail="Live voice/video is not configured yet. Please try again later.",
            )
        room = _require_room(db, int(data.room_id))

        # PAID WINDOW (server-authoritative): a room whose paid minutes are
        # over is closed in PostgreSQL here and NO token is minted. Legacy
        # rooms (expires_at IS NULL) are untouched and never expire.
        # NOTE: this runs BEFORE the generic ENDED check so an expired paid
        # room deterministically reports "paid time is over" instead of the
        # generic "has ended" (the read path may already have flipped it to
        # ENDED via the listing sweep).
        if is_expired(room):
            apply_expiry(db, room)
            db.commit()
            raise HTTPException(
                status_code=409,
                detail="This discussion's paid time is over. The room has ended.",
            )

        if (room.status or "").upper() in ("ENDED", "CANCELLED"):
            raise HTTPException(status_code=409, detail="This discussion has ended.")

        if apply_expiry(db, room):
            db.commit()
            raise HTTPException(
                status_code=409,
                detail="This discussion's paid time is over. The room has ended.",
            )

        membership = (
            db.query(DiscussionParticipant)
            .filter(
                DiscussionParticipant.room_id == room.id,
                DiscussionParticipant.user_id == current_user.id,
            )
            .first()
        )
        is_host = room.host_id == current_user.id
        is_moderator = bool(
            membership and membership.role in ("HOST", "MODERATOR")
        )
        is_member = bool(membership and membership.status == "joined")
        if not (is_host or is_moderator or is_member):
            raise HTTPException(
                status_code=403, detail="Join the discussion before joining live audio/video."
            )

        # PRIVATE ROOMS (backend-authoritative): a joined membership alone is
        # not enough for a non-host member — the underlying join request must
        # be "accepted". Pending / rejected / missing request => 403, no token.
        # This check runs on the SERVER so an unauthorized private user can
        # never obtain a LiveKit token, regardless of what the UI shows.
        if room.is_private and not (is_host or is_moderator):
            request = (
                db.query(DiscussionJoinRequest)
                .filter(
                    DiscussionJoinRequest.room_id == room.id,
                    DiscussionJoinRequest.user_id == current_user.id,
                )
                .first()
            )
            if not request or request.status != "accepted":
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "The host has not approved you for this private room yet."
                    ),
                )

        active = (
            db.query(DiscussionParticipant)
            .filter(
                DiscussionParticipant.room_id == room.id,
                DiscussionParticipant.status == "joined",
            )
            .count()
        )
        limit = int(room.max_participants or 10)
        # Host/member rejoining keeps their seat; only a NEW seat checks the cap.
        if not is_member and not is_host and active >= limit:
            raise HTTPException(status_code=409, detail="Room is full.")

        livekit_room = room.livekit_room_name or livekit_room_name_for(room.id)
        identity = f"user_{current_user.id}"
        display_name = (getattr(current_user, "name", None) or "Participant")[:64]

        try:
            from livekit.api import AccessToken, VideoGrants
        except Exception:
            raise HTTPException(status_code=503, detail="Live media library unavailable.")

        grants = VideoGrants(
            room_join=True,
            room=livekit_room,
            can_publish=True,
            can_subscribe=True,
        )
        # Token lifetime never outlives the room's paid window: a 2h token
        # cannot keep a 10-minute room connected past its expiry.
        ttl = timedelta(hours=2)
        remaining = remaining_seconds(room)
        if remaining is not None:
            ttl = min(ttl, timedelta(seconds=max(remaining, 1)))

        token = (
            AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_name(display_name)
            .with_grants(grants)
            .with_ttl(ttl)
            .to_jwt()
        )

        # NEVER include the API key/secret (or any other server-side
        # credential) here. The browser only needs these two values.
        return {
            "server_url": config.LIVEKIT_URL,
            "participant_token": token,
        }
