import re
import secrets

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
# CORS (LOCAL DEVELOPMENT ONLY)
# ==========================================
# Allows the frontend while it is served from any
# local development origin (Live Server, python -m
# http.server, etc.) or opened directly from disk.
# This is intentionally NOT a broad production config.

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_origins=["null"],  # pages opened directly via file:// send Origin: null
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
# ==========================================

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):

    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = auth.decode_access_token(credentials.credentials)

    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    user_id = payload.get("sub")

    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()

    if user is None:
        raise HTTPException(status_code=401, detail="User no longer exists")

    return {
        "id": user.id,
        "public_id": user.public_id,
        "name": user.name,
        "email": user.email,
    }


@app.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}
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
