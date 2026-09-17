"""LIVE DISCUSSION MODELS (additive only — Stage: Live Discussion foundation).

Creates the discussion room system:
  * discussion_rooms          — room metadata + lifecycle status
  * discussion_participants   — real user membership (host/moderator/participant)
  * discussion_messages       — room chat (dedicated; DM system untouched)
  * discussion_resources      — links / docs shared inside a room

Safety rules (same as comm_migrate.py):
  * Only NEW tables are created (Base.metadata.create_all()).
  * No DROP / TRUNCATE / DELETE. Existing users, messages, requests,
    projects and DM conversations are never touched.
  * `livekit_room_name` is a nullable column reserved for the NEXT stage
    (LiveKit media integration). No LiveKit code runs in this stage.

Room lifecycle statuses: SCHEDULED | LIVE | ENDED | CANCELLED
Participant roles:       HOST | MODERATOR | PARTICIPANT
Participant status:      joined | left | removed
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from database import Base

# Canonical vocabularies (imported by the API layer).
DISCUSSION_ROOM_STATUSES = ("SCHEDULED", "LIVE", "ENDED", "CANCELLED")
DISCUSSION_ROOM_TYPES = (
    "TECH_DISCUSSION",
    "STUDY_GROUP",
    "MENTORSHIP",
    "PROJECT_DISCUSSION",
    "INDUSTRY_EVENT",
    "TECH_TALK",
    "INTERVIEW",
    "MOCK_INTERVIEW",
)
DISCUSSION_PARTICIPANT_ROLES = ("HOST", "MODERATOR", "PARTICIPANT")
DISCUSSION_PARTICIPANT_STATUSES = ("joined", "left", "removed")
# Private-room join requests (Phase: private/public rooms — additive only).
DISCUSSION_JOIN_REQUEST_STATUSES = ("pending", "accepted", "rejected")


class DiscussionRoom(Base):
    __tablename__ = "discussion_rooms"

    id = Column(Integer, primary_key=True, index=True)

    # Host is a real users.id — always set server-side from the JWT
    # (never from a frontend-supplied host_id).
    host_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    topic = Column(String(160), nullable=True, index=True)
    category = Column(String(80), nullable=True, index=True)
    room_type = Column(String(40), nullable=True, index=True)

    status = Column(String(20), nullable=False, default="SCHEDULED", index=True)

    # Private rooms require host approval before a user may join or
    # receive a LiveKit token. Nullable + server-defaulted FALSE so the
    # existing rows (and the existing API contract) keep working.
    is_private = Column(Boolean, nullable=False, default=False, server_default="false")

    max_participants = Column(Integer, nullable=False, default=10)
    duration_minutes = Column(Integer, nullable=True)

    scheduled_at = Column(DateTime, nullable=True, index=True)
    started_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    credit_cost = Column(Integer, nullable=True)
    ended_at = Column(DateTime, nullable=True)

    # Agenda / discussion points defined by the host (plain text).
    agenda = Column(Text, nullable=True)

    # Reserved for the NEXT stage (LiveKit). Never exposed with secrets —
    # it only maps the application room to a future LiveKit room name.
    livekit_room_name = Column(String(160), nullable=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

    host = relationship("User", foreign_keys=[host_id], lazy="joined")
    participants = relationship(
        "DiscussionParticipant",
        back_populates="room",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class DiscussionParticipant(Base):
    __tablename__ = "discussion_participants"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(
        Integer,
        ForeignKey("discussion_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    role = Column(String(20), nullable=False, default="PARTICIPANT")
    status = Column(String(20), nullable=False, default="joined", index=True)

    joined_at = Column(DateTime, default=func.now(), nullable=False)
    left_at = Column(DateTime, nullable=True)
    last_seen_at = Column(DateTime, nullable=True)

    room = relationship("DiscussionRoom", back_populates="participants")
    user = relationship("User", lazy="joined")

    __table_args__ = (
        # One membership row per user per room: re-joining updates the
        # existing row instead of creating duplicates.
        UniqueConstraint("room_id", "user_id", name="uq_discussion_participant"),
    )


class DiscussionMessage(Base):
    __tablename__ = "discussion_messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(
        Integer,
        ForeignKey("discussion_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    content = Column(Text, nullable=False)

    # Soft delete keeps history sane; hard deletes never run.
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)

    sender = relationship("User", lazy="joined")


class DiscussionResource(Base):
    __tablename__ = "discussion_resources"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(
        Integer,
        ForeignKey("discussion_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    added_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    kind = Column(String(20), nullable=False, default="link")  # link|doc|github
    title = Column(String(200), nullable=False)
    url = Column(String(600), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    added_by_user = relationship("User", foreign_keys=[added_by], lazy="joined")


# Stable LiveKit mapping helper for the NEXT stage.
#   application room id  ->  LiveKit room name
def livekit_room_name_for(room_id: int) -> str:
    return f"skillshare_discussion_{room_id}"


class DiscussionJoinRequest(Base):
    """Private-room join requests (additive; new table only).

    Lifecycle:  pending -> accepted | rejected
      * accepted user may call POST .../join and receive a LiveKit token
        (the token endpoint re-verifies the accepted status server-side).
      * a rejected user cannot re-enter until the host accepts a new
        request (re-requesting flips the SAME row back to pending —
        one row per room+user, enforced by a UNIQUE constraint).
      * duplicate pending requests are rejected with 409 by the API.
    """

    __tablename__ = "discussion_join_requests"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(
        Integer,
        ForeignKey("discussion_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status = Column(String(20), nullable=False, default="pending", index=True)

    requested_at = Column(DateTime, default=func.now(), nullable=False)
    decided_at = Column(DateTime, nullable=True)
    # Host/moderator who accepted/rejected — always the JWT user, never
    # a frontend-supplied id.
    decided_by = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    user = relationship("User", foreign_keys=[user_id], lazy="joined")
    decided_by_user = relationship("User", foreign_keys=[decided_by], lazy="joined")

    __table_args__ = (
        # One request row per user per room: re-requesting reuses the row.
        UniqueConstraint("room_id", "user_id", name="uq_discussion_join_request"),
    )


def run_discussion_privacy_migration(engine) -> list[str]:
    """Idempotent, NON-destructive migration for existing installs.

    Base.metadata.create_all() creates missing TABLES but never adds
    columns to existing ones, so `discussion_rooms.is_private` is added
    with ADD COLUMN IF NOT EXISTS (a no-op when it already exists).
    No DROP / TRUNCATE / data rewrite anywhere.
    """
    from sqlalchemy import text

    applied: list[str] = []
    statements = [
        (
            "ALTER TABLE discussion_rooms ADD COLUMN IF NOT EXISTS "
            "is_private BOOLEAN NOT NULL DEFAULT FALSE",
            "discussion_rooms.is_private",
        ),
    ]
    for sql, label in statements:
        try:
            with engine.connect() as conn:
                conn.execute(text(sql))
                conn.commit()
            applied.append(label)
        except Exception as exc:  # never break boot on an additive migration
            print(f"[discussions] WARNING: privacy migration '{label}' skipped: {exc}")
    return applied

