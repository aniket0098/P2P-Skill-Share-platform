"""LIVE DISCUSSION API (additive; existing routes untouched).

Endpoints under /api/discussions/* + /ws/discussions/{room_id}.

Security model:
  * The current user is ALWAYS derived from the JWT
    (get_current_user_model) — never from a frontend-supplied user_id.
  * Host-only actions (edit / end / cancel / remove participant /
    resources) are enforced server-side.
  * Non-members cannot read an ended/private room's chat or send messages.
  * No secrets (password hashes, JWT keys) are ever serialized.

Design (LiveKit NEXT stage): every room payload includes `livekit_room`
(= livekit_room_name_for(room.id)) so the next stage can request tokens
for the SAME identifier. No LiveKit SDK/keys/token logic here.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import auth as authmod
from discussions_models import (
    DISCUSSION_PARTICIPANT_ROLES,
    DISCUSSION_ROOM_STATUSES,
    DISCUSSION_ROOM_TYPES,
    DiscussionMessage,
    DiscussionParticipant,
    DiscussionResource,
    DiscussionRoom,
    livekit_room_name_for,
)


# ============================================================
# HELPERS
# ============================================================


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return None


def _user_summary(user) -> dict:
    """Safe public user payload — never email/password/internal data."""
    if user is None:
        return {"id": None, "name": "Former member", "username": None,
                "avatar_url": None, "public_id": None}
    return {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "avatar_url": getattr(user, "avatar_url", None),
        "public_id": user.public_id,
    }


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
        return dt
    except ValueError:
        return None


def _active_count(db: Session, room_id: int) -> int:
    return (
        db.query(DiscussionParticipant)
        .filter(
            DiscussionParticipant.room_id == room_id,
            DiscussionParticipant.status == "joined",
        )
        .count()
    )


def _get_membership(db: Session, room_id: int, user_id: int):
    return (
        db.query(DiscussionParticipant)
        .filter(
            DiscussionParticipant.room_id == room_id,
            DiscussionParticipant.user_id == user_id,
        )
        .first()
    )


def _serialize_room(db: Session, room: DiscussionRoom, current_user) -> dict:
    me = _get_membership(db, room.id, current_user.id)
    return {
        "id": room.id,
        "title": room.title,
        "description": room.description,
        "topic": room.topic,
        "category": room.category,
        "room_type": room.room_type,
        "status": room.status,
        "max_participants": room.max_participants,
        "duration_minutes": room.duration_minutes,
        "scheduled_at": _iso(room.scheduled_at),
        "started_at": _iso(room.started_at),
        "ended_at": _iso(room.ended_at),
        "agenda": room.agenda,
        "created_at": _iso(room.created_at),
        "updated_at": _iso(room.updated_at),
        "host": _user_summary(room.host),
        "host_id": room.host_id,
        "participant_count": _active_count(db, room.id),
        "is_host": room.host_id == current_user.id,
        "is_member": bool(me and me.status == "joined"),
        "my_role": (me.role if me else None),
        # Stable media-room identifier reserved for the NEXT stage
        # (LiveKit). This stage never connects to LiveKit.
        "livekit_room": livekit_room_name_for(room.id),
    }


def _serialize_participant(p: DiscussionParticipant) -> dict:
    return {
        "id": p.id,
        "user": _user_summary(p.user),
        "role": p.role,
        # No fake presence: only real membership state is reported.
        "status": p.status,
        "joined_at": _iso(p.joined_at),
        "left_at": _iso(p.left_at),
    }


def _serialize_message(m: DiscussionMessage) -> dict:
    return {
        "id": m.id,
        "room_id": m.room_id,
        "sender": _user_summary(m.sender),
        "content": "" if m.is_deleted else (m.content or ""),
        "is_deleted": bool(m.is_deleted),
        "created_at": _iso(m.created_at),
    }


def _serialize_resource(r: DiscussionResource) -> dict:
    return {
        "id": r.id,
        "kind": r.kind,
        "title": r.title,
        "url": r.url,
        "added_by": _user_summary(r.added_by_user),
        "created_at": _iso(r.created_at),
    }


def _require_room(db: Session, room_id: int) -> DiscussionRoom:
    room = db.get(DiscussionRoom, room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Discussion room not found")
    return room


def _require_host(room: DiscussionRoom, current_user) -> None:
    if room.host_id != current_user.id:
        raise HTTPException(
            status_code=403, detail="Only the room host can perform this action"
        )


def _require_active_member(db: Session, room: DiscussionRoom, current_user):
    if room.host_id == current_user.id:
        return _get_membership(db, room.id, current_user.id)
    membership = _get_membership(db, room.id, current_user.id)
    if not membership or membership.status != "joined":
        raise HTTPException(
            status_code=403, detail="Join this room to participate"
        )
    return membership


# ============================================================
# REQUEST SCHEMAS
# ============================================================


class RoomCreateIn(BaseModel):
    title: str
    description: str | None = None
    topic: str | None = None
    category: str | None = None
    room_type: str | None = None
    max_participants: int = 10
    duration_minutes: int | None = None
    scheduled_at: str | None = None
    agenda: str | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Room title is required")
        return v[:200]

    @field_validator("max_participants")
    @classmethod
    def _maxp(cls, v):
        if v is None:
            return 10
        if v < 2 or v > 200:
            raise ValueError("Maximum participants must be between 2 and 200")
        return v

    @field_validator("duration_minutes")
    @classmethod
    def _dur(cls, v):
        if v is None:
            return None
        if v < 5 or v > 720:
            raise ValueError("Duration must be between 5 and 720 minutes")
        return v


class RoomUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    topic: str | None = None
    category: str | None = None
    room_type: str | None = None
    max_participants: int | None = None
    duration_minutes: int | None = None
    scheduled_at: str | None = None
    agenda: str | None = None


class MessageIn(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def _content(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Message content is required")
        return v[:4000]


class ResourceIn(BaseModel):
    title: str
    url: str
    kind: str = "link"

    @field_validator("title")
    @classmethod
    def _t(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("Resource title is required")
        return v[:200]

    @field_validator("url")
    @classmethod
    def _u(cls, v):
        v = (v or "").strip()
        if not v.lower().startswith(("http://", "https://")):
            raise ValueError("Resource URL must start with http:// or https://")
        return v[:600]


# ============================================================
# REGISTRATION
# ============================================================


def register_discussions(app, get_db, get_current_user_model):
    """Register all /api/discussions/* endpoints. Additive only."""

    from sqlalchemy.orm import aliased

    from models import User

    HostUser = aliased(User)

    def _base_query(db: Session):
        return db.query(DiscussionRoom).join(
            HostUser, DiscussionRoom.host_id == HostUser.id, isouter=True
        )

    def _status_rank(room):
        return {"LIVE": 0, "SCHEDULED": 1, "ENDED": 2, "CANCELLED": 3}.get(
            room.status, 4
        )

    # -----------------------------
    # LIST + DISCOVER ROOMS
    # -----------------------------

    @app.get("/api/discussions")
    def list_rooms(
        q: str = Query("", max_length=120),
        category: str = Query("", max_length=80),
        status: str = Query("", max_length=20),
        filter: str = Query("all", max_length=20),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        query = _base_query(db)

        term = (q or "").strip()
        if term:
            like = f"%{term}%"
            query = query.filter(
                or_(
                    DiscussionRoom.title.ilike(like),
                    DiscussionRoom.topic.ilike(like),
                    DiscussionRoom.description.ilike(like),
                    DiscussionRoom.category.ilike(like),
                    HostUser.name.ilike(like),
                    HostUser.username.ilike(like),
                )
            )

        if category and category.lower() not in ("all", ""):
            query = query.filter(DiscussionRoom.category.ilike(category))

        if status and status.upper() in DISCUSSION_ROOM_STATUSES:
            query = query.filter(DiscussionRoom.status == status.upper())

        membership_rows = (
            db.query(DiscussionParticipant)
            .filter(
                DiscussionParticipant.user_id == current_user.id,
                DiscussionParticipant.status == "joined",
            )
            .all()
        )
        joined_ids = {row.room_id for row in membership_rows}

        f = (filter or "all").lower()
        if f == "live":
            query = query.filter(DiscussionRoom.status == "LIVE")
        elif f == "upcoming":
            query = query.filter(DiscussionRoom.status == "SCHEDULED")
        elif f == "mine":
            query = query.filter(DiscussionRoom.host_id == current_user.id)
        elif f == "joined":
            query = query.filter(DiscussionRoom.id.in_(joined_ids))

        total = query.count()
        rows = (
            query.order_by(DiscussionRoom.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        # Live rooms surface first, then scheduled, then finished ones.
        rows.sort(key=lambda r: (_status_rank(r), -(r.id or 0)))

        return {
            "rooms": [_serialize_room(db, room, current_user) for room in rows],
            "total": total,
        }

    # -----------------------------
    # CREATE ROOM (host = JWT user)
    # -----------------------------

    @app.post("/api/discussions", status_code=201)
    def create_room(
        data: RoomCreateIn,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room_type = (data.room_type or "TECH_DISCUSSION").upper()
        if room_type not in DISCUSSION_ROOM_TYPES:
            raise HTTPException(
                status_code=422,
                detail="Invalid room type. Allowed: "
                + ", ".join(DISCUSSION_ROOM_TYPES),
            )

        room = DiscussionRoom(
            host_id=current_user.id,   # authority: JWT only
            title=data.title,
            description=(data.description or "").strip() or None,
            topic=(data.topic or "").strip() or None,
            category=(data.category or "").strip() or None,
            room_type=room_type,
            status="SCHEDULED",
            max_participants=data.max_participants,
            duration_minutes=data.duration_minutes,
            scheduled_at=_parse_dt(data.scheduled_at),
            agenda=(data.agenda or "").strip() or None,
            livekit_room_name="",
        )
        db.add(room)
        db.flush()  # allocate room.id

        # Stable media-room identifier, reserved for the NEXT stage (LiveKit).
        room.livekit_room_name = livekit_room_name_for(room.id)

        # Host automatically becomes the first participant.
        db.add(
            DiscussionParticipant(
                room_id=room.id,
                user_id=current_user.id,
                role="HOST",
                status="joined",
            )
        )
        db.commit()
        db.refresh(room)

        return {
            "room": _serialize_room(db, room, current_user),
            "message": "Discussion room created",
        }

    # -----------------------------
    # ROOM DETAIL
    # -----------------------------

    @app.get("/api/discussions/{room_id}")
    def get_room(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        return {"room": _serialize_room(db, room, current_user)}

    # -----------------------------
    # EDIT ROOM (host only)
    # -----------------------------

    @app.patch("/api/discussions/{room_id}")
    def update_room(
        room_id: int,
        data: RoomUpdateIn,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        _require_host(room, current_user)

        if room.status in ("ENDED", "CANCELLED"):
            raise HTTPException(
                status_code=409, detail="Ended or cancelled rooms cannot be edited"
            )

        if data.title is not None and data.title.strip():
            room.title = data.title.strip()[:200]
        if data.description is not None:
            room.description = data.description.strip() or None
        if data.topic is not None:
            room.topic = data.topic.strip() or None
        if data.category is not None:
            room.category = data.category.strip() or None
        if data.room_type is not None:
            rt = data.room_type.upper()
            if rt not in DISCUSSION_ROOM_TYPES:
                raise HTTPException(status_code=422, detail="Invalid room type")
            room.room_type = rt
        if data.max_participants is not None:
            if data.max_participants < 2 or data.max_participants > 200:
                raise HTTPException(
                    status_code=422,
                    detail="Maximum participants must be between 2 and 200",
                )
            active = _active_count(db, room.id)
            if data.max_participants < active:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Cannot reduce the limit below the current "
                        f"{active} participants"
                    ),
                )
            room.max_participants = data.max_participants
        if data.duration_minutes is not None:
            if data.duration_minutes < 5 or data.duration_minutes > 720:
                raise HTTPException(
                    status_code=422,
                    detail="Duration must be between 5 and 720 minutes",
                )
            room.duration_minutes = data.duration_minutes
        if data.scheduled_at is not None:
            room.scheduled_at = _parse_dt(data.scheduled_at)
        if data.agenda is not None:
            room.agenda = data.agenda.strip() or None

        db.commit()
        db.refresh(room)
        return {"room": _serialize_room(db, room, current_user)}

    # -----------------------------
    # ROOM LIFECYCLE (host only)
    # -----------------------------

    @app.post("/api/discussions/{room_id}/start")
    def start_room(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        _require_host(room, current_user)
        if room.status != "SCHEDULED":
            raise HTTPException(
                status_code=409, detail=f"Room cannot start from status {room.status}"
            )
        room.status = "LIVE"
        room.started_at = _now()
        db.commit()
        db.refresh(room)
        return {"room": _serialize_room(db, room, current_user)}

    @app.post("/api/discussions/{room_id}/end")
    def end_room(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        _require_host(room, current_user)
        if room.status == "ENDED":
            raise HTTPException(status_code=409, detail="Room is already ended")
        room.status = "ENDED"
        room.ended_at = _now()
        db.commit()
        db.refresh(room)
        return {"room": _serialize_room(db, room, current_user)}

    @app.post("/api/discussions/{room_id}/cancel")
    def cancel_room(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        _require_host(room, current_user)
        if room.status in ("ENDED", "CANCELLED"):
            raise HTTPException(status_code=409, detail="Room is already closed")
        room.status = "CANCELLED"
        room.ended_at = _now()
        db.commit()
        db.refresh(room)
        return {"room": _serialize_room(db, room, current_user)}

    # -----------------------------
    # JOIN / LEAVE
    # -----------------------------

    @app.post("/api/discussions/{room_id}/join")
    def join_room(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)

        if room.status in ("ENDED", "CANCELLED"):
            raise HTTPException(
                status_code=409,
                detail="This discussion has ended and no longer accepts participants",
            )

        active = _active_count(db, room.id)
        membership = _get_membership(db, room.id, current_user.id)

        if membership and membership.status == "joined":
            # Idempotent: already a participant — reuse, never duplicate.
            return {
                "room": _serialize_room(db, room, current_user),
                "participant": _serialize_participant(membership),
                "message": "Already a participant of this room",
            }

        if active >= room.max_participants and not (
            membership and membership.status != "joined"
        ):
            raise HTTPException(
                status_code=409, detail="This room is full"
            )

        if membership:
            # Re-joining restores the previous membership row.
            membership.status = "joined"
            membership.left_at = None
            membership.joined_at = _now()
            if membership.role not in ("HOST", "MODERATOR"):
                membership.role = "PARTICIPANT"
        else:
            membership = DiscussionParticipant(
                room_id=room.id,
                user_id=current_user.id,
                role="PARTICIPANT",
                status="joined",
            )
            db.add(membership)

        db.commit()
        db.refresh(membership)
        return {
            "room": _serialize_room(db, room, current_user),
            "participant": _serialize_participant(membership),
            "message": "Joined the discussion room",
        }

    @app.post("/api/discussions/{room_id}/leave")
    def leave_room(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        membership = _get_membership(db, room.id, current_user.id)

        if not membership or membership.status != "joined":
            raise HTTPException(
                status_code=409, detail="You are not a participant of this room"
            )

        if room.host_id == current_user.id:
            # A normal Leave must never destroy the host's room.
            raise HTTPException(
                status_code=409,
                detail=(
                    "Hosts cannot leave their own room. "
                    "End the room instead if the discussion is over."
                ),
            )

        membership.status = "left"
        membership.left_at = _now()
        db.commit()
        return {"message": "You left the discussion room"}

    # -----------------------------
    # PARTICIPANTS
    # -----------------------------

    @app.get("/api/discussions/{room_id}/participants")
    def list_participants(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        rows = (
            db.query(DiscussionParticipant)
            .filter(DiscussionParticipant.room_id == room.id)
            .order_by(DiscussionParticipant.id.asc())
            .all()
        )
        # Host first, then joined members, then left/removed ones.
        def _rank(p):
            joined = 0 if p.status == "joined" else 1
            role = {"HOST": 0, "MODERATOR": 1, "PARTICIPANT": 2}.get(p.role, 3)
            return (joined, role, p.id or 0)

        rows.sort(key=_rank)
        return {
            "participants": [_serialize_participant(p) for p in rows],
            "active_count": _active_count(db, room.id),
        }

    @app.delete("/api/discussions/{room_id}/participants/{user_id}")
    def remove_participant(
        room_id: int,
        user_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        _require_host(room, current_user)

        if user_id == room.host_id:
            raise HTTPException(
                status_code=409, detail="The host cannot be removed from the room"
            )

        target = _get_membership(db, room.id, user_id)
        if not target:
            raise HTTPException(
                status_code=404, detail="That user is not a participant of this room"
            )

        target.status = "removed"
        target.left_at = _now()
        db.commit()
        return {"message": "Participant removed from the room"}

    # -----------------------------
    # MESSAGES (room chat)
    # -----------------------------

    @app.get("/api/discussions/{room_id}/messages")
    def list_messages(
        room_id: int,
        before_id: int | None = Query(None, ge=0),
        limit: int = Query(30, ge=1, le=100),
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)

        # Chat history is participant-only information.
        membership = _get_membership(db, room.id, current_user.id)
        is_host = room.host_id == current_user.id
        if not is_host and not (membership and membership.status == "joined"):
            raise HTTPException(
                status_code=403, detail="Join this room to read the discussion"
            )

        query = db.query(DiscussionMessage).filter(
            DiscussionMessage.room_id == room.id
        )
        if before_id:
            query = query.filter(DiscussionMessage.id < before_id)

        rows = query.order_by(DiscussionMessage.id.desc()).limit(limit).all()
        rows.reverse()  # oldest -> newest for direct rendering

        older = 0
        if rows:
            older = (
                db.query(func.count(DiscussionMessage.id))
                .filter(
                    DiscussionMessage.room_id == room.id,
                    DiscussionMessage.id < rows[0].id,
                )
                .scalar()
            )

        return {
            "messages": [_serialize_message(m) for m in rows],
            "has_more": bool(older),
        }

    @app.post("/api/discussions/{room_id}/messages", status_code=201)
    def send_message(
        room_id: int,
        data: MessageIn,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)

        if room.status in ("ENDED", "CANCELLED"):
            raise HTTPException(status_code=409, detail="This discussion has ended")

        membership = _get_membership(db, room.id, current_user.id)
        is_host = room.host_id == current_user.id
        if not is_host and not (membership and membership.status == "joined"):
            raise HTTPException(
                status_code=403, detail="Join this room to send messages"
            )

        message = DiscussionMessage(
            room_id=room.id,
            sender_id=current_user.id,
            content=data.content,
        )
        db.add(message)
        db.commit()
        db.refresh(message)

        if membership:
            membership.last_seen_at = _now()
            db.commit()

        return {"message": _serialize_message(message)}

    # -----------------------------
    # RESOURCES (real rows only)
    # -----------------------------

    @app.get("/api/discussions/{room_id}/resources")
    def list_resources(
        room_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        rows = (
            db.query(DiscussionResource)
            .filter(DiscussionResource.room_id == room.id)
            .order_by(DiscussionResource.id.desc())
            .all()
        )
        return {"resources": [_serialize_resource(r) for r in rows]}

    @app.post("/api/discussions/{room_id}/resources", status_code=201)
    def add_resource(
        room_id: int,
        data: ResourceIn,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user_model),
    ):
        room = _require_room(db, room_id)
        _require_host(room, current_user)  # host manages room resources

        if room.status in ("ENDED", "CANCELLED"):
            raise HTTPException(status_code=409, detail="This discussion has ended")

        kind = (data.kind or "link").lower()
        if kind not in ("link", "doc", "github"):
            kind = "link"

        resource = DiscussionResource(
            room_id=room.id,
            added_by=current_user.id,
            kind=kind,
            title=data.title,
            url=data.url,
        )
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return {"resource": _serialize_resource(resource)}

    # ============================================================
    # REALTIME (optional, additive): room-scoped WebSocket fan-out.
    # Only membership holders may connect. History is NOT served
    # over the socket — clients load it from GET .../messages, so a
    # socket failure never breaks the room (chat still works via
    # the REST endpoints).
    # ============================================================

    room_sockets: dict[int, set] = {}

    def _ws_user(token: str):
        payload = authmod.decode_access_token(token or "")
        if not payload:
            return None
        try:
            return int(payload.get("sub"))
        except (TypeError, ValueError):
            return None

    @app.websocket("/ws/discussions/{room_id}")
    async def discussion_socket(
        websocket: WebSocket,
        room_id: int,
        token: str = Query(""),
    ):
        from database import SessionLocal

        user_id = _ws_user(token)
        db = SessionLocal()
        try:
            room = db.get(DiscussionRoom, room_id)
            membership = (
                _get_membership(db, room_id, user_id) if user_id else None
            )
            if (
                not user_id
                or not room
                or not (
                    room.host_id == user_id
                    or (membership and membership.status == "joined")
                )
            ):
                await websocket.close(code=4401)
                return

            await websocket.accept()
            room_sockets.setdefault(room_id, set()).add(websocket)

            while True:
                raw = await websocket.receive_text()
                try:
                    data = json.loads(raw)
                except Exception:
                    continue
                content = (data.get("content") or "").strip()
                if not content or len(content) > 4000:
                    continue
                if room.status in ("ENDED", "CANCELLED"):
                    continue

                message = DiscussionMessage(
                    room_id=room_id,
                    sender_id=user_id,
                    content=content[:4000],
                )
                db.add(message)
                db.commit()
                db.refresh(message)

                payload = json.dumps(
                    {"type": "chat", "message": _serialize_message(message)}
                )
                dead = []
                for sock in list(room_sockets.get(room_id, ())):
                    try:
                        await sock.send_text(payload)
                    except Exception:
                        dead.append(sock)
                for sock in dead:
                    room_sockets.get(room_id, set()).discard(sock)
        except WebSocketDisconnect:
            pass
        except Exception:
            try:
                await websocket.close(code=1011)
            except Exception:
                pass
        finally:
            db.close()
            room_sockets.get(room_id, set()).discard(websocket)


