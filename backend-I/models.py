from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Float,
    ForeignKey,
    Boolean,
    UniqueConstraint,
    func,
)
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)

    # Public, human-friendly unique identifier shown on profiles
    # (e.g. "SC-8F42K7"). Generated automatically at signup and kept
    # unique with a UNIQUE database constraint. It is independent of
    # the internal integer primary key.
    public_id = Column(String, unique=True, index=True, nullable=True)

    # Optional username handle (e.g. "aniket_dev"). Stored in PostgreSQL
    # so it is the source of truth across Profile, Settings and search.
    username = Column(String, unique=True, index=True, nullable=True)

    # Matches the existing PostgreSQL column "password_hash"
    # (stores the bcrypt hash produced by auth.hash_password)
    password_hash = Column(String, nullable=False)

    # Matches the existing PostgreSQL column "created_at"
    created_at = Column(DateTime, nullable=True)

            # Public profile fields (safe to expose, never include secrets).
    # Added for the Request/Message people-discovery experience.
    bio = Column(String, nullable=True)
    skills = Column(String, nullable=True)      # comma-separated: what they can teach
    interests = Column(String, nullable=True)   # comma-separated: what they want to learn
    avatar_url = Column(String, nullable=True)
    # Profile extras surfaced by the Settings → Profile form.
    location = Column(String, nullable=True)
    website = Column(String, nullable=True)


class Project(Base):
    """A project shared by a user on the platform.

    This is the SINGLE project store for the app — the frontend
    Project Gallery and the Profile page both read from this
    PostgreSQL table (never from localStorage).
    """

    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)

    # Owner resolved server-side from the JWT — never trusted
    # from the request body.
    owner_id = Column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Comma-separated technologies/skills used in the project
    # (same CSV convention as User.skills / User.interests).
    technologies = Column(String, nullable=True)

    # Optional project image (URL or data URL).
    image_url = Column(String, nullable=True)

    # e.g. "in_progress" | "completed" | "planning"
    status = Column(String, nullable=True, default="in_progress")

    github_url = Column(String, nullable=True)
    demo_url = Column(String, nullable=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)


class ConnectionRequest(Base):
    """A connection request sent from one user to another."""

    __tablename__ = "connection_requests"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(
        String,
        nullable=False,
        default="pending",
    )  # pending | accepted | rejected | cancelled
    message = Column(String, nullable=True)
    # Optional skill + rating captured at request time (used by demo cards).
    skill = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Connection(Base):
    """A persistent connection between two users (created on request accept)."""

    __tablename__ = "connections"

    id = Column(Integer, primary_key=True, index=True)
    # Canonical ordering: user_one_id < user_two_id
    # so the same pair can never create two rows.
    user_one_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    user_two_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    status = Column(String, default="active", nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_one_id", "user_two_id", name="uq_connection_pair"
        ),
    )


class Conversation(Base):
    """A conversation thread shared between connected users."""

    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now, nullable=False)


class ConversationParticipant(Base):
    """Many-to-many link between Conversations and Users."""

    __tablename__ = "conversation_participants"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("conversations.id"), nullable=False, index=True
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint(
            "conversation_id", "user_id", name="uq_conv_participant"
        ),
    )


class Message(Base):
    """A single message inside a conversation."""

    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("conversations.id"), nullable=False, index=True
    )
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)

    def __repr__(self):  # helpful for debugging
        return (
            f"<Message id={self.id} conv={self.conversation_id} "
            f"sender={self.sender_id} read={self.is_read}>"
        )


class LearningRecord(Base):
    """User learning records tracking course progress in PostgreSQL."""

    __tablename__ = "learning_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    skill_name = Column(String, nullable=False)
    resource_title = Column(String, nullable=True)
    resource_type = Column(String, nullable=True)  # course, video, docs, practice
    progress_percentage = Column(Integer, default=0, nullable=False)  # 0 to 100
    status = Column(String, default="in_progress", nullable=False)  # in_progress, completed
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )


class Activity(Base):
    """Persistent user activity log stored in PostgreSQL."""

    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    activity_type = Column(String, nullable=False)  # profile_updated, skill_added, project_shared, connected, learning_started, learning_completed, joined
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    icon = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class LearningResource(Base):
    """Curated learning resources from trusted providers.

    Each resource is a real publicly available course or video from
    providers like Google, Microsoft, IBM, AWS, Cisco, NVIDIA, Meta,
    or reputable educational YouTube channels.
    """

    __tablename__ = "learning_resources"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    provider = Column(String, nullable=False)  # Google, Microsoft, IBM, AWS, Cisco, NVIDIA, Meta, YouTube
    resource_type = Column(String, nullable=False)  # video, course
    skill = Column(String, nullable=False, index=True)  # Python, JavaScript, AI, Machine Learning, FastAPI, Cloud, Data Science
    topic = Column(String, nullable=True)  # Specific topic within the skill
    url = Column(String, nullable=False)  # Real public URL
    thumbnail_url = Column(String, nullable=True)
    difficulty = Column(String, nullable=False)  # beginner, intermediate, advanced
    estimated_duration = Column(String, nullable=True)  # e.g., "10 hours", "6 weeks"
    source_platform = Column(String, nullable=True)  # YouTube, Coursera, edX, Udacity, Pluralsight, etc.
    published_date = Column(String, nullable=True)  # Year or date published
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f"<LearningResource id={self.id} title={self.title!r} provider={self.provider!r}>"

