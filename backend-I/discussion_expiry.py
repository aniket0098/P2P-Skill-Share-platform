"""PAID-WINDOW (EXPIRY) RULES shared by the discussion + LiveKit routes.

The paid window is anchored when a room actually goes LIVE, not when it is
created (a room scheduled for next week must not burn its minutes now):

    expires_at = started_at + duration_minutes

`expires_at IS NULL` means the room was never charged (legacy rooms created
before credits existed) or has not started yet — those rooms never expire.

PostgreSQL `expires_at` (UTC) is the ONLY authority: nothing here reads the
browser clock, localStorage or any client-supplied duration.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from discussions_models import DiscussionRoom
from credits_service import DEFAULT_ROOM_MINUTES

CLOSED_STATUSES = ("ENDED", "CANCELLED")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _utc(dt):
    """Normalize a DB value to an aware UTC datetime (None-safe)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def is_expired(room, now=None) -> bool:
    expires = _utc(getattr(room, "expires_at", None))
    if expires is None:            # legacy / not-started room -> no paid window
        return False
    return (now or now_utc()) >= expires


def remaining_seconds(room, now=None):
    """Seconds left in the paid window, or None when the room has no window."""
    expires = _utc(getattr(room, "expires_at", None))
    if expires is None:
        return None
    return max(0, int((expires - (now or now_utc())).total_seconds()))


def apply_expiry(db, room) -> bool:
    """Close `room` in place when its paid window has passed.

    Returns True only when this call changed the row (caller commits).
    Already-ended/cancelled rooms are left exactly as they are — a host who
    ended a room early keeps their ended_at.
    """
    if not is_expired(room):
        return False
    if (room.status or "").upper() in CLOSED_STATUSES:
        return False
    room.status = "ENDED"
    # ended_at is a naive UTC column (existing schema) — keep that contract.
    room.ended_at = now_utc().replace(tzinfo=None)
    return True


def expire_due_rooms(db) -> int:
    """Sweep rooms whose paid minutes ran out. Commits only when it changed rows.

    Only rows with a NON-NULL expires_at in the past are ever touched, so the
    235 existing users' 34 legacy rooms are never modified.
    """
    rows = (
        db.query(DiscussionRoom)
        .filter(
            DiscussionRoom.expires_at.isnot(None),
            DiscussionRoom.expires_at <= now_utc(),
            DiscussionRoom.status.notin_(CLOSED_STATUSES),
        )
        .all()
    )
    for room in rows:
        apply_expiry(db, room)
    if rows:
        db.commit()
    return len(rows)


def anchor_paid_window(room, started_at) -> datetime:
    """Start the paid window now: expires_at = started_at + duration."""
    minutes = int(room.duration_minutes or DEFAULT_ROOM_MINUTES)
    anchor = _utc(started_at) or now_utc()
    room.expires_at = anchor + timedelta(minutes=minutes)
    return room.expires_at