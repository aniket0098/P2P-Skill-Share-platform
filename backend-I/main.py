import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, field_validator

from database import Base, engine, SessionLocal
from models import (
    User,
    Project,
    LearningRecord,
    LearningResource,
    Activity,
    ConnectionRequest,
    Connection,
    Conversation,
    ConversationParticipant,
    Message,
)
# SQLAlchemy helpers used across the request/message endpoints.
from sqlalchemy import or_, and_, func
import auth
import config

app = FastAPI()

Base.metadata.create_all(bind=engine)


# ==========================================
# PUBLIC USER ID
# ==========================================
# Human-friendly unique identifier shown on every profile
# (e.g. "SC-8F42K7"). It is generated at signup and also
# backfilled for existing users by the startup migration.

PUBLIC_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
PUBLIC_ID_PREFIX = "SC-"


def generate_public_id() -> str:
    return PUBLIC_ID_PREFIX + "".join(
        secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(6)
    )


def allocate_public_id(db) -> str:
    """Generate a public user ID that is unique in the users table."""
    for _ in range(50):
        candidate = generate_public_id()
        exists = (
            db.query(User).filter(User.public_id == candidate).first()
        )
        if not exists:
            return candidate
    raise HTTPException(status_code=500, detail="Could not allocate a unique user ID")


# ==========================================
# LIGHTWEIGHT SCHEMA MIGRATION
# ==========================================
# Base.metadata.create_all() only creates missing tables; it never
# alters existing ones. These idempotent ALTERs add the public
# profile columns to the existing users table on startup.

def _run_startup_migrations():
    from sqlalchemy import text

    statements = [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS skills VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS interests VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR",
        # Explore Skills: learning_resources already created by
        # Base.metadata.create_all(); the learning_records additions
        # below prepare My Learning tracking (started/in_progress/
        # completed + last accessed + time spent) without analytics.
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS resource_id INTEGER",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0",
    ]
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

    # Backfill public IDs for existing users (idempotent).
    with engine.begin() as connection:
        rows = connection.execute(
            text("SELECT id FROM users WHERE public_id IS NULL")
        ).fetchall()
        for (user_id,) in rows:
            for _ in range(50):
                candidate = generate_public_id()
                taken = connection.execute(
                    text("SELECT 1 FROM users WHERE public_id = :pid"),
                    {"pid": candidate},
                ).fetchone()
                if not taken:
                    connection.execute(
                        text("UPDATE users SET public_id = :pid WHERE id = :uid"),
                        {"pid": candidate, "uid": user_id},
                    )
                    break


_run_startup_migrations()


# ==========================================
# CORS
# ==========================================
# Local development: any localhost / 127.0.0.1 origin (Live Server,
# python -m http.server, etc.) or file:// (Origin: null) is allowed.
# Production: set the FRONTEND_URL environment variable (comma-separated
# list) on the backend host (Render) — e.g. the future Vercel URL.

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_origins=["null", *config.FRONTEND_URLS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# REQUEST SCHEMAS
# ==========================================


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UpdateProfileSchema(BaseModel):
    """Editable fields for the authenticated user's own profile.
    The current user is derived from the JWT only — the frontend
    never supplies an owner/user_id. Optional fields are applied
    only when present (partial update / PATCH semantics)."""
    name: str | None = None
    username: str | None = None
    bio: str | None = None
    skills: list | None = None
    interests: list | None = None
    location: str | None = None
    website: str | None = None
    avatar_url: str | None = None

    @field_validator("skills", "interests", mode="before")
    @classmethod
    def _coerce_tag_list(cls, value):
        """Accept either a JSON array or a comma-separated string
        (the frontend sends e.g. "Python, FastAPI")."""
        if isinstance(value, str):
            value = value.strip()
            return [part.strip() for part in value.split(",") if part.strip()] or None
        return value


USERNAME_PATTERN = re.compile(r"^[a-zA-Z0-9_]{3,24}$")


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def validate_signup_data(data: SignupRequest):
    if not data.name or len(data.name.strip()) < 2:
        raise HTTPException(
            status_code=400, detail="Name must be at least 2 characters"
        )

    if not EMAIL_PATTERN.match(data.email.strip()):
        raise HTTPException(
            status_code=400, detail="Please enter a valid email address"
        )

    if len(data.password) < 6:
        raise HTTPException(
            status_code=400, detail="Password must be at least 6 characters"
        )


# ==========================================
# SIGNUP
# ==========================================


@app.post("/signup")
def signup(data: SignupRequest, db: Session = Depends(get_db)):

    validate_signup_data(data)

    email = data.email.strip().lower()

    existing_user = db.query(User).filter(User.email == email).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = User(
        name=data.name.strip(),
        email=email,
        public_id=allocate_public_id(db),
        created_at=func.now(),
        # Password is stored as a bcrypt hash using the existing auth module
        password_hash=auth.hash_password(data.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "Account created successfully",
        "user": {
            "id": new_user.id,
            "public_id": new_user.public_id,
            "name": new_user.name,
            "email": new_user.email,
        },
    }


# ==========================================
# LOGIN
# ==========================================


@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):

    email = data.email.strip().lower()
    password = data.password

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    user = db.query(User).filter(User.email == email).first()

    if not user or not auth.verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    access_token = auth.create_access_token({"sub": str(user.id)})

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "public_id": user.public_id,
            "name": user.name,
            "email": user.email,
        },
    }


# ==========================================
# CURRENT USER (PROTECTED)
#
# The identity of the logged-in user is derived from the JWT
# "sub" claim ONLY and then resolved against the PostgreSQL
# `users` table. A user_id sent by the frontend (query param,
# header, or request body) is NEVER accepted as the source of
# truth for the current user.
# ==========================================

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_model(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Resolve the real User SQLAlchemy record for the request.

    The lookup key comes exclusively from the signed JWT "sub"
    claim (set at login time by /login). If the token is missing,
    invalid, expired, or refers to a deleted user, the request is
    rejected with 401 before any endpoint logic runs.
    """

    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = auth.decode_access_token(credentials.credentials)

    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_id = payload.get("sub")

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    try:
        user_pk = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.id == user_pk).first()

    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")

    return user


def get_current_user(
    current_user: User = Depends(get_current_user_model),
) -> dict:
    """Dict view of the authenticated user (used by existing endpoints)."""
    return {
        "id": current_user.id,
        "public_id": current_user.public_id,
        "name": current_user.name,
        "email": current_user.email,
    }


def serialize_current_user(user: User) -> dict:
    """Full, safe serialization of the authenticated user's own
    database record. Never exposes password_hash or other secrets."""
    return {
        "id": user.id,
        "public_id": user.public_id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "skills": user.skills,
        "interests": user.interests,
        "avatar_url": user.avatar_url,
        "location": user.location,
        "website": user.website,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@app.get("/me")
@app.get("/users/me")
def me(current_user: User = Depends(get_current_user_model)):
    """
    Current authenticated user, straight from PostgreSQL.

    GET /me and GET /users/me are equivalent. The returned record
    always reflects the live database row for the JWT subject.
    """
    return {"user": serialize_current_user(current_user)}



@app.patch("/users/me")
@app.patch("/api/users/me")
def update_current_user(
    data: UpdateProfileSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_model),
):
    """Update the authenticated user's own profile record.

    The target user is derived from the JWT only (get_current_user_model).
    There is no user_id in the request body, so it is impossible to
    edit another user's profile by manipulating the frontend.
    """
    update: dict = {}

    if data.name is not None:
        clean_name = data.name.strip()
        if len(clean_name) < 2:
            raise HTTPException(
                status_code=400, detail="Name must be at least 2 characters"
            )
        current_user.name = clean_name

    if data.username is not None:
        # Strip a leading "@" so "@aniket_dev" and "aniket_dev" are equal.
        clean_username = data.username.strip().lstrip("@")
        if clean_username == "":
            current_user.username = None
        else:
            if not USERNAME_PATTERN.match(clean_username):
                raise HTTPException(
                    status_code=400,
                    detail="Username must be 3-24 characters (letters, numbers, underscores only)",
                )
            existing = (
                db.query(User)
                .filter(
                    User.username == clean_username,
                    User.id != current_user.id,
                )
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=409,
                    detail="That username is already taken",
                )
            current_user.username = clean_username

    if data.bio is not None:
        current_user.bio = data.bio.strip() or None

    if data.location is not None:
        current_user.location = data.location.strip() or None

    if data.website is not None:
        current_user.website = data.website.strip() or None

    if data.avatar_url is not None:
        current_user.avatar_url = data.avatar_url.strip() or None

    if data.skills is not None:
        # Accept either a CSV string or a list of skill names.
        if isinstance(data.skills, str):
            skills_list = [s.strip() for s in data.skills.split(",") if s.strip()]
        else:
            skills_list = [s.strip() for s in data.skills if str(s).strip()]
        if len(skills_list) > 40:
            raise HTTPException(
                status_code=400, detail="Too many skills (max 40)"
            )
        current_user.skills = ", ".join(skills_list) if skills_list else None

    if data.interests is not None:
        if isinstance(data.interests, str):
            ints_list = [s.strip() for s in data.interests.split(",") if s.strip()]
        else:
            ints_list = [s.strip() for s in data.interests if str(s).strip()]
        current_user.interests = ", ".join(ints_list) if ints_list else None

    # Record persistent activity in PostgreSQL
    db.add(
        Activity(
            user_id=current_user.id,
            activity_type="profile_updated",
            title="Updated profile",
            description="Updated profile information.",
            icon="✓",
        )
    )

    db.commit()
    db.refresh(current_user)
    return {"success": True, "user": serialize_current_user(current_user)}



# ==========================================
# DASHBOARD AGGREGATE (PROTECTED)
#
# Single endpoint that powers the main dashboard page.
# Everything returned here is calculated from real
# PostgreSQL records that belong to the authenticated
# user (or are genuinely public community aggregates).
#
# Identity: derived from the JWT only (get_current_user_model).
# The endpoint accepts NO user_id parameter — there is no way
# to request another user's dashboard data.
# ==========================================


def _split_csv(value) -> list[str]:
    """Split a comma-separated profile field into a clean list."""
    if not value:
        return []
    return [item.strip() for item in str(value).split(",") if item.strip()]


def _naive_utc(dt: datetime) -> datetime:
    """Normalize a datetime to naive UTC so comparisons against
    PostgreSQL timestamps never fail on tz-aware/naive mixing."""
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


# ==========================================
# PUBLIC PLATFORM STATISTICS
# ==========================================
# Real, aggregated counts used by the public marketing pages
# (landing page / about page). No authentication required and
# no user-identifying data is exposed — only totals.

@app.get("/api/stats")
def get_platform_stats(db: Session = Depends(get_db)):
    total_members = db.query(User).count()
    total_connections = (
        db.query(Connection).filter(Connection.status == "active").count()
    )
    total_messages = db.query(Message).count()

    skill_counts: dict[str, int] = {}
    for (skills_csv,) in db.query(User.skills).all():
        for skill_name in _split_csv(skills_csv):
            skill_counts[skill_name.lower()] = (
                skill_counts.get(skill_name.lower(), 0) + 1
            )
    skills_offered = len(skill_counts)

    return {
        "members": total_members,
        "connections": total_connections,
        "messages_exchanged": total_messages,
        "skills_offered": skills_offered,
    }


@app.get("/api/dashboard")
def get_dashboard(
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    me = current_user.id

    # ------------------------------------------------------
    # USER'S OWN SKILLS / INTERESTS (real profile record)
    # ------------------------------------------------------
    skills_list = _split_csv(current_user.skills)
    interests_list = _split_csv(current_user.interests)

    # ------------------------------------------------------
    # STATISTICS calculated from real database records
    # ------------------------------------------------------
    connections_count = (
        db.query(Connection)
        .filter(
            or_(Connection.user_one_id == me, Connection.user_two_id == me),
            Connection.status == "active",
        )
        .count()
    )

    requests_sent = (
        db.query(ConnectionRequest).filter(ConnectionRequest.sender_id == me).count()
    )
    requests_received = (
        db.query(ConnectionRequest).filter(ConnectionRequest.receiver_id == me).count()
    )
    requests_accepted = (
        db.query(ConnectionRequest)
        .filter(
            or_(
                ConnectionRequest.sender_id == me,
                ConnectionRequest.receiver_id == me,
            ),
            ConnectionRequest.status == "accepted",
        )
        .count()
    )
    pending_received = (
        db.query(ConnectionRequest)
        .filter(
            ConnectionRequest.receiver_id == me,
            ConnectionRequest.status == "pending",
        )
        .count()
    )

    messages_sent = db.query(Message).filter(Message.sender_id == me).count()

    days_member = None
    created = _naive_utc(current_user.created_at)
    if created is not None:
        now = _naive_utc(datetime.now(timezone.utc))
        days_member = max((now - created).days, 0)

    # ------------------------------------------------------
    # ACTIVITY CHART — messages sent per day, last 7 days.
    # Generated from real Message rows; days with no activity
    # are simply 0 (the frontend shows a meaningful empty
    # state when the whole week is empty).
    # ------------------------------------------------------
    now = _naive_utc(datetime.now(timezone.utc))
    week_start = (now - timedelta(days=6)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    rows = (
        db.query(Message.created_at)
        .filter(Message.sender_id == me, Message.created_at >= week_start)
        .all()
    )
    per_day = {index: 0 for index in range(7)}
    for (msg_created,) in rows:
        msg_created = _naive_utc(msg_created)
        if msg_created is None:
            continue
        day_index = (msg_created.date() - week_start.date()).days
        if 0 <= day_index <= 6:
            per_day[day_index] += 1

    activity_days = [
        {
            "date": (week_start + timedelta(days=offset)).strftime("%Y-%m-%d"),
            "label": (week_start + timedelta(days=offset)).strftime("%a"),
            "messages_sent": per_day[offset],
        }
        for offset in range(7)
    ]

    # ------------------------------------------------------
    # TRENDING SKILLS — aggregated from every user's real
    # "skills" profile field (how many members teach each).
    # ------------------------------------------------------
    skill_counts: dict[str, dict] = {}
    for (skills_csv,) in db.query(User.skills).all():
        for skill_name in _split_csv(skills_csv):
            key = skill_name.lower()
            entry = skill_counts.setdefault(
                key, {"name": skill_name, "count": 0}
            )
            entry["count"] += 1

    community_skills = sorted(
        skill_counts.values(),
        key=lambda item: (-item["count"], item["name"].lower()),
    )[:8]

    # ------------------------------------------------------
    # RECENTLY ADDED SKILLS — from the newest members who
    # list skills on their real profile records.
    # ------------------------------------------------------
    recent_skill_owners = (
        db.query(User)
        .filter(User.skills.isnot(None), User.skills != "")
        .order_by(User.id.desc())
        .limit(12)
        .all()
    )
    recent_skills: list[dict] = []
    for owner in recent_skill_owners:
        for skill_name in _split_csv(owner.skills):
            recent_skills.append({"name": skill_name, "owner": user_summary(owner)})
            if len(recent_skills) >= 6:
                break
        if len(recent_skills) >= 6:
            break

    # ------------------------------------------------------
    # COMMUNITY SPOTLIGHT — top skill sharers ranked by real
    # accepted connections, then by skills listed.
    # ------------------------------------------------------
    connection_pairs = (
        db.query(Connection.user_one_id, Connection.user_two_id)
        .filter(Connection.status == "active")
        .all()
    )
    connection_counts: dict[int, int] = {}
    for user_one, user_two in connection_pairs:
        connection_counts[user_one] = connection_counts.get(user_one, 0) + 1
        connection_counts[user_two] = connection_counts.get(user_two, 0) + 1

    spotlight_candidates = (
        db.query(User)
        .filter(
            or_(
                User.skills.isnot(None),
                User.id.in_(connection_counts.keys()),
            )
        )
        .all()
    )
    ranked = sorted(
        spotlight_candidates,
        key=lambda u: (
            connection_counts.get(u.id, 0),
            len(_split_csv(u.skills)),
        ),
        reverse=True,
    )
    spotlight = [
        user_summary(u)
        for u in ranked[:3]
        if connection_counts.get(u.id, 0) > 0 or _split_csv(u.skills)
    ]

    # ------------------------------------------------------
    # NOTIFICATIONS — real pending requests + unread messages
    # (replaces the old localStorage notification list).
    # ------------------------------------------------------
    pending_request_rows = (
        db.query(ConnectionRequest)
        .filter(
            ConnectionRequest.receiver_id == me,
            ConnectionRequest.status == "pending",
        )
        .order_by(ConnectionRequest.updated_at.desc())
        .limit(5)
        .all()
    )
    pending_requests = [
        {
            "id": request.id,
            "sender": user_summary(db.get(User, request.sender_id)),
            "skill": request.skill,
            "message": request.message,
            "created_at": (
                request.created_at.isoformat() if request.created_at else None
            ),
        }
        for request in pending_request_rows
    ]

    unread_conversations = []
    for conversation_id in _user_conversation_ids(db, me):
        conv = db.get(Conversation, conversation_id)
        if conv is None:
            continue
        summary = serialize_conversation(db, conv, me)
        if (summary.get("unread_count") or 0) > 0:
            unread_conversations.append(
                {
                    "id": summary["id"],
                    "other_user": summary["other_user"],
                    "unread_count": summary["unread_count"],
                    "last_message": summary["last_message"],
                    "updated_at": summary["updated_at"],
                }
            )
    unread_conversations.sort(
        key=lambda item: item.get("updated_at") or "", reverse=True
    )
    unread_conversations = unread_conversations[:5]

    return {
        "user": serialize_current_user(current_user),
        "stats": {
            "skills_count": len(skills_list),
            "interests_count": len(interests_list),
            "connections_count": connections_count,
            "requests_sent": requests_sent,
            "requests_received": requests_received,
            "requests_accepted": requests_accepted,
            "pending_received": pending_received,
            "messages_sent": messages_sent,
            "days_member": days_member,
        },
        "activity": {
            "days": activity_days,
            "total_messages_sent": messages_sent,
        },
        "community_skills": community_skills,
        "recent_skills": recent_skills,
        "spotlight": spotlight,
        "notifications": {
            "pending_requests": pending_requests,
            "unread_conversations": unread_conversations,
        },
    }


class AddSkillSchema(BaseModel):
    name: str


@app.patch("/api/users/me/skills")
def add_my_skill(
    data: AddSkillSchema,
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Append a skill to the AUTHENTICATED user's own profile
    record (comma-separated `skills` column). The target user
    comes from the JWT only — there is no user_id parameter."""
    skill_name = (data.name or "").strip()

    if not skill_name:
        raise HTTPException(status_code=400, detail="Skill name is required")

    if len(skill_name) > 60:
        raise HTTPException(
            status_code=400, detail="Skill name is too long (max 60 characters)"
        )

    existing = _split_csv(current_user.skills)

    if any(skill.lower() == skill_name.lower() for skill in existing):
        return {
            "success": True,
            "message": "Skill already on your profile",
            "skills": existing,
        }

    updated = existing + [skill_name]
    current_user.skills = ", ".join(updated)

    db.add(
        Activity(
            user_id=current_user.id,
            activity_type="skill_added",
            title=f"Added a new skill: {skill_name}",
            description=f"Added {skill_name} to teaching skills.",
            icon="✓",
        )
    )

    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "message": "Skill added to your profile",
        "skills": _split_csv(current_user.skills),
    }


# =========================================================
# REQUESTS ↔ MESSAGES CONNECTION SYSTEM
#
# Relationship:
#   ConnectionRequest (pending)
#        |  accept
#        v
#   Connection (persistent pair)   -- may already exist
#        |
#        v
#   Conversation (unique per pair) -- may already exist
#        |
#        v
#   Message (stored in PostgreSQL)
#
# Real-time note: a WebSocket endpoint can be added later at
#   /ws/conversations/{conversation_id}
# without changing the HTTP API or the database models below.
# =========================================================

# Avatar mapping for demo/dev users (frontend asset paths).
AVATAR_BY_KEY = {
    "alex": "assets/avatar1.svg",
    "priya": "assets/priya.svg",
    "rohit": "assets/rohit.svg",
    "neha": "assets/neha.svg",
    "rahul": "assets/rahul.svg",
    "aman": "assets/aman.svg",
    "ankit": "assets/ankit.svg",
    "aniket": "assets/ankit.svg",
    "demo": "assets/ankit.svg",
}


class SendRequestSchema(BaseModel):
    receiver_id: int
    message: str | None = None
    skill: str | None = None
    rating: float | None = None


class SendMessageSchema(BaseModel):
    content: str


def user_summary(u):
    """Public, safe summary of a user. Never exposes password hashes
    or any private credentials."""
    if u is None:
        return None
    key = (u.name or "").strip().split()[0].lower()
    return {
        "id": u.id,
        "public_id": getattr(u, "public_id", None),
        "name": u.name,
        # NOTE: email is intentionally NOT returned. It is private
        # account data and must not be exposed to other users.
        "avatar": getattr(u, "avatar_url", None) or AVATAR_BY_KEY.get(
            key, "assets/avatar1.svg"
        ),
        "bio": getattr(u, "bio", None),
        "skills": getattr(u, "skills", None),
        "interests": getattr(u, "interests", None),
    }


def get_pair_connection(db, a, b):
    lo, hi = sorted((a, b))
    return (
        db.query(Connection)
        .filter(Connection.user_one_id == lo, Connection.user_two_id == hi)
        .first()
    )


def find_pair_conversation(db, a, b):
    """Return the single conversation shared by exactly users a and b."""
    pairs = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id.in_([a, b]))
        .group_by(ConversationParticipant.conversation_id)
        .having(func.count(ConversationParticipant.id) == 2)
        .all()
    )
    for (cid,) in pairs:
        pids = [
            row.user_id
            for row in db.query(ConversationParticipant.user_id)
            .filter(ConversationParticipant.conversation_id == cid)
            .all()
        ]
        if sorted(pids) == sorted((a, b)):
            return db.get(Conversation, cid)
    return None


def serialize_request(db, req, current_user_id):
    sender = db.get(User, req.sender_id)
    receiver = db.get(User, req.receiver_id)
    return {
        "id": req.id,
        "sender": user_summary(sender),
        "receiver": user_summary(receiver),
        "status": req.status,
        "message": req.message,
        "skill": req.skill,
        "rating": req.rating,
        "direction": "sent" if req.sender_id == current_user_id else "received",
        "created_at": req.created_at.isoformat() if req.created_at else None,
    }


def serialize_message(db, m):
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "content": m.content,
        "is_read": bool(m.is_read),
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }
def serialize_conversation(db, conv, current_user_id):
    other = None
    for p in (
        db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conv.id)
        .all()
    ):
        if p.user_id != current_user_id:
            other = db.get(User, p.user_id)
            break
    last_msg = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .first()
    )
    unread = (
        db.query(Message)
        .filter(
            Message.conversation_id == conv.id,
            Message.sender_id != current_user_id,
            Message.is_read == False,  # noqa: E712
        )
        .count()
    )
    updated = conv.updated_at or conv.created_at
    if last_msg and last_msg.created_at:
        updated = max(updated, last_msg.created_at) if updated else last_msg.created_at
    return {
        "id": conv.id,
        "other_user": user_summary(other) if other else None,
        "last_message": (
            {"content": last_msg.content, "created_at": last_msg.created_at.isoformat()}
            if last_msg
            else None
        ),
        "unread_count": unread,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": updated.isoformat() if updated else None,
    }


# ---------------------------------------------------------
# USERS (used by "start a new chat / connect" flows)
# ---------------------------------------------------------


@app.get("/api/users")
def list_api_users(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    users = (
        db.query(User).filter(User.id != current_user["id"]).order_by(User.name).all()
    )
    return {"users": [user_summary(u) for u in users]}


def _user_relationship(db, me, user_id):
    """Return the relationship between the authenticated user (me) and user_id.

    Used by search results so the frontend can render the correct button
    state (Connect / Pending / Connected) for every result without a
    second round-trip per user.
    """
    if me == user_id:
        return {"relationship": "self"}

    connection = get_pair_connection(db, me, user_id)
    pending = (
        db.query(ConnectionRequest)
        .filter(
            ConnectionRequest.status == "pending",
            or_(
                and_(
                    ConnectionRequest.sender_id == me,
                    ConnectionRequest.receiver_id == user_id,
                ),
                and_(
                    ConnectionRequest.sender_id == user_id,
                    ConnectionRequest.receiver_id == me,
                ),
            ),
        )
        .first()
    )

    if pending:
        direction = "sent" if pending.sender_id == me else "received"
        return {
            "relationship": "pending",
            "direction": direction,
            "request_id": pending.id,
        }
    if connection:
        return {"relationship": "connected", "connection_id": connection.id}
    return {"relationship": "none"}


@app.get("/api/users/search")
def search_users(
    q: str = "",
    limit: int = 25,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search real registered users by name, email, bio, skills or
    interests. The search runs in PostgreSQL, not in the frontend.

    Each result includes a ``relationship`` field describing how the
    authenticated user is related to that user, so the frontend can
    render the correct action button without additional API calls."""
    term = (q or "").strip()
    me = current_user["id"]
    query = db.query(User).filter(User.id != me)

    if term:
        pattern = f"%{term}%"
        # Matching the term (allows partial "rahu" -> "Rahul" and the
        # public ID without the "SC-" prefix, e.g. "8F42K7").
        term_upper = term.upper()
        query = query.filter(
            or_(
                User.name.ilike(pattern),
                User.public_id.ilike(f"%{term_upper}%"),
                User.email.ilike(pattern),
                User.bio.ilike(pattern),
                User.skills.ilike(pattern),
                User.interests.ilike(pattern),
            )
        )

    rows = query.order_by(User.name).limit(min(max(limit, 1), 50)).all()
    return {
        "users": [
            {**user_summary(u), "relationship": _user_relationship(db, me, u.id)}
            for u in rows
        ],
        "query": term,
    }


@app.get("/api/users/{user_id}")
def get_user_profile(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Public profile of any registered user (no private fields)."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    me = current_user["id"]
    connection = get_pair_connection(db, me, user_id)
    pending = (
        db.query(ConnectionRequest)
        .filter(
            ConnectionRequest.status == "pending",
            or_(
                and_(
                    ConnectionRequest.sender_id == me,
                    ConnectionRequest.receiver_id == user_id,
                ),
                and_(
                    ConnectionRequest.sender_id == user_id,
                    ConnectionRequest.receiver_id == me,
                ),
            ),
        )
        .first()
    )

    conversation_id = None
    if connection is not None:
        conversation = find_pair_conversation(db, me, user_id)
        conversation_id = conversation.id if conversation else None

    return {
        "user": user_summary(user),
        "relationship": {
            "connected": connection is not None,
            "pending_request_id": pending.id if pending else None,
            "pending_direction": (
                "sent"
                if pending and pending.sender_id == me
                else "received" if pending else None
            ),
            "conversation_id": conversation_id,
        },
    }


# ---------------------------------------------------------
# REQUESTS
# ---------------------------------------------------------


@app.post("/api/requests")
def send_request(
    data: SendRequestSchema,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]

    # 1. Receiver must exist
    receiver = db.get(User, data.receiver_id)
    if receiver is None:
        raise HTTPException(status_code=404, detail="User not found")

    # 2. Cannot request yourself
    if data.receiver_id == me:
        raise HTTPException(
            status_code=400, detail="You cannot send a request to yourself"
        )

    # 3. Already connected -> no duplicate connection
    if get_pair_connection(db, me, data.receiver_id):
        raise HTTPException(status_code=409, detail="You are already connected")

    # 4. No duplicate pending request in either direction
    duplicate = (
        db.query(ConnectionRequest)
        .filter(
            ConnectionRequest.status == "pending",
            or_(
                and_(
                    ConnectionRequest.sender_id == me,
                    ConnectionRequest.receiver_id == data.receiver_id,
                ),
                and_(
                    ConnectionRequest.sender_id == data.receiver_id,
                    ConnectionRequest.receiver_id == me,
                ),
            ),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=409, detail="A connection request is already pending"
        )

    # 5. Create the request
    request = ConnectionRequest(
        sender_id=me,
        receiver_id=data.receiver_id,
        message=(data.message or "").strip() or None,
        skill=(data.skill or "").strip() or None,
        rating=data.rating,
        status="pending",
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    return {
        "success": True,
        "request": serialize_request(db, request, me),
    }
@app.get("/api/requests")
def list_requests(
    status: str | None = None,
    direction: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]
    query = db.query(ConnectionRequest).filter(
        or_(ConnectionRequest.sender_id == me, ConnectionRequest.receiver_id == me)
    )
    if status:
        query = query.filter(ConnectionRequest.status == status)
    if direction == "received":
        query = query.filter(ConnectionRequest.receiver_id == me)
    elif direction == "sent":
        query = query.filter(ConnectionRequest.sender_id == me)

    rows = (
        query.order_by(ConnectionRequest.created_at.desc(), ConnectionRequest.id.desc())
        .all()
    )
    return {"requests": [serialize_request(db, r, me) for r in rows]}


@app.get("/api/requests/connections")
def list_connections(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All accepted connections of the logged-in user, each with the
    shared conversation id so the frontend can open a chat."""
    me = current_user["id"]

    rows = (
        db.query(Connection)
        .filter(
            or_(Connection.user_one_id == me, Connection.user_two_id == me),
            Connection.status == "active",
        )
        .order_by(Connection.created_at.desc())
        .all()
    )

    connections = []
    for connection in rows:
        other_id = (
            connection.user_two_id
            if connection.user_one_id == me
            else connection.user_one_id
        )
        other = db.get(User, other_id)
        conversation = find_pair_conversation(db, me, other_id)
        connections.append(
            {
                "id": connection.id,
                "user": user_summary(other),
                "conversation_id": conversation.id if conversation else None,
                "connected_since": (
                    connection.created_at.isoformat()
                    if connection.created_at
                    else None
                ),
            }
        )

    return {"connections": connections}


@app.delete("/api/requests/{request_id}")
def cancel_request(
    request_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cancel a pending request the current user has SENT."""
    me = current_user["id"]
    request = db.get(ConnectionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.sender_id != me:
        raise HTTPException(
            status_code=403, detail="You can only cancel requests you sent"
        )
    if request.status != "pending":
        raise HTTPException(
            status_code=409, detail="This request has already been processed"
        )

    request.status = "cancelled"
    request.updated_at = func.now()
    db.commit()
    db.refresh(request)

    return {
        "success": True,
        "request": serialize_request(db, request, me),
    }


@app.patch("/api/requests/{request_id}/accept")
def accept_request(
    request_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]
    request = db.get(ConnectionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.receiver_id != me:
        raise HTTPException(
            status_code=403, detail="You can only accept requests sent to you"
        )
    if request.status != "pending":
        raise HTTPException(
            status_code=409, detail="This request has already been processed"
        )

    # Single transaction: accept -> connection -> conversation.
    try:
        request.status = "accepted"
        request.updated_at = func.now()

        lo, hi = sorted((request.sender_id, request.receiver_id))

        connection = get_pair_connection(db, lo, hi)
        if connection is None:
            connection = Connection(user_one_id=lo, user_two_id=hi, status="active")
            db.add(connection)
            db.flush()

        conversation = find_pair_conversation(db, lo, hi)
        if conversation is None:
            conversation = Conversation()
            db.add(conversation)
            db.flush()
            db.add(
                ConversationParticipant(conversation_id=conversation.id, user_id=lo)
            )
            db.add(
                ConversationParticipant(conversation_id=conversation.id, user_id=hi)
            )

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500, detail="Could not accept the request. Please try again."
        )

    db.refresh(request)
    return {
        "success": True,
        "request": serialize_request(db, request, me),
        "connection": {"id": connection.id},
        "conversation": {"id": conversation.id},
    }


@app.patch("/api/requests/{request_id}/reject")
def reject_request(
    request_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]
    request = db.get(ConnectionRequest, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.receiver_id != me:
        raise HTTPException(
            status_code=403, detail="You can only reject requests sent to you"
        )
    if request.status != "pending":
        raise HTTPException(
            status_code=409, detail="This request has already been processed"
        )

    request.status = "rejected"
    request.updated_at = func.now()
    db.commit()
    db.refresh(request)

    return {
        "success": True,
        "request": serialize_request(db, request, me),
    }
# ---------------------------------------------------------
# CONVERSATIONS
# ---------------------------------------------------------


def _user_conversation_ids(db, user_id):
    return [
        row.conversation_id
        for row in db.query(ConversationParticipant)
        .filter(ConversationParticipant.user_id == user_id)
        .all()
    ]


def _require_participant(db, conversation_id, user_id):
    participant = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
    )
    if participant is None:
        raise HTTPException(
            status_code=403, detail="You are not part of this conversation"
        )


@app.get("/api/conversations")
def list_conversations(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]
    ids = _user_conversation_ids(db, me)
    conversations = []
    for cid in ids:
        conv = db.get(Conversation, cid)
        if conv:
            conversations.append(serialize_conversation(db, conv, me))

    # ISO strings sort chronologically.
    conversations.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
    return {"conversations": conversations}


@app.get("/api/conversations/{conversation_id}")
def get_conversation(
    conversation_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_participant(db, conversation_id, current_user["id"])
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"conversation": serialize_conversation(db, conv, current_user["id"])}


@app.get("/api/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: int,
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]
    _require_participant(db, conversation_id, me)

    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(min(max(limit, 1), 500))
        .all()
    )
    rows.reverse()

    # Mark incoming messages as read for this user.
    unread = (
        db.query(Message)
        .filter(
            Message.conversation_id == conversation_id,
            Message.sender_id != me,
            Message.is_read == False,  # noqa: E712
        )
        .update({"is_read": True}, synchronize_session=False)
    )
    if unread:
        db.commit()

    return {
        "messages": [serialize_message(db, m) for m in rows],
        "conversation_id": conversation_id,
    }


@app.post("/api/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    data: SendMessageSchema,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    me = current_user["id"]
    _require_participant(db, conversation_id, me)

    content = (data.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    message = Message(
        conversation_id=conversation_id,
        sender_id=me,
        content=content,
        is_read=False,
    )
    db.add(message)
    conv.updated_at = func.now()
    db.commit()
    db.refresh(message)

    return {
        "success": True,
        "message": serialize_message(db, message),
    }


# =========================================================
# PROJECTS API (PostgreSQL backed, single source of truth)
# =========================================================

def serialize_project(db: Session, project: Project) -> dict:
    owner = db.get(User, project.owner_id)
    tech_list = _split_csv(project.technologies)
    return {
        "id": project.id,
        "owner_id": project.owner_id,
        "title": project.title,
        "description": project.description,
        "technologies": tech_list,
        "image_url": project.image_url,
        "status": project.status or "in_progress",
        "github_url": project.github_url,
        "demo_url": project.demo_url,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "owner": user_summary(owner),
    }


class CreateProjectSchema(BaseModel):
    title: str
    description: str | None = None
    technologies: str | list[str] | None = None
    image_url: str | None = None
    status: str | None = "in_progress"
    github_url: str | None = None
    demo_url: str | None = None


@app.get("/api/users/me/projects")
def get_my_projects(
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Return projects created by the authenticated user from PostgreSQL."""
    projects = (
        db.query(Project)
        .filter(Project.owner_id == current_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )
    return {"projects": [serialize_project(db, p) for p in projects]}


@app.get("/api/users/{user_id}/projects")
def get_user_projects(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Return public projects created by a specific user from PostgreSQL."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    projects = (
        db.query(Project)
        .filter(Project.owner_id == user_id)
        .order_by(Project.created_at.desc())
        .all()
    )
    return {"projects": [serialize_project(db, p) for p in projects]}


@app.get("/api/projects")
def list_projects(
    owner_id: int | None = None,
    db: Session = Depends(get_db),
):
    """List shared projects from PostgreSQL, optionally filtered by owner."""
    q = db.query(Project)
    if owner_id is not None:
        q = q.filter(Project.owner_id == owner_id)
    projects = q.order_by(Project.created_at.desc()).all()
    return {"projects": [serialize_project(db, p) for p in projects]}


@app.post("/api/projects")
def create_project(
    data: CreateProjectSchema,
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Create a new project associated with the authenticated user in PostgreSQL."""
    clean_title = (data.title or "").strip()
    if not clean_title:
        raise HTTPException(status_code=400, detail="Project title is required")

    tech_str = None
    if data.technologies:
        if isinstance(data.technologies, str):
            tech_str = ", ".join(_split_csv(data.technologies))
        elif isinstance(data.technologies, list):
            tech_str = ", ".join(
                [str(t).strip() for t in data.technologies if str(t).strip()]
            )

    project = Project(
        owner_id=current_user.id,
        title=clean_title,
        description=(data.description or "").strip() or None,
        technologies=tech_str,
        image_url=(data.image_url or "").strip() or None,
        status=(data.status or "in_progress").strip(),
        github_url=(data.github_url or "").strip() or None,
        demo_url=(data.demo_url or "").strip() or None,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"success": True, "project": serialize_project(db, project)}


# =========================================================
# ACTIVITY API (PostgreSQL database events only)
# =========================================================

def _gather_user_activity(db: Session, target_user: User) -> list[dict]:
    """Compile genuine chronological user activity from PostgreSQL."""
    activities = []

    # 1. Activities logged in PostgreSQL Activity table
    stored_acts = (
        db.query(Activity)
        .filter(Activity.user_id == target_user.id)
        .order_by(Activity.created_at.desc())
        .limit(25)
        .all()
    )
    for a in stored_acts:
        activities.append({
            "id": f"act-db-{a.id}",
            "type": a.activity_type or "community",
            "title": a.title,
            "description": a.description,
            "icon": a.icon or "✓",
            "timestamp": a.created_at.isoformat() if a.created_at else None,
        })

    # 2. Account Creation (if not already logged)
    has_join = any("Joined SkillShare" in a["title"] for a in activities)
    if not has_join and target_user.created_at:
        activities.append({
            "id": f"act-join-{target_user.id}",
            "type": "community",
            "title": "Joined SkillShare",
            "description": "Created account and joined the peer learning community.",
            "icon": "🚀",
            "timestamp": target_user.created_at.isoformat(),
        })

    # 3. Fallback for past skills if not already logged in activities
    skills = _split_csv(target_user.skills)
    for idx, skill in enumerate(skills):
        skill_title = f"Added a new skill: {skill}"
        if not any(skill_title in a["title"] for a in activities):
            activities.append({
                "id": f"act-skill-{target_user.id}-{idx}",
                "type": "teaching",
                "title": skill_title,
                "description": f"Shared {skill} as a skill available to teach.",
                "icon": "⚡",
                "timestamp": target_user.created_at.isoformat() if target_user.created_at else None,
            })

    # 4. Fallback for past projects if not in activities
    projects = (
        db.query(Project)
        .filter(Project.owner_id == target_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )
    for p in projects:
        proj_title = f"Shared project: {p.title}"
        if not any(proj_title in a["title"] for a in activities):
            activities.append({
                "id": f"act-proj-{p.id}",
                "type": "project",
                "title": proj_title,
                "description": p.description or f"Added {p.title} to platform showcase.",
                "icon": "💻",
                "timestamp": p.created_at.isoformat() if p.created_at else None,
            })

    # 5. Fallback for connections if not in activities
    connections = (
        db.query(Connection)
        .filter(
            or_(
                Connection.user_one_id == target_user.id,
                Connection.user_two_id == target_user.id,
            ),
            Connection.status == "active",
        )
        .order_by(Connection.created_at.desc())
        .all()
    )
    for conn in connections:
        other_id = conn.user_two_id if conn.user_one_id == target_user.id else conn.user_one_id
        other_user = db.get(User, other_id)
        other_name = other_user.name if other_user else "a peer"
        conn_title = f"Connected with {other_name}"
        if not any(conn_title in a["title"] for a in activities):
            activities.append({
                "id": f"act-conn-{conn.id}",
                "type": "community",
                "title": conn_title,
                "description": f"Established learning connection with {other_name}.",
                "icon": "🤝",
                "timestamp": conn.created_at.isoformat() if conn.created_at else None,
            })

    # Sort descending by timestamp (nulls at the end)
    activities.sort(
        key=lambda a: a["timestamp"] or "",
        reverse=True,
    )
    return activities


@app.get("/api/users/me/activity")
def get_my_activity(
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Return real database activity for the authenticated user."""
    return {"activities": _gather_user_activity(db, current_user)}


@app.get("/api/users/{user_id}/activity")
def get_user_activity(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Return real database activity for a specific user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"activities": _gather_user_activity(db, user)}


# =========================================================
# LEARNING PROGRESS API (Ground truth from PostgreSQL)
# =========================================================

def _gather_user_learning(db: Session, target_user: User) -> dict:
    """Assemble real learning progress from PostgreSQL.

    Includes the prepared ``resource_id`` / ``last_accessed`` /
    ``time_spent_seconds`` fields so My Learning can later track
    started → in_progress → completed per real resource. No
    analytics are computed here yet (no fake percentages).
    """
    records = (
        db.query(LearningRecord)
        .filter(LearningRecord.user_id == target_user.id)
        .order_by(LearningRecord.updated_at.desc())
        .all()
    )
    if not records:
        return {
            "overall_progress": 0,
            "skills": [],
            "recent_learning": [],
            "has_activity": False,
            "message": "Start learning from Explore Skills to build your learning activity.",
        }

    overall_pct = round(sum(r.progress_percentage for r in records) / len(records))
    skills = [
        {"name": r.skill_name, "progress": r.progress_percentage}
        for r in records
    ]
    recent = [
        {
            "skill": r.skill_name,
            "resource": r.resource_title or "Course",
            "resource_id": r.resource_id,
            "resource_url": (r.resource.url if r.resource else None),
            "progress": r.progress_percentage,
            "status": r.status,
            "last_accessed": r.last_accessed.isoformat() if r.last_accessed else None,
            "time_spent_seconds": r.time_spent_seconds or 0,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in records[:5]
    ]
    return {
        "overall_progress": overall_pct,
        "skills": skills,
        "recent_learning": recent,
        "has_activity": True,
        "message": "Learning records loaded.",
    }


@app.get("/api/users/me/learning")
def get_my_learning(
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Return real learning progress from PostgreSQL."""
    return _gather_user_learning(db, current_user)


@app.get("/api/users/{user_id}/learning")
def get_user_learning(
    user_id: int,
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _gather_user_learning(db, user)


class AddLearningRecordSchema(BaseModel):
    skill_name: str
    resource_id: int | None = None
    resource_title: str | None = None
    resource_type: str | None = "course"
    progress_percentage: int = 0
    # started | in_progress | completed (completed is derived from 100%)
    status: str | None = "in_progress"
    last_accessed: datetime | None = None
    time_spent_seconds: int | None = None

    @field_validator("status")
    @classmethod
    def _validate_status(cls, value):
        if value is None:
            return value
        cleaned = value.strip().lower()
        allowed = {"started", "in_progress", "completed"}
        if cleaned not in allowed:
            raise ValueError("status must be one of: started, in_progress, completed")
        return cleaned

    @field_validator("progress_percentage")
    @classmethod
    def _validate_progress(cls, value):
        return max(0, min(100, int(value or 0)))


@app.post("/api/users/me/learning")
def add_or_update_learning(
    data: AddLearningRecordSchema,
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Enroll or update learning progress in PostgreSQL.

    Accepts an optional ``resource_id`` pointing at a curated
    ``learning_resources`` row so a future My Learning view can track
    started → in_progress → completed per real resource. When a valid
    ``resource_id`` is supplied the skill/title/type fall back to the
    curated row so callers only need to send the id + progress.
    """
    clean_skill = (data.skill_name or "").strip()
    linked_resource = None
    if data.resource_id is not None:
        linked_resource = db.get(LearningResource, data.resource_id)
        if linked_resource is None:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        # A resource always knows its own skill — prefer the curated value
        # so the record can never drift from the resource it points to.
        clean_skill = linked_resource.skill
    if not clean_skill:
        raise HTTPException(status_code=400, detail="Skill name is required")

    record = None
    if linked_resource is not None:
        # One row per (user, resource): re-opening the same resource
        # resumes it instead of creating duplicates.
        record = (
            db.query(LearningRecord)
            .filter(
                LearningRecord.user_id == current_user.id,
                LearningRecord.resource_id == linked_resource.id,
            )
            .first()
        )
    if record is None:
        record = (
            db.query(LearningRecord)
            .filter(
                LearningRecord.user_id == current_user.id,
                func.lower(LearningRecord.skill_name) == clean_skill.lower(),
                LearningRecord.resource_id.is_(None),
            )
            .first()
        )
    is_new = False
    pct = max(0, min(100, data.progress_percentage or 0))
    if pct >= 100:
        status_val = "completed"
    elif pct > 0:
        status_val = "in_progress" if not data.status or data.status == "completed" else data.status
    else:
        status_val = data.status or "started"

    if not record:
        is_new = True
        record = LearningRecord(
            user_id=current_user.id,
            skill_name=clean_skill,
            resource_id=linked_resource.id if linked_resource else None,
            resource_title=(
                (data.resource_title or "").strip()
                or (linked_resource.title if linked_resource else "Course")
            ),
            resource_type=(
                (data.resource_type or "").strip()
                or (linked_resource.resource_type if linked_resource else "course")
            ),
            progress_percentage=pct,
            status=status_val,
            last_accessed=data.last_accessed,
            time_spent_seconds=max(0, int(data.time_spent_seconds or 0)),
        )
        db.add(record)
    else:
        if linked_resource is not None:
            record.resource_id = linked_resource.id
            if not data.resource_title:
                record.resource_title = linked_resource.title
            if not data.resource_type:
                record.resource_type = linked_resource.resource_type
        elif data.resource_title:
            record.resource_title = data.resource_title.strip()
        if data.resource_type:
            record.resource_type = data.resource_type.strip()
        record.skill_name = clean_skill
        record.progress_percentage = pct
        record.status = status_val
        if data.last_accessed is not None:
            record.last_accessed = data.last_accessed
        if data.time_spent_seconds is not None:
            record.time_spent_seconds = max(0, int(data.time_spent_seconds))
        record.updated_at = func.now()

    # Log in activities
    act_title = (
        f"Started learning {clean_skill}"
        if is_new
        else (f"Completed course: {clean_skill}" if pct >= 100 else f"Progressed in {clean_skill}: {pct}%")
    )
    db.add(
        Activity(
            user_id=current_user.id,
            activity_type="learning_completed" if pct >= 100 else "learning_started",
            title=act_title,
            description=f"{record.resource_title or 'Learning resource'} — {pct}% progress",
            icon="✓",
        )
    )

    db.commit()
    return _gather_user_learning(db, current_user)


# =========================================================
# LEARNING RESOURCES API (Curated real learning content)
# =========================================================

def serialize_learning_resource(resource: LearningResource) -> dict:
    """Serialise one curated learning resource for Explore Skills.

    Both ``id`` and ``resource_id`` are returned (same value) so the
    exact requested schema field ``resource_id`` exists on every
    payload while old clients reading ``id`` keep working.
    """
    return {
        "id": resource.id,
        "resource_id": resource.id,
        "title": resource.title,
        "description": resource.description,
        "provider": resource.provider,
        "resource_type": resource.resource_type,
        "skill": resource.skill,
        "topic": resource.topic,
        "url": resource.url,
        "thumbnail_url": resource.thumbnail_url,
        "difficulty": resource.difficulty,
        "estimated_duration": resource.estimated_duration,
        "source_platform": resource.source_platform,
        "published_date": resource.published_date,
        "created_at": resource.created_at.isoformat() if resource.created_at else None,
    }


@app.get("/api/learning-resources")
def list_learning_resources(
    skill: str | None = None,
    resource_type: str | None = None,
    difficulty: str | None = None,
    provider: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    """List curated learning resources with optional filters."""
    q = db.query(LearningResource)

    if skill:
        q = q.filter(func.lower(LearningResource.skill) == skill.lower())
    if resource_type:
        q = q.filter(func.lower(LearningResource.resource_type) == resource_type.lower())
    if difficulty:
        q = q.filter(func.lower(LearningResource.difficulty) == difficulty.lower())
    if provider:
        q = q.filter(func.lower(LearningResource.provider) == provider.lower())
    if search:
        search_term = f"%{search.lower()}%"
        q = q.filter(
            func.lower(LearningResource.title).like(search_term)
            | func.lower(LearningResource.description).like(search_term)
            | func.lower(LearningResource.topic).like(search_term)
        )

    resources = q.order_by(LearningResource.provider, LearningResource.title).all()
    return {
        "resources": [serialize_learning_resource(r) for r in resources],
        "count": len(resources),
    }


@app.get("/api/learning-resources/skills")
def list_learning_skills(db: Session = Depends(get_db)):
    """Return all distinct skills that have learning resources."""
    skills = (
        db.query(LearningResource.skill)
        .distinct()
        .order_by(LearningResource.skill)
        .all()
    )
    return {"skills": [s[0] for s in skills]}


@app.get("/api/learning-resources/providers")
def list_learning_providers(db: Session = Depends(get_db)):
    """Return all distinct providers that have learning resources."""
    providers = (
        db.query(LearningResource.provider)
        .distinct()
        .order_by(LearningResource.provider)
        .all()
    )
    return {"providers": [p[0] for p in providers]}


@app.get("/api/learning-resources/{resource_id}")
def get_learning_resource(
    resource_id: int,
    db: Session = Depends(get_db),
):
    """Return a specific learning resource by ID."""
    resource = db.get(LearningResource, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Learning resource not found")
    return {"resource": serialize_learning_resource(resource)}

