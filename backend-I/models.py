from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Float,
    ForeignKey,
    Boolean,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from database import Base


# Role vocabularies for Phase 1 role-based signup.
# Public signup may ONLY create student/recruiter/mentor.
# "admin" and legacy "tpo"/"college" values are never accepted
# from public signup; existing rows are preserved untouched.
PUBLIC_SIGNUP_ROLES = ("student", "recruiter", "mentor")
ALL_BACKEND_ROLES = ("student", "recruiter", "mentor", "admin")
LEGACY_ROLES = ("tpo", "college", "college_placement", "faculty", "learner")


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

    # Phase 1 role-based access. Nullable so existing rows keep working;
    # new public signups always set student/recruiter/mentor. "admin"
    # is only ever set server-side (init script / approval flow).
    role = Column(String, nullable=True, index=True)
    phone = Column(String, nullable=True)
    account_status = Column(String, nullable=False, default="active")
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=True)

            # Public profile fields (safe to expose, never include secrets).
    # Added for the Request/Message people-discovery experience.
    bio = Column(String, nullable=True)
    skills = Column(String, nullable=True)      # comma-separated: what they can teach
    interests = Column(String, nullable=True)   # comma-separated: what they want to learn
    avatar_url = Column(String, nullable=True)
    # Profile extras surfaced by the Settings → Profile form.
    location = Column(String, nullable=True)
    website = Column(String, nullable=True)

    student_profile = relationship(
        "StudentProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    recruiter_profile = relationship(
        "RecruiterProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    mentor_profile = relationship(
        "MentorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    # Stage 2.2A (additive): a user may OWN opportunities (recruiter accounts)
    # and SUBMIT applications (student accounts). Ownership is always the
    # authenticated user id - never company_name. No existing relationship
    # or column is touched.
    opportunities = relationship(
        "Opportunity", back_populates="owner", cascade="all, delete-orphan",
        foreign_keys="Opportunity.owner_user_id",
    )
    applications = relationship(
        "Application", back_populates="student", cascade="all, delete-orphan",
        foreign_keys="Application.student_user_id",
    )


class StudentProfile(Base):
    """Extended academic/career data for student accounts."""

    __tablename__ = "student_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    college = Column(String, nullable=True)
    degree = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    graduation_year = Column(Integer, nullable=True)
    semester = Column(String, nullable=True)
    cgpa = Column(Float, nullable=True)
    top_skills = Column(Text, nullable=True)
    programming_languages = Column(Text, nullable=True)
    technologies = Column(Text, nullable=True)
    target_job_role = Column(String, nullable=True)
    preferred_industry = Column(String, nullable=True)
    looking_for = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="student_profile")


class RecruiterProfile(Base):
    """Company + hiring data for recruiter accounts."""

    __tablename__ = "recruiter_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    job_title = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    company_website = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    company_size = Column(String, nullable=True)
    company_location = Column(String, nullable=True)
    company_registration = Column(String, nullable=True)
    hiring_for = Column(Text, nullable=True)
    job_roles = Column(Text, nullable=True)
    required_skills = Column(Text, nullable=True)
    internship_availability = Column(String, nullable=True)
    verification_status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="recruiter_profile")


class MentorProfile(Base):
    """Professional + mentorship data for mentor accounts."""

    __tablename__ = "mentor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    job_title = Column(String, nullable=True)
    company = Column(String, nullable=True)
    industry = Column(String, nullable=True)
    years_experience = Column(Float, nullable=True)
    skills = Column(Text, nullable=True)
    expertise_areas = Column(Text, nullable=True)
    linkedin_url = Column(String, nullable=True)
    portfolio_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    available_days = Column(String, nullable=True)
    available_hours = Column(String, nullable=True)
    mentorship_topics = Column(Text, nullable=True)
    mentorship_types = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="mentor_profile")


class AdminAccessRequest(Base):
    """Admin access request workflow. Never creates an admin directly."""

    __tablename__ = "admin_access_requests"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, nullable=False, index=True)
    phone = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    current_role = Column(String, nullable=True)
    reason = Column(Text, nullable=False)
    status = Column(String, nullable=False, default="pending", index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    reviewer = relationship("User", foreign_keys=[reviewed_by])


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

    # Stage 6: optional explicit skill tag (comma-separated) shown alongside
    # technologies on the project evidence card. Never auto-created.
    skills = Column(String, nullable=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=True)


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
    """A conversation thread shared between connected users (direct or group)."""

    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now, nullable=False)
    # Communication-hub extension (additive; legacy rows read as direct).
    conversation_type = Column(String, nullable=False, default="direct")
    group_name = Column(String, nullable=True)
    group_avatar_url = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class ConversationParticipant(Base):
    """Many-to-many link between Conversations and Users."""

    __tablename__ = "conversation_participants"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("conversations.id"), nullable=False, index=True
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Communication-hub extension (additive; legacy rows read as member).
    role = Column(String, nullable=False, default="member")
    joined_at = Column(DateTime, default=func.now(), nullable=True)
    last_read_message_id = Column(Integer, nullable=True)

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
    # Communication-hub extension (additive; legacy rows read as plain messages).
    reply_to_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)
    edited_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)
    forward_from_id = Column(Integer, nullable=True)
    attachment_kind = Column(String, nullable=True)

    def __repr__(self):  # helpful for debugging
        return (
            f"<Message id={self.id} conv={self.conversation_id} "
            f"sender={self.sender_id} read={self.is_read}>"
        )


class LearningRecord(Base):
    """User learning records tracking course progress in PostgreSQL.

    ``resource_id`` optionally links a row to a curated row in
    ``learning_resources`` so My Learning can later show started /
    in-progress / completed progress per real resource. It stays
    nullable so legacy rows (skill-only entries) keep working.
    ``last_accessed`` / ``time_spent_seconds`` are stored now but no
    analytics are computed yet (prepared architecture only).
    """

    __tablename__ = "learning_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    skill_name = Column(String, nullable=False)
    resource_id = Column(
        Integer, ForeignKey("learning_resources.id"), nullable=True, index=True
    )
    resource_title = Column(String, nullable=True)
    resource_type = Column(String, nullable=True)  # course, video, docs, practice
    progress_percentage = Column(Integer, default=0, nullable=False)  # 0 to 100
    status = Column(
        String, default="in_progress", nullable=False
    )  # started, in_progress, completed
    last_accessed = Column(DateTime, nullable=True)
    time_spent_seconds = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(
        DateTime, default=func.now(), onupdate=func.now(), nullable=False
    )

    # ORM relationship to the curated resource (LEFT JOIN friendly:
    # rows with resource_id NULL simply expose ``resource`` as None).
    resource = relationship("LearningResource", lazy="joined")
    watched_seconds = Column(Integer, default=0, nullable=False)
    last_position_seconds = Column(Integer, default=0, nullable=False)
    total_duration_seconds = Column(Integer, nullable=True)


class LearningBookmark(Base):
    """Saved courses/lectures per user. Additive; unique per (user, resource)."""

    __tablename__ = "learning_bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    resource_id = Column(Integer, ForeignKey("learning_resources.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "resource_id", name="uq_learning_bookmark"),)

    resource = relationship("LearningResource", lazy="joined")


class LearningWatchSegment(Base):
    """Unique watched ranges per learning record for cheat-resistant progress.

    Each row is a [start_sec, end_sec) interval of actually-watched video.
    Unique watched time = merged union length. Additive only.
    """

    __tablename__ = "learning_watch_segments"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("learning_records.id", ondelete="CASCADE"), nullable=False, index=True)
    start_sec = Column(Integer, nullable=False, default=0)
    end_sec = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


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

    Field mapping for the requested schema:
      resource_id        -> ``id`` (serialised as both ``id`` and
                            ``resource_id`` by the API so the exact
                            requested field name exists)
      title              -> ``title``
      description        -> ``description``
      provider           -> ``provider`` (Google, Microsoft, IBM, AWS,
                            freeCodeCamp, Kaggle, ...)
      resource_type      -> ``resource_type`` (``video`` | ``course``)
      skill              -> ``skill`` (Python, JavaScript, AI,
                            Machine Learning, FastAPI, Cloud,
                            Data Science)
      topic              -> ``topic``
      URL                -> ``url``
      thumbnail          -> ``thumbnail_url``
      difficulty         -> ``difficulty``
      estimated_duration -> ``estimated_duration`` (only filled when
                            the provider page itself states it)
      source/platform    -> ``source_platform``
      published date     -> ``published_date`` (only filled when known)
      created_at         -> ``created_at``

    Relationships: ``LearningRecord.resource_id`` optionally points
    here (many learning rows -> one curated resource).
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
    duration_seconds = Column(Integer, nullable=True)  # canonical watchable length; peer-hosted sample content only
    media_url = Column(String, nullable=True)  # direct playable file (project-hosted sample MP4) when available
    course_key = Column(String, nullable=True, index=True)  # groups lectures into a course, e.g. "python-fundamentals"
    course_title = Column(String, nullable=True)  # display title of the parent course
    lecture_order = Column(Integer, nullable=True, default=0)  # 1-based order inside a course
    is_lecture = Column(Boolean, nullable=False, default=False)  # True when this row is a watchable lecture
    category = Column(String, nullable=True, index=True)  # Technology | Communication | Career | Business
    source_platform = Column(String, nullable=True)  # YouTube, Coursera, edX, Udacity, Pluralsight, etc.
    published_date = Column(String, nullable=True)  # Year or date published
    created_at = Column(DateTime, default=func.now(), nullable=False)

class Education(Base):
    """Structured education records for a user.
    
    A user may have multiple education records (10th, 12th, B.Tech, M.Tech, etc.).
    Each record belongs to exactly one user and is never shared.
    """
    __tablename__ = "education"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    institution_name = Column(String, nullable=False)
    degree = Column(String, nullable=True)  # e.g. "B.Tech", "M.Sc", "10th"
    field_of_study = Column(String, nullable=True)  # e.g. "Computer Science"
    education_level = Column(String, nullable=True)  # secondary, higher_secondary, undergraduate, postgraduate, doctorate, certification
    
    start_date = Column(String, nullable=True)  # Stored as "YYYY-MM" or "YYYY"
    end_date = Column(String, nullable=True)
    currently_studying = Column(Boolean, default=False)
    
    grade = Column(String, nullable=True)  # e.g. "8.5 CGPA", "85%", "First Division"
    cgpa = Column(Float, nullable=True)
    percentage = Column(Float, nullable=True)
    
    description = Column(String, nullable=True)
    location = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<Education id={self.id} user={self.user_id} institution={self.institution_name!r} degree={self.degree!r}>"


class IndustryDomain(Base):
    """Platform-controlled industry domain catalog (Stage 5, additive)."""

    __tablename__ = "industry_domains"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class JobRole(Base):
    """Platform-controlled job-role catalog (Stage 5, additive)."""

    __tablename__ = "job_roles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, unique=True, nullable=False, index=True)
    domain_id = Column(Integer, ForeignKey("industry_domains.id"), nullable=True, index=True)
    description = Column(String, nullable=True)
    experience_level = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    domain = relationship("IndustryDomain", lazy="joined")
    role_skills = relationship("RoleSkill", back_populates="role", cascade="all, delete-orphan")


class RoleSkill(Base):
    """Structured ROLE -> SKILL requirement (Stage 5, additive)."""

    __tablename__ = "role_skills"

    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("job_roles.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    required_level = Column(String, nullable=False, default="intermediate")
    importance = Column(String, nullable=False, default="medium")
    skill_type = Column(String, nullable=False, default="required")

    __table_args__ = (
        UniqueConstraint("role_id", "skill_id", name="uq_role_skill"),
    )

    role = relationship("JobRole", back_populates="role_skills")
    skill = relationship("Skill", lazy="joined")


class IndustrySkillInsight(Base):
    """Platform industry-demand dataset (Stage 5, additive, demo-labelled)."""

    __tablename__ = "industry_skill_insights"

    id = Column(Integer, primary_key=True, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    domain_id = Column(Integer, ForeignKey("industry_domains.id"), nullable=True, index=True)
    demand_score = Column(Integer, nullable=False, default=50)
    growth_rate = Column(Float, nullable=True)
    outlook = Column(String, nullable=True)
    period = Column(String, nullable=True, default="2026")
    source_type = Column(String, nullable=False, default="platform_sample")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    skill = relationship("Skill", lazy="joined")
    domain = relationship("IndustryDomain", lazy="joined")



class Skill(Base):
    """Master catalog of skills that users can select from.
    
    Skills are normalized so that "Python", "python", and "PYTHON"
    resolve to the same record. UserSkill links users to these
    catalog entries with their self-assessed level.
    """
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    category = Column(String, nullable=True)  # Programming, Web Development, Data Science, AI / Machine Learning, etc.
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f"<Skill id={self.id} name={self.name!r} category={self.category!r}>"


class UserSkill(Base):
    """Links a user to a skill in the catalog with a self-assessed level.
    
    Supports the future skill-evidence system: source_type / source_id
    can later point to the project, assessment, or sandbox submission
    that verified this skill.
    """
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    
    level = Column(String, nullable=False, default="beginner")  # beginner, intermediate, advanced, expert
    years_of_experience = Column(Integer, nullable=True)
    self_rating = Column(Integer, nullable=True)  # 1-5
    
    is_verified = Column(Boolean, default=False)
    verified_by = Column(String, nullable=True)  # e.g. "project", "industry_sandbox", "mentor"
    source_type = Column(String, nullable=True)  # project, assessment, sandbox, learning, mentor_eval, recruiter_eval
    source_id = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "skill_id", name="uq_user_skill"),
    )

    skill = relationship("Skill", lazy="joined")

    def __repr__(self):
        return f"<UserSkill id={self.id} user={self.user_id} skill={self.skill_id} level={self.level!r}>"


# ==========================================================
# STAGE 6 — SKILL EVIDENCE + SKILL HISTORY (additive only)
# ==========================================================
# Generic evidence architecture. Stage 6 populates it from
# "learning" and "project" sources only. Future stages can
# add new source_type values without any schema redesign:
#   sandbox, innovation, coding, aptitude, interview, mentor,
#   recruiter, live_learning, internship, teaching
STAGE6_EVIDENCE_SOURCES = (
    "learning",
    "project",
    "self_reported",
    "sandbox",
    "innovation",
    "coding",
    "aptitude",
    "interview",
    "mentor",
    "recruiter",
    "live_learning",
    "internship",
    "teaching",
    "verified",
)

# Honest evidence labels. "verified" is ONLY used when a real
# verification source exists (never auto-assigned in Stage 6).
STAGE6_CONFIDENCE_LEVELS = (
    "self_reported",
    "learning",
    "project",
    "verified",
)


class SkillEvidence(Base):
    """One explainable piece of proof that a user demonstrated a skill.

    Deduplicated per (user_id, skill_id, source_type, source_id) so the
    same project / learning record never creates duplicate evidence no
    matter how often a page refreshes.
    """

    __tablename__ = "skill_evidence"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String, nullable=False, index=True)  # learning | project | ...
    source_id = Column(Integer, nullable=True, index=True)
    # Explainable 0-100 contribution score (NOT a mastery claim).
    score = Column(Float, nullable=False, default=0.0)
    # Honest label: self_reported | learning | project | verified
    confidence = Column(String, nullable=False, default="self_reported")
    evidence_text = Column(String, nullable=True)
    extra_data = Column(Text, nullable=True)  # JSON string, optional context
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "skill_id", "source_type", "source_id", name="uq_skill_evidence_source"),
    )

    skill = relationship("Skill", lazy="joined")

    def __repr__(self):
        return (
            f"<SkillEvidence id={self.id} user={self.user_id} skill={self.skill_id} "
            f"source={self.source_type}:{self.source_id} score={self.score}>"
        )


class SkillHistory(Base):
    """Append-only timeline of meaningful skill events.

    Only created on real events (learning progress/completion,
    project create/update, evidence evaluation) — never on page views.
    """

    __tablename__ = "skill_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String, nullable=False, index=True)
    from_level = Column(String, nullable=True)
    to_level = Column(String, nullable=True)
    evidence_count = Column(Integer, nullable=True)
    confidence = Column(String, nullable=True)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    skill = relationship("Skill", lazy="joined")

    def __repr__(self):
        return (
            f"<SkillHistory id={self.id} user={self.user_id} skill={self.skill_id} "
            f"event={self.event_type!r}>"
        )



# ================================================================
# STAGE 7 — INDUSTRY SANDBOX MODELS
# ================================================================
# Additive only. These tables are created by Base.metadata.create_all()
# if they do not already exist. No existing table is modified.

class SandboxChallenge(Base):
    __tablename__ = "sandbox_challenges"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    slug = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=False)
    business_context = Column(Text, nullable=True)
    expected_outcome = Column(Text, nullable=True)
    industry = Column(String, nullable=True, index=True)
    domain = Column(String, nullable=True, index=True)
    difficulty = Column(String, nullable=False, index=True)
    estimated_time = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open", index=True)
    company_name = Column(String, nullable=True)
    is_demo = Column(Boolean, default=False, index=True)
    evaluation_criteria = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    creator = relationship("User", lazy="joined")
    skills = relationship("SandboxChallengeSkill", back_populates="challenge", cascade="all, delete-orphan")
    tasks = relationship("SandboxTask", back_populates="challenge", cascade="all, delete-orphan", order_by="SandboxTask.order_index")
    resources = relationship("SandboxResource", back_populates="challenge", cascade="all, delete-orphan")


class SandboxChallengeSkill(Base):
    __tablename__ = "sandbox_challenge_skills"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("sandbox_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_level = Column(String, nullable=True)
    challenge = relationship("SandboxChallenge", back_populates="skills")
    skill = relationship("Skill", lazy="joined")

class SandboxTask(Base):
    __tablename__ = "sandbox_tasks"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("sandbox_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    task_type = Column(String, nullable=False, default="text_response")
    instructions = Column(Text, nullable=True)
    order_index = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    challenge = relationship("SandboxChallenge", back_populates="tasks")


class SandboxResource(Base):
    __tablename__ = "sandbox_resources"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("sandbox_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    resource_type = Column(String, nullable=False, default="link")
    url = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    resource_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    challenge = relationship("SandboxChallenge", back_populates="resources")


class SandboxParticipant(Base):
    __tablename__ = "sandbox_participants"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("sandbox_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False, default="in_progress", index=True)
    started_at = Column(DateTime, default=func.now(), nullable=False)
    completed_at = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_challenge_participant"),)
    challenge = relationship("SandboxChallenge", lazy="joined")
    user = relationship("User", lazy="joined")


class SandboxSubmission(Base):
    __tablename__ = "sandbox_submissions"
    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("sandbox_challenges.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=True)
    github_url = Column(String, nullable=True)
    demo_url = Column(String, nullable=True)
    draft_data = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="draft", index=True)
    attempt = Column(Integer, nullable=False, default=1)
    submitted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("challenge_id", "user_id", "attempt", name="uq_submission_attempt"),)
    challenge = relationship("SandboxChallenge", lazy="joined")


class SandboxEvaluation(Base):
    __tablename__ = "sandbox_evaluations"
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("sandbox_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    overall_score = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    evaluated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    evaluation_type = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    submission = relationship("SandboxSubmission", lazy="joined")
    criteria = relationship("SandboxEvaluationCriterion", back_populates="evaluation", cascade="all, delete-orphan")


# ================================================================
# STAGE 8 — INNOVATION LAB MODELS (additive only, part 1)
# ================================================================
INNOVATION_PROBLEM_SOURCES = ("community", "industry", "platform", "demo")
INNOVATION_IDEA_STATUSES = (
    "draft", "idea", "validating", "building",
    "review", "pitch_ready", "published", "completed", "archived",
)
INNOVATION_MEMBER_STATUSES = ("active", "invited", "declined", "left", "removed")
INNOVATION_MILESTONE_STATUSES = ("todo", "in_progress", "completed")
INNOVATION_FEEDBACK_TYPES = ("peer", "mentor", "faculty", "industry", "community")
INNOVATION_PITCH_STATUSES = ("draft", "ready", "submitted", "reviewed")
INNOVATION_INVITE_STATUSES = ("pending", "accepted", "rejected", "cancelled")


class InnovationProblem(Base):
    __tablename__ = "innovation_problems"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    category = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=False)
    impact = Column(Text, nullable=True)
    difficulty = Column(String, nullable=True)
    skills_text = Column(String, nullable=True)
    team_size = Column(String, nullable=True)
    status = Column(String, nullable=False, default="open", index=True)
    source = Column(String, nullable=False, default="community", index=True)
    source_label = Column(String, nullable=True)
    posted_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    poster = relationship("User", lazy="joined")


class InnovationIdea(Base):
    __tablename__ = "innovation_ideas"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    problem_id = Column(Integer, ForeignKey("innovation_problems.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String, nullable=False)
    problem_statement = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    target_users = Column(Text, nullable=True)
    solution_summary = Column(Text, nullable=True)
    expected_impact = Column(Text, nullable=True)
    category = Column(String, nullable=True, index=True)
    domain = Column(String, nullable=True)
    skills_text = Column(String, nullable=True)
    reference_links = Column(Text, nullable=True)
    image_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="idea", index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    discussion_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    owner = relationship("User", lazy="joined")
    problem = relationship("InnovationProblem", lazy="joined")
    project = relationship("Project", lazy="joined")


class InnovationIdeaSkill(Base):
    __tablename__ = "innovation_idea_skills"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("idea_id", "skill_id", name="uq_innovation_idea_skill"),)
    idea = relationship("InnovationIdea", lazy="joined")
    skill = relationship("Skill", lazy="joined")


class InnovationTeam(Base):
    __tablename__ = "innovation_teams"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    idea = relationship("InnovationIdea", lazy="joined")
    members = relationship("InnovationTeamMember", back_populates="team", cascade="all, delete-orphan")


class InnovationTeamMember(Base):
    __tablename__ = "innovation_team_members"
    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("innovation_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False, default="member")
    status = Column(String, nullable=False, default="active", index=True)
    joined_at = Column(DateTime, default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_innovation_team_user"),)
    team = relationship("InnovationTeam", back_populates="members")
    user = relationship("User", lazy="joined")


class SandboxEvaluationCriterion(Base):
    __tablename__ = "sandbox_evaluation_criteria"
    id = Column(Integer, primary_key=True, index=True)
    evaluation_id = Column(Integer, ForeignKey("sandbox_evaluations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    score = Column(Float, nullable=False)
    max_score = Column(Float, nullable=False, default=100.0)
    comment = Column(Text, nullable=True)
    evaluation = relationship("SandboxEvaluation", back_populates="criteria")


# STAGE 8 part 2 — invites / milestones / feedback / pitches / links


class InnovationInvite(Base):
    __tablename__ = "innovation_invites"
    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("innovation_teams.id", ondelete="CASCADE"), nullable=False, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    inviter_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    invitee_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=True)
    message = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    decided_at = Column(DateTime, nullable=True)
    team = relationship("InnovationTeam", lazy="joined")
    invitee = relationship("User", foreign_keys=[invitee_id], lazy="joined")
    inviter = relationship("User", foreign_keys=[inviter_id], lazy="joined")


class InnovationMilestone(Base):
    __tablename__ = "innovation_milestones"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="todo", index=True)
    due_date = Column(DateTime, nullable=True)
    assignee_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    idea = relationship("InnovationIdea", lazy="joined")
    assignee = relationship("User", foreign_keys=[assignee_id], lazy="joined")


class InnovationFeedback(Base):
    __tablename__ = "innovation_feedback"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_type = Column(String, nullable=False, default="peer")
    message = Column(Text, nullable=False)
    score = Column(Float, nullable=True)
    category = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    idea = relationship("InnovationIdea", lazy="joined")
    author = relationship("User", lazy="joined")


class InnovationFeedbackRequest(Base):
    __tablename__ = "innovation_feedback_requests"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    requester_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewer_role = Column(String, nullable=True)
    message = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="pending", index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    resolved_at = Column(DateTime, nullable=True)


class InnovationPitch(Base):
    __tablename__ = "innovation_pitches"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    problem = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    target_users = Column(Text, nullable=True)
    impact = Column(Text, nullable=True)
    technology = Column(Text, nullable=True)
    demo_url = Column(String, nullable=True)
    github_url = Column(String, nullable=True)
    presentation_url = Column(String, nullable=True)
    video_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="draft", index=True)
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    review_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    idea = relationship("InnovationIdea", lazy="joined")


class InnovationProjectLink(Base):
    __tablename__ = "innovation_project_links"
    id = Column(Integer, primary_key=True, index=True)
    idea_id = Column(Integer, ForeignKey("innovation_ideas.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    linked_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    __table_args__ = (UniqueConstraint("idea_id", "project_id", name="uq_innovation_idea_project"),)
    idea = relationship("InnovationIdea", lazy="joined")
    project = relationship("Project", lazy="joined")


# ================================================================
# STAGE 9 — AI CAREER COACH MODELS (additive only)
# ================================================================
# Persistent per-user AI career-coach threads. These are deliberately
# SEPARATE from the user-to-user Conversation/Message system: coach
# threads belong to exactly one user and contain assistant turns, so
# AI messages never leak into private user-to-user chats.
# Created idempotently by Base.metadata.create_all() at startup.
CAREER_COACH_MODES = (
    "general", "career_planning", "skill_planning", "learning",
    "projects", "sandbox", "innovation", "opportunity", "interview_prep",
)


class CareerCoachConversation(Base):
    __tablename__ = "career_coach_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=True)
    mode = Column(String, nullable=False, default="general", index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    messages = relationship(
        "CareerCoachMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="CareerCoachMessage.id",
    )


class CareerCoachMessage(Base):
    __tablename__ = "career_coach_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(
        Integer, ForeignKey("career_coach_conversations.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    role = Column(String, nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    conversation = relationship("CareerCoachConversation", back_populates="messages")

    def __repr__(self):
        return f"<CareerCoachMessage id={self.id} conv={self.conversation_id} role={self.role!r}>"


# ================================================================
# CAREER JOURNEY — progress tracking through the career pipeline
# ================================================================
# Additive ONLY. These tables define the ordered stages of the
# student -> career pipeline (Profile ... Career) and record each
# user's progress through them. Seeded idempotently at startup.

# Stage slugs — single source of truth for the pipeline order.
CAREER_JOURNEY_STAGES = (
    "profile",                      # 1  Student profile completeness
    "skills_evidence",              # 2  Skills mapped + evidence attached
    "skill_gaps",                   # 3  Gap analysis vs target role
    "target_role",                  # 4  Target role selected/resolved
    "learning",                     # 5  Learning records / resources
    "sandbox",                      # 6  Industry sandbox challenges
    "innovation",                   # 7  Innovation ideas / pitches
    "projects",                     # 8  Project gallery
    "industry_readiness",           # 9  Readiness score computed
    "career_simulation",            # 10 AI career-coach conversations
    "internship_placement_readiness",  # 11 Internship & placement prep
    "career",                       # 12 Final career outcome
)

JOURNEY_STATUS_CHOICES = (
    "locked",        # prerequisites not yet met
    "available",     # ready for the user to begin
    "in_progress",   # user is actively working this stage
    "completed",     # stage finished
)


class CareerJourneyStage(Base):
    """Definition of a single stage in the career journey.

    One row per stage slug. ``order`` drives left-to-right rendering
    of the journey timeline. Seeded idempotently by seed_career_journey.py.
    """

    __tablename__ = "career_journey_stages"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, nullable=False, index=True)      # e.g. "skills_evidence"
    name = Column(String, nullable=False)                               # human title
    description = Column(Text, nullable=True)
    order = Column(Integer, nullable=False, unique=True)                # 1-based ordering
    icon = Column(String, nullable=True)                                # emoji or icon key
    created_at = Column(DateTime, default=func.now(), nullable=False)


class UserJourneyProgress(Base):
    """Per-user, per-stage progress record.

    Unique on (user_id, stage_id) so a user has exactly one progress
    row per stage. ``status`` moves locked -> available -> in_progress
    -> completed. ``metadata_json`` is a free-form JSON blob for
    stage-specific references (e.g. last evidence id, readiness score).
    """

    __tablename__ = "user_journey_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    stage_id = Column(
        Integer, ForeignKey("career_journey_stages.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    status = Column(String, nullable=False, default="locked", index=True)
    progress_pct = Column(Float, nullable=False, default=0.0)          # 0-100
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    metadata_json = Column(Text, nullable=True)                        # JSON string
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "stage_id", name="uq_user_journey_stage"),
    )

    user = relationship("User", lazy="joined")
    stage = relationship("CareerJourneyStage", lazy="joined")

    def __repr__(self):
        return (
            f"<UserJourneyProgress user={self.user_id} "
            f"stage_id={self.stage_id} status={self.status!r}>"
        )


class CareerOutcome(Base):
    """Final placement / internship / higher-studies outcome for a user.

    Tied 1:1 to the User. Drives the final **Career** stage and the
    faculty placement-analytics view.
    """

    __tablename__ = "career_outcomes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        unique=True, nullable=False, index=True,
    )
    status = Column(
        String, nullable=False, default="seeking", index=True,
        # seeking | placed | internship | higher_studies | employed | other
    )
    company_name = Column(String, nullable=True)
    role = Column(String, nullable=True)
    package_lpa = Column(Float, nullable=True)                         # CTC in LPA
    placement_date = Column(DateTime, nullable=True)
    internship_name = Column(String, nullable=True)
    internship_start = Column(DateTime, nullable=True)
    internship_end = Column(DateTime, nullable=True)
    higher_studies_institute = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", lazy="joined")

    def __repr__(self):
        return f"<CareerOutcome user={self.user_id} status={self.status!r}>"


# ================================================================
# STAGE 10 — CAREERVERSE: career events + career goals
# ================================================================
# Additive ONLY. CareerVerse is an aggregation layer over existing
# platform data. These tables record career-level progress events
# (broader than SkillHistory, which is per-skill) and lightweight
# career goals that formalize the student's target trajectory.

# Career event types — recorded ONLY from real user actions.
CAREER_EVENT_TYPES = (
    "profile_completed",
    "skill_analyzed",            # skill mapping / evidence computed
    "skill_improved",            # skill level progressed
    "learning_started",
    "learning_completed",
    "project_created",
    "project_completed",
    "sandbox_started",
    "sandbox_submitted",
    "sandbox_evaluated",
    "innovation_created",
    "innovation_milestone",
    "innovation_completed",
    "career_goal_set",
    "readiness_updated",
    "achievement",               # notable milestone (streak, first X)
    "mentor_session",
    "interview_prep_activity",
)

CAREER_EVENT_SOURCES = (
    "profile", "skill", "learning", "project", "sandbox",
    "innovation", "career_goal", "readiness", "mentor",
    "interview_prep", "system",
)

CAREER_GOAL_STATUS = (
    "active", "achieved", "paused", "archived",
)


class CareerEvent(Base):
    """Persistent career-level event log for CareerVerse.

    Every row is traceable to a real source (source_type + source_id
    point at the originating row in its home table). Events are
    generated by recording hooks at real user actions — never fabricated.
    """

    __tablename__ = "career_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    event_type = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    source_type = Column(String, nullable=False, default="system", index=True)
    source_id = Column(Integer, nullable=True)      # id within source_type table
    metadata_json = Column(Text, nullable=True)     # JSON blob for extra context
    created_at = Column(DateTime, default=func.now(), nullable=False, index=True)

    __table_args__ = (
        # Prevent duplicate events for the same source action.
        UniqueConstraint(
            "user_id", "event_type", "source_type", "source_id",
            name="uq_career_event_source",
        ),
    )


class CareerGoal(Base):
    """Lightweight career goal formalizing the student's target.

    target_role / target_domain are free-text (students may aim at roles
    not yet in the JobRole catalog). status tracks progress. Created
    idempotently so re-saving an active goal updates rather than duplicates.
    """

    __tablename__ = "career_goals"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    target_role = Column(String, nullable=False)
    target_domain = Column(String, nullable=True)
    target_level = Column(String, nullable=True)        # e.g. Entry, Mid, Senior
    target_date = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="active", index=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return (
            f"<CareerGoal user={self.user_id} "
            f"role={self.target_role!r} status={self.status!r}>"
        )



# ================================================================
# STAGE 2.2A - ACADEMIA <-> INDUSTRY OPPORTUNITIES (ADDITIVE ONLY)
# ================================================================
# Three NEW tables: opportunities / opportunity_skills / applications.
# No existing model, column, constraint or index is modified, and these
# tables are created by the existing
# Base.metadata.create_all(bind=engine) call on backend start
# (CREATE TABLE only - never an ALTER of a live table).
#
# OWNERSHIP RULE (from the Stage 2.1 audit, non-negotiable):
#   Opportunity.owner_user_id is the AUTHORITATIVE owner and is always the
#   authenticated recruiter user id resolved server-side from the JWT.
#   Opportunity.company_name is ONLY a display snapshot copied server-side
#   from recruiter_profiles.company_name - never an ownership key.
#   No company_id / companies table exists at this stage on purpose: the
#   audit found "Acme" shared by six different recruiter users, so a
#   company string must never be able to grant access to a resource.
#
# SKILL RULE:
#   opportunity_skills.skill_id references the EXISTING skills catalog (the
#   canonical student <-> skill system). No second skill catalog is created.
#   required_level / importance / skill_type copy the RoleSkill (Stage 5)
#   vocabulary so skill_engine.score_role() can score an opportunity
#   directly and the gap / match maths needs no new engine.


class Opportunity(Base):
    """An internship / job / placement / apprenticeship / mini-project.

    Column semantics follow SandboxChallenge (Stage 7) - the closest
    existing precedent - so the two features stay consistent.
    """

    __tablename__ = "opportunities"

    id = Column(Integer, primary_key=True, index=True)

    # AUTHORITATIVE owner: the authenticated recruiter user id, always
    # resolved server-side from the JWT. Never a client-supplied value.
    owner_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )

    # Display-only snapshot copied server-side from
    # recruiter_profiles.company_name. NOT an ownership key, and there is
    # deliberately NO company_id / companies table at this stage.
    company_name = Column(String, nullable=True)

    # Optional frozen company block (JSON text) so a detail page can render
    # an "About the company" section without a Company entity.
    company_profile_snapshot = Column(Text, nullable=True)

    title = Column(String, nullable=False)

    # Human-friendly unique identifier for links, e.g.
    # "frontend-developer-intern-pixelcraft". Mirrors sandbox_challenges.slug
    # (nullable so a later API layer may generate it after insert).
    slug = Column(String, unique=True, index=True, nullable=True)

    # internship | job | placement | apprenticeship | mini_project | part_time
    opportunity_type = Column(String, nullable=False, default="internship", index=True)

    description = Column(Text, nullable=False)
    responsibilities = Column(Text, nullable=True)

    # Human-readable eligibility shown to students. The machine-checkable
    # rules live in the min_ / eligible_ / allowed_ columns below.
    eligibility_text = Column(Text, nullable=True)

    # remote | hybrid | onsite
    work_mode = Column(String, nullable=True, index=True)
    location = Column(String, nullable=True)
    duration = Column(String, nullable=True)       # e.g. "6 months"
    compensation = Column(String, nullable=True)   # e.g. "Rs 25,000 / month"
    openings = Column(Integer, nullable=True, default=1)

    # Applying after this instant is rejected server-side (later stage).
    deadline = Column(DateTime, nullable=True, index=True)
    start_date = Column(DateTime, nullable=True)

    # draft | published | closed | archived - only "published" is public.
    status = Column(String, nullable=False, default="draft", index=True)

    # ---- Optional machine-checkable eligibility (NULL = not enforced) ----
    min_cgpa = Column(Float, nullable=True)
    allowed_graduation_years = Column(String, nullable=True)   # CSV, e.g. "2026, 2027"
    min_graduation_year = Column(Integer, nullable=True)
    max_graduation_year = Column(Integer, nullable=True)
    eligible_degree = Column(String, nullable=True)            # CSV of degrees
    eligible_branch = Column(String, nullable=True)            # CSV of branches

    # Seeded/demo rows are always clearly labelled (never real listings).
    is_demo = Column(Boolean, default=False, index=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    published_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    owner = relationship(
        "User", back_populates="opportunities", foreign_keys=[owner_user_id], lazy="joined"
    )
    skills = relationship(
        "OpportunitySkill", back_populates="opportunity", cascade="all, delete-orphan"
    )
    applications = relationship(
        "Application", back_populates="opportunity", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return (
            f"<Opportunity id={self.id} type={self.opportunity_type!r} "
            f"status={self.status!r} owner={self.owner_user_id}>"
        )
class OpportunitySkill(Base):
    """Structured OPPORTUNITY -> SKILL requirement (same shape as RoleSkill).

    skill_id points at the EXISTING skills catalog, so readiness / gap / match
    maths in skill_engine.score_role() works on an opportunity with no second
    skill system. required_level / importance / skill_type use the Stage 5
    vocabulary (beginner|intermediate|advanced|expert,
    critical|high|medium|low, required|preferred).
    """

    __tablename__ = "opportunity_skills"

    id = Column(Integer, primary_key=True, index=True)
    opportunity_id = Column(Integer, ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_id = Column(Integer, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True)
    required_level = Column(String, nullable=False, default="intermediate")
    importance = Column(String, nullable=False, default="medium")
    skill_type = Column(String, nullable=False, default="required")
    created_at = Column(DateTime, default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("opportunity_id", "skill_id", name="uq_opportunity_skill"),
    )

    opportunity = relationship("Opportunity", back_populates="skills")
    skill = relationship("Skill", lazy="joined")

    def __repr__(self):
        return (
            f"<OpportunitySkill opportunity={self.opportunity_id} "
            f"skill={self.skill_id} level={self.required_level!r}>"
        )


class Application(Base):
    """A student application to one opportunity.

    student_user_id is ALWAYS resolved server-side from the JWT - the API
    layer never accepts a student id from the request body.

    UNIQUE(opportunity_id, student_user_id) is the authoritative
    duplicate-application guard: it holds even when two identical requests
    arrive concurrently (the losing INSERT raises IntegrityError).
    """

    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)

    opportunity_id = Column(Integer, ForeignKey("opportunities.id", ondelete="CASCADE"), nullable=False, index=True)
    student_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # applied | under_review | shortlisted | interview | selected
    # | rejected | withdrawn
    status = Column(String, nullable=False, default="applied", index=True)

    cover_note = Column(Text, nullable=True)

    # Optional frozen eligibility snapshot (JSON text) taken at apply time so
    # a later profile edit is never retroactive.
    snapshot_json = Column(Text, nullable=True)

    applied_at = Column(DateTime, default=func.now(), nullable=False, index=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    status_changed_at = Column(DateTime, nullable=True)

    # Which recruiter acted last (audit trail). SET NULL keeps the
    # application alive if that recruiter account is removed.
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    recruiter_note = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("opportunity_id", "student_user_id", name="uq_opportunity_application"),
    )

    opportunity = relationship("Opportunity", back_populates="applications")
    student = relationship(
        "User", back_populates="applications", foreign_keys=[student_user_id], lazy="joined"
    )
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])

    def __repr__(self):
        return (
            f"<Application id={self.id} opportunity={self.opportunity_id} "
            f"student={self.student_user_id} status={self.status!r}>"
        )

# === COMMUNICATION HUB EXTENSION (additive) ===
# Registers ConversationPreference / MessageReaction / MessageAttachment /
# CallRecord / CallParticipant on the shared Base. No existing model touched.
try:
    from comm_models import register_communication_models as _register_comm_models
    _COMM_MODELS = _register_comm_models(Base)
    ConversationPreference = _COMM_MODELS["ConversationPreference"]
    MessageReaction = _COMM_MODELS["MessageReaction"]
    MessageAttachment = _COMM_MODELS["MessageAttachment"]
    CallRecord = _COMM_MODELS["CallRecord"]
    CallParticipant = _COMM_MODELS["CallParticipant"]
except Exception as _comm_models_err:  # never break import
    print(f"[comm] WARNING: communication models not registered: {_comm_models_err}")


# === STAGE 9.4 — NOTIFICATIONS (additive) ===
# Registers the notifications table on the shared Base so create_all()
# also covers fresh databases. The table already existed as portable raw
# DDL inside stage8_service.notify(); this model mirrors those columns
# exactly (id / user_id / type / title / message / link / is_read /
# created_at) so the same table stays the ONLY notification store. Rows
# belong to exactly one user (user_id) and are read by that user only.
class Notification(Base):
    """One server-side notification row for one user.

    The notifications table is the platform's single notification store:
    stage8_service.notify() has been writing to it with portable raw DDL
    since Stage 8, and Stage 9.4 adds the read/mark-read API plus the
    application-status writer. Columns intentionally mirror that raw DDL
    so an existing database and a fresh create_all() database agree.
    """

    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Notification family (innovation, innovation_invite, application_status, ...)
    # capped at 50 chars to match the existing raw-DDL writer.
    type = Column(String(50), nullable=True, default="general")
    title = Column(String(200), nullable=True)
    message = Column(Text, nullable=True)
    link = Column(String(500), nullable=True, default="")
    is_read = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=True)

    def __repr__(self):
        return (
            f"<Notification id={self.id} user={self.user_id} "
            f"type={self.type!r} read={self.is_read}>"
        )


# === STAGE 32 — SETTINGS (additive) ===
# Per-account privacy + notification preferences: exactly ONE row per
# user. Every column maps to a real server-side enforced behavior:
#   profile_visibility -> GET /api/users/{id} + /api/users/search
#   discoverable       -> people search + collaborator discovery
#   allow_messages     -> new direct-conversation creation (comm_api)
#   notification_prefs -> stage8_service.notify() category filter
# A MISSING row means platform defaults (public / discoverable /
# messages allowed / every notification category enabled), so existing
# users keep today's behavior with zero migration. notification_prefs
# is TEXT holding a JSON object so the portable raw DDL used on legacy
# databases matches PostgreSQL and SQLite exactly (same pattern as the
# notifications table). No existing table, column or row is touched.
class UserSettings(Base):
    """One server-side settings row for one user."""

    __tablename__ = "user_settings"

    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    # "public" (default) | "private" — private profiles 404 for other
    # users and vanish from search/discovery.
    profile_visibility = Column(String, nullable=False, default="public")
    discoverable = Column(Boolean, nullable=False, default=True)
    allow_messages = Column(Boolean, nullable=False, default=True)

    # JSON string, NULL = all categories enabled (see
    # main.DEFAULT_NOTIFICATION_PREFS for the key vocabulary).
    notification_prefs = Column(Text, nullable=True)

    # Additive (Profile rebuild): per-field PUBLIC visibility map stored as
    # JSON TEXT — same portable pattern as notification_prefs, so the raw
    # DDL used on legacy databases matches PostgreSQL and SQLite exactly.
    # NULL = main.DEFAULT_PROFILE_FIELD_VISIBILITY (email/phone stay hidden).
    profile_field_visibility = Column(Text, nullable=True)

    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return (
            f"<UserSettings user={self.user_id} "
            f"visibility={self.profile_visibility!r} "
            f"discoverable={self.discoverable}>"
        )
