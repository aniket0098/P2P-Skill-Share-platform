import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import Base, engine, SessionLocal
from models import (
    User,
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
        "name": user.name,
        "email": user.email,
        "bio": user.bio,
        "skills": user.skills,
        "interests": user.interests,
        "avatar_url": user.avatar_url,
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


@app.get("/api/users/search")
def search_users(
    q: str = "",
    limit: int = 25,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search real registered users by name, email, bio, skills or
    interests. The search runs in PostgreSQL, not in the frontend."""
    term = (q or "").strip()
    query = db.query(User).filter(User.id != current_user["id"])

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
    return {"users": [user_summary(u) for u in rows], "query": term}


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
