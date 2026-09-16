"""COMMUNICATION HUB EXTENSION MODELS (additive only).

Extends the existing Conversation / ConversationParticipant / Message
tables WITHOUT touching their existing columns. All new tables/columns
are nullable or have defaults so legacy rows keep working.
Never DROP/TRUNCATE/DELETE here: Base.metadata.create_all() only
creates missing tables.
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


def register_communication_models(Base):
    """Define additive communication models on the shared Base.

    Called from models.py so every model shares one declarative Base
    (required for Base.metadata.create_all to create all tables).
    Safe to call once at import time.
    """

    class ConversationPreference(Base):
        """Per-user conversation settings (pin/mute/archive)."""

        __tablename__ = "conversation_preferences"

        id = Column(Integer, primary_key=True, index=True)
        conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
        user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
        is_pinned = Column(Boolean, default=False, nullable=False)
        is_muted = Column(Boolean, default=False, nullable=False)
        is_archived = Column(Boolean, default=False, nullable=False)
        last_read_message_id = Column(Integer, nullable=True)
        updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

        __table_args__ = (
            UniqueConstraint("conversation_id", "user_id", name="uq_conv_pref"),
        )

    class MessageReaction(Base):
        """Emoji reactions persisted per message + user + emoji."""

        __tablename__ = "message_reactions"

        id = Column(Integer, primary_key=True, index=True)
        message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
        user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
        emoji = Column(String(16), nullable=False)
        created_at = Column(DateTime, default=func.now(), nullable=False)

        __table_args__ = (
            UniqueConstraint("message_id", "user_id", "emoji", name="uq_msg_reaction"),
        )

    class MessageAttachment(Base):
        """Validated file attachments linked to a message."""

        __tablename__ = "message_attachments"

        id = Column(Integer, primary_key=True, index=True)
        message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
        conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
        uploader_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
        stored_name = Column(String, nullable=False)
        original_name = Column(String, nullable=False)
        mime_type = Column(String, nullable=False)
        size_bytes = Column(Integer, nullable=False, default=0)
        kind = Column(String, nullable=False, default="file")
        created_at = Column(DateTime, default=func.now(), nullable=False)

    class CallRecord(Base):
        """Real call history (signalled via WebSocket/WebRTC, persisted here)."""

        __tablename__ = "call_records"

        id = Column(Integer, primary_key=True, index=True)
        conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True, index=True)
        room = Column(String, nullable=False, index=True)
        call_type = Column(String, nullable=False, default="voice")
        initiator_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
        status = Column(String, nullable=False, default="ended", index=True)
        started_at = Column(DateTime, default=func.now(), nullable=False)
        ended_at = Column(DateTime, nullable=True)
        duration_seconds = Column(Integer, nullable=True)

    class CallParticipant(Base):
        __tablename__ = "call_participants"

        id = Column(Integer, primary_key=True, index=True)
        call_id = Column(Integer, ForeignKey("call_records.id", ondelete="CASCADE"), nullable=False, index=True)
        user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
        joined_at = Column(DateTime, default=func.now(), nullable=False)
        left_at = Column(DateTime, nullable=True)

        __table_args__ = (
            UniqueConstraint("call_id", "user_id", name="uq_call_participant"),
        )

    return {
        "ConversationPreference": ConversationPreference,
        "MessageReaction": MessageReaction,
        "MessageAttachment": MessageAttachment,
        "CallRecord": CallRecord,
        "CallParticipant": CallParticipant,
    }
