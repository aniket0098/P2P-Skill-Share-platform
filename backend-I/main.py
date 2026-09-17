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
    PUBLIC_SIGNUP_ROLES,
    AdminAccessRequest,
    Education,
    IndustryDomain,
    IndustrySkillInsight,
    JobRole,
    MentorProfile,
    RecruiterProfile,
    RoleSkill,
    Skill,
    SkillEvidence,
    SkillHistory,
    StudentProfile,
    User,
    UserSkill,
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
from sqlalchemy import or_, and_, case, func
import auth
import config
import stage6_service as stage6
from stage6_api import register_stage6
from stage6_api import register_stage6
from stage7_api import register_stage7
from email_service import send_admin_request_notification
from email_service import send_admin_request_notification

app = FastAPI()

# Communication-hub additive migrations (new tables/columns only; never destructive).
try:
    from comm_migrate import run_communication_migrations
    _comm_applied = run_communication_migrations(engine)
    print(f"[comm] additive migrations applied: {_comm_applied} statements")
except Exception as _comm_mig_err:  # never break boot
    print(f"[comm] WARNING: communication migrations skipped: {_comm_mig_err}")

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
        # Phase 1 role-based signup: additive only, existing rows untouched.
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        # Performance helper for type-ahead search. Indexed lookups only;
        # never destructive and never changes auth/data.
        "CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users (LOWER(name))",
        "CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))",
        "CREATE INDEX IF NOT EXISTS idx_conn_req_pair_status ON connection_requests (sender_id, receiver_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_connections_pair ON connections (user_one_id, user_two_id)",
        # Explore Skills: learning_resources already created by
        # Base.metadata.create_all(); the learning_records additions
        # below prepare My Learning tracking (started/in_progress/
        # completed + last accessed + time spent) without analytics.
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS resource_id INTEGER",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER DEFAULT 0",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS watched_seconds INTEGER DEFAULT 0",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS last_position_seconds INTEGER DEFAULT 0",
        "ALTER TABLE learning_records ADD COLUMN IF NOT EXISTS total_duration_seconds INTEGER",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS duration_seconds INTEGER",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS media_url VARCHAR",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS course_key VARCHAR",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS course_title VARCHAR",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS lecture_order INTEGER DEFAULT 0",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS is_lecture BOOLEAN DEFAULT FALSE",
        "ALTER TABLE learning_resources ADD COLUMN IF NOT EXISTS category VARCHAR",
        # Stage 6: Project model gained demo_url/skills/status/image_url.
        # create_all() covers fresh DBs; these ALTERs cover existing DBs.
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS demo_url VARCHAR",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS skills VARCHAR",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'in_progress'",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url VARCHAR",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
    ]
    with engine.begin() as connection:
        for statement in statements:
            try:
                connection.execute(text(statement))
            except Exception as exc:
                # SQLite used by local tests does not support every
                # PostgreSQL index expression. Keep boot safe; search
                # still works without the optional index.
                print(f"[migrate] skipped optional statement: {exc}")

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


def _seed_skills_if_empty(db: Session):
    """Seed a small initial skill catalog if empty. Idempotent."""
    existing = db.query(func.count(Skill.id)).scalar()
    if existing and existing > 0:
        return
    initial_skills = [
        ("Python", "Programming"), ("JavaScript", "Programming"), ("Java", "Programming"),
        ("C++", "Programming"), ("SQL", "Programming"), ("HTML", "Web Development"),
        ("CSS", "Web Development"), ("React", "Web Development"), ("Node.js", "Web Development"),
        ("FastAPI", "Web Development"), ("Data Analysis", "Data Science"),
        ("Machine Learning", "AI / Machine Learning"), ("Deep Learning", "AI / Machine Learning"),
        ("Communication", "Soft Skills"), ("Leadership", "Soft Skills"),
        ("Problem Solving", "Soft Skills"), ("Cloud Computing", "Cloud"),
        ("Cybersecurity", "Cybersecurity"), ("Data Analytics", "Data Analytics"),
        ("Design", "Design"),
    ]
    for name, category in initial_skills:
        db.add(Skill(name=name, category=category))
    db.commit()


# Seed the skill catalog on first startup (idempotent).
_seed_skills_if_empty(SessionLocal())


def _seed_stage5_if_empty():
    """Seed Stage 5 industry dataset. Additive + idempotent, never destructive."""
    try:
        from seed_stage5 import seed_stage5
        seed_stage5(SessionLocal())
    except Exception as exc:  # never break startup; endpoint can retry
        print(f"[stage5] seed skipped: {exc}")


_seed_stage5_if_empty()


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
    # Phase 1 roles. Optional so OLD clients (name/email/password only)
    # keep working — they default to student. Anything outside
    # student/recruiter/mentor (admin, tpo, ...) is rejected with 403.
    role: str | None = None
    phone: str | None = None
    profile: dict | None = None


class AdminAccessRequestIn(BaseModel):
    full_name: str
    email: str
    phone: str | None = None
    organization: str | None = None
    current_role: str | None = None
    reason: str


class RoleProfileUpdate(BaseModel):
    """Role-specific profile edit (Phase 2).

    ``role`` / ``account_status`` are NEVER accepted here — the backend
    derives the user and role from the JWT only, so a client cannot
    escalate privileges by sending {"role": "admin"}.
    """
    phone: str | None = None
    profile: dict | None = None


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

    # SECURITY: never trust the frontend role. Only the three public
    # roles are allowed here; admin/legacy roles get a 403 (not a 400)
    # so automated abuse is unambiguous in logs/tests.
    requested = (data.role or "student").strip().lower()
    if requested not in PUBLIC_SIGNUP_ROLES:
        raise HTTPException(
            status_code=403,
            detail="That role cannot be registered through public signup",
        )
    data.role = requested

    if data.phone is not None:
        digits = re.sub(r"\D", "", data.phone)
        if data.phone.strip() and not (7 <= len(digits) <= 15):
            raise HTTPException(
                status_code=400, detail="Please enter a valid phone number"
            )


# PHASE 1 helpers: validation + storage for role profiles.
def _clean_str(value) -> str:
    return str(value or "").strip()


def _clean_csv(value):
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        parts = [str(v).strip() for v in value if str(v).strip()]
    else:
        parts = [p.strip() for p in str(value).split(",") if p.strip()]
    return ", ".join(parts) if parts else None


def _validate_role_profile(role: str, profile: dict) -> None:
    if role == "student":
        cgpa = profile.get("cgpa")
        if cgpa not in (None, ""):
            try:
                cgpa_val = float(cgpa)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="CGPA must be a number between 0 and 10")
            if not (0 <= cgpa_val <= 10):
                raise HTTPException(status_code=400, detail="CGPA must be between 0 and 10")
        grad = profile.get("graduation_year")
        if grad not in (None, ""):
            try:
                grad_val = int(grad)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Graduation year is invalid")
            if not (1990 <= grad_val <= 2100):
                raise HTTPException(status_code=400, detail="Graduation year is invalid")
    elif role == "recruiter":
        website = _clean_str(profile.get("company_website"))
        if website and not re.match(r"^(https?://|www\.)\S+\.\S+", website):
            raise HTTPException(status_code=400, detail="Company website URL is invalid")
    elif role == "mentor":
        exp = profile.get("years_experience")
        if exp not in (None, ""):
            try:
                exp_val = float(exp)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail="Years of experience must be a number")
            if not (0 <= exp_val <= 80):
                raise HTTPException(status_code=400, detail="Years of experience is invalid")
        for field in ("linkedin_url", "portfolio_url", "github_url"):
            url = _clean_str(profile.get(field))
            if url and not re.match(r"^(https?://|www\.)\S+\.\S+", url):
                raise HTTPException(status_code=400, detail="Professional link URL is invalid")


def _create_role_profile(db: Session, user: User, profile: dict) -> None:
    grad_raw = str(profile.get("graduation_year") or "").strip()
    cgpa_raw = str(profile.get("cgpa") or "").strip()
    exp_raw = str(profile.get("years_experience") or "").strip()
    if user.role == "student":
        db.add(StudentProfile(
            user_id=user.id,
            college=_clean_str(profile.get("college")) or None,
            degree=_clean_str(profile.get("degree")) or None,
            branch=_clean_str(profile.get("branch")) or None,
            graduation_year=int(grad_raw) if grad_raw else None,
            semester=_clean_str(profile.get("semester")) or None,
            cgpa=float(cgpa_raw) if cgpa_raw else None,
            top_skills=_clean_csv(profile.get("top_skills")),
            programming_languages=_clean_csv(profile.get("programming_languages")),
            technologies=_clean_csv(profile.get("technologies")),
            target_job_role=_clean_str(profile.get("target_job_role")) or None,
            preferred_industry=_clean_str(profile.get("preferred_industry")) or None,
            looking_for=_clean_csv(profile.get("looking_for")),
        ))
    elif user.role == "recruiter":
        db.add(RecruiterProfile(
            user_id=user.id,
            job_title=_clean_str(profile.get("job_title")) or None,
            company_name=_clean_str(profile.get("company_name")) or None,
            company_website=_clean_str(profile.get("company_website")) or None,
            industry=_clean_str(profile.get("industry")) or None,
            company_size=_clean_str(profile.get("company_size")) or None,
            company_location=_clean_str(profile.get("company_location")) or None,
            company_registration=_clean_str(profile.get("company_registration")) or None,
            hiring_for=_clean_csv(profile.get("hiring_for")),
            job_roles=_clean_csv(profile.get("job_roles")),
            required_skills=_clean_csv(profile.get("required_skills")),
            internship_availability=_clean_str(profile.get("internship_availability")) or None,
            verification_status="pending",
        ))
    elif user.role == "mentor":
        db.add(MentorProfile(
            user_id=user.id,
            job_title=_clean_str(profile.get("job_title")) or None,
            company=_clean_str(profile.get("company")) or None,
            industry=_clean_str(profile.get("industry")) or None,
            years_experience=float(exp_raw) if exp_raw else None,
            skills=_clean_csv(profile.get("skills")),
            expertise_areas=_clean_csv(profile.get("expertise_areas")),
            linkedin_url=_clean_str(profile.get("linkedin_url")) or None,
            portfolio_url=_clean_str(profile.get("portfolio_url")) or None,
            github_url=_clean_str(profile.get("github_url")) or None,
            available_days=_clean_csv(profile.get("available_days")),
            available_hours=_clean_str(profile.get("available_hours")) or None,
            mentorship_topics=_clean_csv(profile.get("mentorship_topics")),
            mentorship_types=_clean_csv(profile.get("mentorship_types")),
            bio=_clean_str(profile.get("bio")) or None,
        ))


def _sync_profile_skills(user: User, profile: dict) -> None:
    if user.role == "student":
        merged = ", ".join(filter(None, [
            _clean_csv(profile.get("top_skills")) or "",
            _clean_csv(profile.get("programming_languages")) or "",
            _clean_csv(profile.get("technologies")) or "",
        ]))
    elif user.role == "mentor":
        merged = ", ".join(filter(None, [
            _clean_csv(profile.get("skills")) or "",
            _clean_csv(profile.get("expertise_areas")) or "",
        ]))
    elif user.role == "recruiter":
        merged = _clean_csv(profile.get("required_skills")) or ""
    else:
        merged = ""
    if merged:
        user.skills = merged[:2000]


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

    profile = data.profile if isinstance(data.profile, dict) else {}
    _validate_role_profile(data.role, profile)

    new_user = User(
        name=data.name.strip(),
        email=email,
        public_id=allocate_public_id(db),
        created_at=func.now(),
        role=data.role,
        phone=(data.phone or "").strip() or None,
        account_status="active",
        # Password is stored as a bcrypt hash using the existing auth module
        password_hash=auth.hash_password(data.password),
    )

    db.add(new_user)
    db.flush()  # need new_user.id for the profile row
    _create_role_profile(db, new_user, profile)
    # Merge headline skills into the legacy CSV column so existing
    # search/dashboard/stats keep working unchanged.
    _sync_profile_skills(new_user, profile)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "Account created successfully",
        "user": {
            "id": new_user.id,
            "public_id": new_user.public_id,
            "name": new_user.name,
            "email": new_user.email,
            "role": new_user.role,
            "account_status": new_user.account_status,
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
            "role": getattr(user, "role", None),
            "account_status": getattr(user, "account_status", "active"),
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
        "role": getattr(user, "role", None),
        "phone": getattr(user, "phone", None),
        "account_status": getattr(user, "account_status", "active"),
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


# =========================================================
# PHASE 2 — ROLE-BASED PROFILE API (database driven)
#
#   GET /profile/me  ->   authenticated user + role-specific
#                            profile from PostgreSQL (students /
#                            recruiters / mentors / admins).
#   PUT /profile/me  ->   update ONLY the authenticated user's
#                            own role-profile fields. The role and
#                            account_status are derived from the JWT
#                            and can never be changed by the client.
# =========================================================

def _get_role_profile_row(db: Session, user: User):
    role = (user.role or "student").lower()
    if role == "student":
        return (
            user.student_profile
            or db.query(StudentProfile).filter(StudentProfile.user_id == user.id).first()
        )
    if role == "recruiter":
        return (
            user.recruiter_profile
            or db.query(RecruiterProfile).filter(RecruiterProfile.user_id == user.id).first()
        )
    if role == "mentor":
        return (
            user.mentor_profile
            or db.query(MentorProfile).filter(MentorProfile.user_id == user.id).first()
        )
    return None


def serialize_role_profile(user: User, row) -> dict:
    """Role-specific profile fields (lists for CSV columns)."""
    role = (user.role or "student").lower()
    if role == "student"and row:
        return {
            "college": row.college, "degree": row.degree, "branch": row.branch,
            "graduation_year": row.graduation_year, "semester": row.semester,
            "cgpa": row.cgpa,
            "top_skills": _split_csv(row.top_skills),
            "programming_languages": _split_csv(row.programming_languages),
            "technologies": _split_csv(row.technologies),
            "target_job_role": row.target_job_role,
            "preferred_industry": row.preferred_industry,
            "looking_for": _split_csv(row.looking_for),
        }
    if role == "recruiter"and row:
        return {
            "job_title": row.job_title, "company_name": row.company_name,
            "company_website": row.company_website, "industry": row.industry,
            "company_size": row.company_size, "company_location": row.company_location,
            "company_registration": row.company_registration,
            "hiring_for": _split_csv(row.hiring_for), "job_roles": _split_csv(row.job_roles),
            "required_skills": _split_csv(row.required_skills),
            "internship_availability": row.internship_availability,
            "verification_status": row.verification_status or "pending",
        }
    if role == "mentor"and row:
        return {
            "job_title": row.job_title, "company": row.company, "industry": row.industry,
            "years_experience": row.years_experience,
            "skills": _split_csv(row.skills), "expertise_areas": _split_csv(row.expertise_areas),
            "linkedin_url": row.linkedin_url, "portfolio_url": row.portfolio_url,
            "github_url": row.github_url,
            "available_days": _split_csv(row.available_days), "available_hours": row.available_hours,
            "mentorship_topics": _split_csv(row.mentorship_topics),
            "mentorship_types": _split_csv(row.mentorship_types), "bio": row.bio,
        }
    # Admin (or legacy user without a role profile)— no secrets..
    return {}


def serialize_role_profile_payload(user: User, db: Session) -> dict:
    row = _get_role_profile_row(db, user)
    return {
        "user": serialize_current_user(user),
        "role": user.role or "student",
        "profile": serialize_role_profile(user, row) if row else {},
    }


@app.get("/profile/me")
@app.get("/api/profile/me")
def get_role_profile(
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Authenticated user's own role-based profile from PostgreSQL."""
    return serialize_role_profile_payload(current_user, db)


def _apply_role_profile_updates(db: Session, user: User, profile: dict) -> None:
    """Update an existing role-profile row in place (create if missing)."""
    role = (user.role or "student").lower()
    row = _get_role_profile_row(db, user)
    if row is None:
        _create_role_profile(db, user, {})
        db.flush()
        row = _get_role_profile_row(db, user)

    def has(key):
        return key in profile and profile[key] is not None

    def set_if(key, attr=None):
        if has(key):
            setattr(row, attr or key, _clean_str(profile.get(key)) or None)

    def set_list(key, attr=None):
        if has(key):
            setattr(row, attr or key, _clean_csv(profile.get(key)))

    if role == "student":
        set_if("college"); set_if("degree"); set_if("branch"); set_if("semester")
        set_if("target_job_role"); set_if("preferred_industry")
        set_list("top_skills"); set_list("programming_languages"); set_list("technologies")
        set_list("looking_for")
        if has("graduation_year"):
            raw = str(profile.get("graduation_year") or "").strip()
            row.graduation_year = int(raw) if raw else None
        if has("cgpa"):
            raw = str(profile.get("cgpa") or "").strip()
            row.cgpa = float(raw) if raw else None
    elif role == "recruiter":
        set_if("job_title"); set_if("company_name"); set_if("company_website")
        set_if("industry"); set_if("company_size"); set_if("company_location")
        set_if("company_registration"); set_if("internship_availability")
        set_list("hiring_for"); set_list("job_roles"); set_list("required_skills")
        # verification_status is never user-editable; always re-read from DB..
    elif role == "mentor":
        set_if("job_title"); set_if("company"); set_if("industry")
        set_if("available_hours"); set_if("bio")
        set_list("skills"); set_list("expertise_areas"); set_list("available_days")
        set_list("mentorship_topics"); set_list("mentorship_types")
        set_if("linkedin_url"); set_if("portfolio_url"); set_if("github_url")
        if has("years_experience"):
            raw = str(profile.get("years_experience") or "").strip()
            row.years_experience = float(raw) if raw else None
    row.updated_at = func.now()
    _sync_profile_skills(user, profile)


@app.put("/profile/me")
@app.put("/api/profile/me")
def update_role_profile(
    data: RoleProfileUpdate,
    current_user: User = Depends(get_current_user_model),
    db: Session = Depends(get_db),
):
    """Update the authenticated user's own role-specific profile.

    Identity and role come from the JWT ONLY. A body sent with
    {"role": "admin", ...} is ignored — role can never change here."""

    role = (current_user.role or "student").lower()

    if data.phone is not None:
        phone = data.phone.strip()
        digits = re.sub(r"\D", "", phone)
        if phone and not (7 <= len(digits) <= 15):
            raise HTTPException(status_code=400, detail="Please enter a valid phone number")
        current_user.phone = phone or None

    profile = data.profile if isinstance(data.profile, dict) else {}
    _validate_role_profile(role, profile)
    _apply_role_profile_updates(db, current_user, profile)

    db.commit()
    return serialize_role_profile_payload(current_user, db)


# ==========================================
# EDUCATION ENDPOINTS (PROTECTED)
# ==========================================

class EducationIn(BaseModel):
    institution_name: str
    degree: str | None = None
    field_of_study: str | None = None
    education_level: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    currently_studying: bool = False
    grade: str | None = None
    cgpa: float | None = None
    percentage: float | None = None
    description: str | None = None
    location: str | None = None

    @field_validator("institution_name")
    @classmethod
    def institution_required(cls, v):
        if not v or not v.strip():
            raise ValueError("Institution name is required")
        return v.strip()

    @field_validator("cgpa")
    @classmethod
    def cgpa_range(cls, v):
        if v is not None and (v < 0 or v > 10):
            raise ValueError("CGPA must be between 0 and 10")
        return v

    @field_validator("percentage")
    @classmethod
    def percentage_range(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError("Percentage must be between 0 and 100")
        return v


def _serialize_education(row: Education) -> dict:
    return {
        "id": row.id,
        "institution_name": row.institution_name,
        "degree": row.degree,
        "field_of_study": row.field_of_study,
        "education_level": row.education_level,
        "start_date": row.start_date,
        "end_date": row.end_date,
        "currently_studying": row.currently_studying,
        "grade": row.grade,
        "cgpa": row.cgpa,
        "percentage": row.percentage,
        "description": row.description,
        "location": row.location,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@app.get("/api/profile/education")
def get_education(current_user=Depends(get_current_user_model), db=Depends(get_db)):
    rows = db.query(Education).filter(Education.user_id == current_user.id).order_by(Education.id.desc()).all()
    return {"education": [_serialize_education(r) for r in rows]}


@app.post("/api/profile/education")
def add_education(data: EducationIn, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    row = Education(user_id=current_user.id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"education": _serialize_education(row), "message": "Education added successfully"}


@app.patch("/api/profile/education/{education_id}")
def update_education(education_id: int, data: EducationIn, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    row = db.get(Education, education_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Education record not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return {"education": _serialize_education(row), "message": "Education updated successfully"}


@app.delete("/api/profile/education/{education_id}")
def delete_education(education_id: int, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    row = db.get(Education, education_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Education record not found")
    db.delete(row)
    db.commit()
    return {"message": "Education deleted successfully"}


# ==========================================
# SKILL CATALOG + USER SKILLS (PROTECTED)
# ==========================================

class AddUserSkillIn(BaseModel):
    skill_name: str
    level: str = "beginner"
    years_of_experience: int | None = None
    self_rating: int | None = None

    @field_validator("skill_name")
    @classmethod
    def skill_name_required(cls, v):
        if not v or not v.strip():
            raise ValueError("Skill name is required")
        return v.strip()

    @field_validator("level")
    @classmethod
    def level_valid(cls, v):
        allowed = {"beginner", "intermediate", "advanced", "expert"}
        if v and v.lower() not in allowed:
            raise ValueError(f"Level must be one of: {', '.join(allowed)}")
        return v.lower() if v else v

    @field_validator("self_rating")
    @classmethod
    def rating_range(cls, v):
        if v is not None and (v < 1 or v > 5):
            raise ValueError("Self rating must be between 1 and 5")
        return v


class UpdateUserSkillIn(BaseModel):
    level: str | None = None
    years_of_experience: int | None = None
    self_rating: int | None = None

    @field_validator("level")
    @classmethod
    def level_valid(cls, v):
        allowed = {"beginner", "intermediate", "advanced", "expert"}
        if v and v.lower() not in allowed:
            raise ValueError(f"Level must be one of: {', '.join(allowed)}")
        return v.lower() if v else v

    @field_validator("self_rating")
    @classmethod
    def rating_range(cls, v):
        if v is not None and (v < 1 or v > 5):
            raise ValueError("Self rating must be between 1 and 5")
        return v


def _serialize_user_skill(row: UserSkill) -> dict:
    skill_name = row.skill.name if row.skill else "Unknown"
    return {
        "id": row.id,
        "skill_id": row.skill_id,
        "skill_name": skill_name,
        "category": row.skill.category if row.skill else None,
        "level": row.level,
        "years_of_experience": row.years_of_experience,
        "self_rating": row.self_rating,
        "is_verified": row.is_verified,
        "verified_by": row.verified_by,
        "source_type": row.source_type,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@app.get("/api/profile/skills")
def get_user_skills(current_user=Depends(get_current_user_model), db=Depends(get_db)):
    rows = db.query(UserSkill).filter(UserSkill.user_id == current_user.id).all()
    return {"skills": [_serialize_user_skill(r) for r in rows]}


@app.post("/api/profile/skills")
def add_user_skill(data: AddUserSkillIn, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    skill_name_normalized = data.skill_name.strip()
    skill = db.query(Skill).filter(func.lower(Skill.name) == skill_name_normalized.lower()).first()
    if not skill:
        skill = Skill(name=skill_name_normalized, category=None)
        db.add(skill)
        db.flush()
    existing = db.query(UserSkill).filter(
        UserSkill.user_id == current_user.id, UserSkill.skill_id == skill.id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already added this skill")
    row = UserSkill(
        user_id=current_user.id, skill_id=skill.id,
        level=data.level, years_of_experience=data.years_of_experience, self_rating=data.self_rating,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"skill": _serialize_user_skill(row), "message": "Skill added successfully"}


@app.patch("/api/profile/skills/{user_skill_id}")
def update_user_skill(user_skill_id: int, data: UpdateUserSkillIn, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    row = db.get(UserSkill, user_skill_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Skill record not found")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return {"skill": _serialize_user_skill(row), "message": "Skill updated successfully"}


@app.delete("/api/profile/skills/{user_skill_id}")
def delete_user_skill(user_skill_id: int, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    row = db.get(UserSkill, user_skill_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Skill record not found")
    db.delete(row)
    db.commit()
    return {"message": "Skill removed successfully"}


@app.get("/api/skills/catalog")
def search_skill_catalog(q: str = "", limit: int = 20, db: Session = Depends(get_db)):
    query = db.query(Skill)
    if q and q.strip():
        query = query.filter(Skill.name.ilike(f"%{q.strip()}%"))
    skills = query.order_by(Skill.name).limit(limit).all()
    return {"skills": [{"id": s.id, "name": s.name, "category": s.category} for s in skills]}


# ==========================================
# PROFILE COMPLETION (PROTECTED)
# ==========================================

@app.get("/api/profile/completion")
def get_profile_completion(current_user=Depends(get_current_user_model), db=Depends(get_db)):
    """Calculate profile completion percentage from real data."""
    completed = []
    missing = []
    score = 0

    # Basic information (20%)
    basic_score = 0
    if current_user.name and current_user.name.strip():
        basic_score += 5
    if current_user.bio and current_user.bio.strip():
        basic_score += 5
    if current_user.location and current_user.location.strip():
        basic_score += 5
    if current_user.avatar_url and current_user.avatar_url.strip():
        basic_score += 5
    if basic_score >= 15:
        completed.append("basic_information")
    else:
        missing.append("basic_information")
    score += basic_score

    # Education (20%)
    edu_count = db.query(Education).filter(Education.user_id == current_user.id).count()
    if edu_count > 0:
        completed.append("education")
        score += 20
    else:
        missing.append("education")

    # Skills (20%)
    skill_count = db.query(UserSkill).filter(UserSkill.user_id == current_user.id).count()
    if skill_count > 0:
        completed.append("skills")
        score += 20
    else:
        missing.append("skills")

    # Projects (15%)
    proj_count = db.query(Project).filter(Project.owner_id == current_user.id).count()
    if proj_count > 0:
        completed.append("projects")
        score += 15
    else:
        missing.append("projects")

    # Career interests (10%)
    has_interests = bool(current_user.interests and current_user.interests.strip())
    has_target = False
    role_row = _get_role_profile_row(db, current_user)
    if role_row and hasattr(role_row, "target_job_role") and role_row.target_job_role:
        has_target = True
    if has_interests or has_target:
        completed.append("career_interests")
        score += 10
    else:
        missing.append("career_interests")

    # Experience (10%)
    learning_count = db.query(LearningRecord).filter(LearningRecord.user_id == current_user.id).count()
    if learning_count > 0:
        completed.append("experience")
        score += 10
    else:
        missing.append("experience")

    # Achievements (5%)
    conn_count = db.query(Connection).filter(
        (Connection.user_one_id == current_user.id) | (Connection.user_two_id == current_user.id),
        Connection.status == "active",
    ).count()
    verified_skills = db.query(UserSkill).filter(
        UserSkill.user_id == current_user.id, UserSkill.is_verified == True
    ).count()
    if conn_count > 0 or verified_skills > 0:
        completed.append("achievements")
        score += 5
    else:
        missing.append("achievements")

    return {"percentage": score, "completed": completed, "missing": missing}






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
        "username": getattr(u, "username", None),
        # NOTE: email is intentionally NOT returned. It is private
        # account data and must not be exposed to other users.
        "avatar": getattr(u, "avatar_url", None) or AVATAR_BY_KEY.get(
            key, "assets/avatar1.svg"
        ),
        "bio": getattr(u, "bio", None),
        "skills": getattr(u, "skills", None),
        "interests": getattr(u, "interests", None),
        "location": getattr(u, "location", None),
        "website": getattr(u, "website", None),
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
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List other registered users (bounded - never the whole table)."""
    limit = min(max(int(limit or 50), 1), 100)
    users = (
        db.query(User)
        .filter(User.id != current_user["id"])
        .order_by(User.name)
        .limit(limit)
        .all()
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


def _relationships_batched(db, me, user_ids):
    """Return {user_id: relationship} for many users using 3 queries total.

    ``_user_relationship`` runs three queries per user, which becomes
    expensive for a 50-row search page (150 round-trips). This batched
    version answers the whole result set with one query per table while
    returning exactly the same shape.
    """
    ids = [uid for uid in user_ids if uid is not None and uid != me]
    rels = {uid: {"relationship": "none"} for uid in ids}
    if not ids:
        return rels

    # Connected first - a connection is the strongest relationship.
    for conn in (
        db.query(Connection)
        .filter(
            or_(
                and_(Connection.user_one_id == me, Connection.user_two_id.in_(ids)),
                and_(Connection.user_two_id == me, Connection.user_one_id.in_(ids)),
            )
        )
        .all()
    ):
        other = conn.user_two_id if conn.user_one_id == me else conn.user_one_id
        if other in rels:
            rels[other] = {"relationship": "connected", "connection_id": conn.id}

    for req in (
        db.query(ConnectionRequest)
        .filter(
            ConnectionRequest.status == "pending",
            or_(
                and_(
                    ConnectionRequest.sender_id == me,
                    ConnectionRequest.receiver_id.in_(ids),
                ),
                and_(
                    ConnectionRequest.receiver_id == me,
                    ConnectionRequest.sender_id.in_(ids),
                ),
            ),
        )
        .all()
    ):
        other = req.receiver_id if req.sender_id == me else req.sender_id
        # A pending request never overrides an existing connection.
        if other in rels and rels[other]["relationship"] != "connected":
            rels[other] = {
                "relationship": "pending",
                "direction": "sent" if req.sender_id == me else "received",
                "request_id": req.id,
            }

    return rels


@app.get("/api/users/search")
def search_users(
    q: str = "",
    limit: int = 25,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Search real registered users by name, username, public ID, bio,
    skills or interests. The search runs in PostgreSQL, not in the
    frontend.

    Each result includes a ``relationship`` field describing how the
    authenticated user is related to that user, so the frontend can
    render the correct action button without additional API calls.

    Email is never returned — it is only matchable for lookup, while
    the public ``user_summary`` keeps it private.
    """
    term = (q or "").strip()
    me = current_user["id"]
    limit = min(max(int(limit or 25), 1), 50)
    query = db.query(User).filter(User.id != me)

    if term:
        pattern = f"%{term}%"
        # Matching the term (allows partial "rahu" -> "Rahul" and the
        # public ID without the "SC-" prefix, e.g. "8F42K7").
        term_upper = term.upper()
        query = query.filter(
            or_(
                User.name.ilike(pattern),
                User.username.ilike(pattern),
                User.public_id.ilike(f"%{term_upper}%"),
                User.email.ilike(pattern),
                User.bio.ilike(pattern),
                User.skills.ilike(pattern),
                User.interests.ilike(pattern),
            )
        )

    total = query.count()

    # Smart ordering is pushed into the database so we only ever fetch
    # `limit` rows instead of over-fetching and sorting in Python:
    #   0 exact name, 1 exact username, 2 name prefix, 3 username prefix,
    #   4 partial name, 5 partial username, 6 other match (bio/skills/ID).
    if term:
        needle = term.strip().lower()
        rank = case(
            (func.lower(User.name) == needle, 0),
            (func.lower(User.username) == needle, 1),
            (func.lower(User.name).like(f"{needle}%"), 2),
            (func.lower(User.username).like(f"{needle}%"), 3),
            (func.lower(User.name).like(f"%{needle}%"), 4),
            (func.lower(User.username).like(f"%{needle}%"), 5),
            else_=6,
        )
        rows = query.order_by(rank, User.name).limit(limit).all()
    else:
        rows = query.order_by(User.name).limit(limit).all()

    # One batched lookup for every result - never one query per card.
    relationships = _relationships_batched(db, me, [u.id for u in rows])

    return {
        "users": [
            {**user_summary(u), "relationship": relationships.get(u.id,
                                                                 {"relationship": "none"})}
            for u in rows
        ],
        "query": term,
        "total": total,
        # Lets the UI show "See all results" only when more rows really exist.
        "has_more": total > len(rows),
    }


@app.get("/api/users/{user_id}")
def get_user_profile(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Public profile of any registered user (no private fields).

    Reuses the existing UserSkill/Skill, Education and Project tables.
    Never returns password hashes, emails or JWTs.
    """
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    me = current_user["id"]

    skill_rows = (
        db.query(UserSkill, Skill)
        .join(Skill, Skill.id == UserSkill.skill_id)
        .filter(UserSkill.user_id == user_id)
        .order_by(Skill.name)
        .all()
    )
    skills_detail = [
        {
            "id": skill.id,
            "name": skill.name,
            "level": mapping.level,
            "years_of_experience": mapping.years_of_experience,
            "self_rating": mapping.self_rating,
        }
        for mapping, skill in skill_rows
    ]
    education_rows = (
        db.query(Education)
        .filter(Education.user_id == user_id)
        .order_by(Education.id.desc())
        .limit(5)
        .all()
    )
    project_rows = (
        db.query(Project)
        .filter(Project.owner_id == user_id)
        .order_by(Project.created_at.desc(), Project.id.desc())
        .limit(3)
        .all()
    )
    connections_count = (
        db.query(Connection)
        .filter(
            or_(
                Connection.user_one_id == user_id,
                Connection.user_two_id == user_id,
            )
        )
        .count()
    )
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
        "connections_count": connections_count,
        "skills_detail": skills_detail,
        "education": [_serialize_education(r) for r in education_rows],
        "projects_preview": [
            {
                "id": p.id,
                "title": p.title,
                "description": p.description,
                "skills": p.skills,
                "image_url": p.image_url,
            }
            for p in project_rows
        ],
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


@app.delete("/api/connections/{user_id}")
def remove_connection(
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove an accepted connection between the current user and another user.

    Deletes only the single Connection row (additive-safe: never touches
    users, messages, conversations or requests). Uses JWT-derived identity;
    the user_id path parameter is only the target peer.
    """
    me = current_user["id"]
    if me == user_id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")

    row = (
        db.query(Connection)
        .filter(
            Connection.status == "active",
            or_(
                and_(Connection.user_one_id == me, Connection.user_two_id == user_id),
                and_(Connection.user_one_id == user_id, Connection.user_two_id == me),
            ),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Connection not found")

    db.delete(row)
    db.commit()
    return {"success": True, "removed": user_id}


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

def _csv_str(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        cleaned = [str(v).strip() for v in value if str(v or "").strip()]
        return ", ".join(cleaned[:30]) if cleaned else None
    text = str(value).strip()
    return text[:1000] if text else None


def _stage6_sync_project(db, project: Project) -> list:
    """Stage 6: rebuild project skill evidence in the caller's session."""
    import stage6_service as s6

    return s6.sync_project_evidence(db, project)

def serialize_project(db: Session, project: Project) -> dict:
    owner = db.get(User, project.owner_id)
    tech_list = _split_csv(project.technologies)
    skill_list = _split_csv(getattr(project, "skills", None))
    ev_n = (
        db.query(SkillEvidence)
        .filter(
            SkillEvidence.source_type == "project",
            SkillEvidence.source_id == project.id,
        )
        .count()
    )
    return {
        "id": project.id,
        "owner_id": project.owner_id,
        "title": project.title,
        "description": project.description,
        "technologies": tech_list,
        "skills": skill_list,
        "image_url": project.image_url,
        "status": project.status or "in_progress",
        "github_url": project.github_url,
        "demo_url": project.demo_url,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "evidence_count": ev_n,
        "owner": user_summary(owner),
    }


class CreateProjectSchema(BaseModel):
    title: str
    description: str | None = None
    technologies: str | list[str] | None = None
    skills: str | list[str] | None = None
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
        skills=_csv_str(data.skills) if hasattr(data, "skills") else None,
        image_url=(data.image_url or "").strip() or None,
        status=(data.status or "in_progress").strip(),
        github_url=(data.github_url or "").strip() or None,
        demo_url=(data.demo_url or "").strip() or None,
    )
    db.add(project)
    db.flush()
    # Stage 6: project technologies immediately generate deduplicated
    # skill evidence records (source_type="project", source_id=project_id).
    try:
        _stage6_sync_project(db, project)
    except Exception:
        pass  # evidence is additive; project creation must never fail on it
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
        )
    )

    db.commit()
    return _gather_user_learning(db, current_user)


# =========================================================

def serialize_learning_resource(resource: LearningResource) -> dict:
    """Serialise one curated learning resource for Explore Skills."""
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


# STAGE 5 - skill intelligence endpoints (additive).
@app.get("/api/industry/domains")
def s5_domains(db: Session = Depends(get_db)):
    import stage5_service as S
    rows = db.query(IndustryDomain).order_by(IndustryDomain.name).all()
    return {"domains": [{"id": r.id, "name": r.name, "description": r.description} for r in rows], "disclaimer": S.DISCLAIMER}


@app.get("/api/industry/roles")
def s5_roles(domain: str | None = None, search: str | None = None, db: Session = Depends(get_db)):
    import stage5_service as S
    q = db.query(JobRole)
    if domain and domain.strip():
        d = db.query(IndustryDomain).filter(func.lower(IndustryDomain.name) == domain.strip().lower()).first()
        if not d:
            return {"roles": [], "disclaimer": S.DISCLAIMER}
        q = q.filter(JobRole.domain_id == d.id)
    if search and search.strip():
        q = q.filter(JobRole.title.ilike(f"%{search.strip()}%"))
    out = [S.serialize_role(r, S.role_reqs(db, r.id)) for r in q.order_by(JobRole.title).all()]
    return {"roles": out, "disclaimer": S.DISCLAIMER}


@app.get("/api/industry/roles/{role_id}")
def s5_role_one(role_id: int, db: Session = Depends(get_db)):
    import stage5_service as S
    role = db.query(JobRole).filter(JobRole.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"role": S.serialize_role(role, S.role_reqs(db, role.id)), "disclaimer": S.DISCLAIMER}


@app.get("/api/industry/skills")
def s5_skills(domain: str | None = None, category: str | None = None, demand: str | None = None, growth: str | None = None, search: str | None = None, limit: int = 100, db: Session = Depends(get_db)):
    import stage5_service as S
    dom_id = None
    if domain and domain.strip():
        dd = db.query(IndustryDomain).filter(func.lower(IndustryDomain.name) == domain.strip().lower()).first()
        if not dd:
            return {"skills": [], "disclaimer": S.DISCLAIMER}
        dom_id = dd.id
    q = db.query(Skill, IndustrySkillInsight).outerjoin(IndustrySkillInsight, IndustrySkillInsight.skill_id == Skill.id)
    if dom_id:
        q = q.filter((IndustrySkillInsight.domain_id == dom_id) | (IndustrySkillInsight.domain_id.is_(None)) | (IndustrySkillInsight.id.is_(None)))
    if category and category.strip():
        q = q.filter(func.lower(Skill.category) == category.strip().lower())
    if search and search.strip():
        q = q.filter(Skill.name.ilike(f"%{search.strip()}%"))
    rows = q.limit(max(min(limit or 100, 200), 1)).all()
    best = {}
    for sk, ins in rows:
        cur = best.get(sk.id)
        if not cur or (ins and (not cur[1] or (ins.demand_score or 0) > (cur[1].demand_score or 0))):
            best[sk.id] = (sk, ins)
    items = []
    for sk, ins in best.values():
        dn = None
        if ins and ins.domain_id:
            drow = db.query(IndustryDomain).filter(IndustryDomain.id == ins.domain_id).first()
            dn = drow.name if drow else None
        item = S.serialize_industry_skill(sk, ins, dn)
        if demand and demand.strip():
            b = demand.strip().lower(); sc = item["demand_score"]
            if b in ("very high", "very_high") and sc < 90:
                continue
            if b == "high" and sc < 75:
                continue
        if growth and growth.strip():
            g = growth.strip().lower(); ol = (item["outlook"] or "").lower()
            if g in ("high", "fastest", "high_growth") and not (ol in ("high_growth", "growing") or (item["growth_rate"] or 0) >= 8):
                continue
            if g == "declining" and ol != "declining":
                continue
        items.append(item)
    items.sort(key=lambda x: x["demand_score"], reverse=True)
    return {"skills": items, "disclaimer": S.DISCLAIMER}


@app.get("/api/industry/insights")
def s5_insights(domain: str | None = None, limit: int = 50, db: Session = Depends(get_db)):
    import stage5_service as S
    data = s5_skills(domain=domain, limit=limit, db=db)["skills"]
    top = sorted(data, key=lambda x: x["demand_score"], reverse=True)[:10]
    fast = sorted(data, key=lambda x: x["growth_rate"], reverse=True)[:10]
    emerging = [s for s in sorted(data, key=lambda x: x["growth_rate"], reverse=True) if (s["growth_rate"] or 0) >= 8][:10]
    return {"top_skills": top, "fastest_growing": fast, "emerging_skills": emerging, "all": data, "disclaimer": S.DISCLAIMER}


@app.get("/api/skills")
def s5_skill_search(search: str | None = None, limit: int = 100, db: Session = Depends(get_db)):
    q = db.query(Skill)
    if search and search.strip():
        q = q.filter(Skill.name.ilike(f"%{search.strip()}%"))
    rows = q.order_by(Skill.name).limit(max(min(limit or 100, 200), 1)).all()
    return {"skills": [{"id": s.id, "name": s.name, "category": s.category, "description": s.description} for s in rows]}


def serialize_admin_request(req: AdminAccessRequest) -> dict:
    return {
        "id": req.id,
        "full_name": req.full_name,
        "email": req.email,
        "phone": req.phone,
        "organization": req.organization,
        "current_role": req.current_role,
        "reason": req.reason,
        "status": req.status,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "reviewed_at": req.reviewed_at.isoformat() if req.reviewed_at else None,
        "reviewed_by": req.reviewed_by,
    }


def require_admin(current_user: User = Depends(get_current_user_model)) -> User:
    """Gate for admin-only endpoints. Authority comes ONLY from
    users.role == 'admin' in PostgreSQL — never from an email match."""
    if (current_user.role or "").strip().lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@app.post("/admin/requests")
@app.post("/api/admin/requests")
def submit_admin_request(data: AdminAccessRequestIn, db: Session = Depends(get_db)):
    """Public endpoint: file a request for admin access.

    It NEVER creates an admin account — it only stores a pending row
    and notifies MAIN_ADMIN_EMAIL. No authentication required.
    """
    full_name = (data.full_name or "").strip()
    email = (data.email or "").strip().lower()
    reason = (data.reason or "").strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=400, detail="Full name must be at least 2 characters")
    if not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Please explain why you need admin access (min 10 characters)")
    phone = (data.phone or "").strip() or None
    if phone and not (7 <= len(re.sub(r"\D", "", phone)) <= 15):
        raise HTTPException(status_code=400, detail="Please enter a valid phone number")

    existing_pending = (
        db.query(AdminAccessRequest)
        .filter(AdminAccessRequest.email == email, AdminAccessRequest.status == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=409, detail="A pending admin request already exists for this email")

    req = AdminAccessRequest(
        full_name=full_name,
        email=email,
        phone=phone,
        organization=(data.organization or "").strip() or None,
        current_role=(data.current_role or "").strip() or None,
        reason=reason,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    payload = serialize_admin_request(req)
    # Best-effort email; failures never break the request itself.
    send_admin_request_notification(payload)
    return {"message": "Admin access request submitted", "request": payload}


# =========================================================
# STAGE 6 REGISTRATION
# =========================================================
# Additive endpoints only (new paths). Registered BEFORE the
# "/api/skills/{skill_id}" wildcard below: FastAPI matches routes
# in registration order, so /api/skills/evidence, /api/skills/
# evidence/{skill_id} and /api/skills/growth must be declared
# first or they would be captured by that wildcard (and return
# 422). get_db and get_current_user_model are already in scope.
register_stage6(app, get_db, get_current_user_model)


@app.get("/api/skills/{skill_id}")
def s5_skill_one(skill_id: int, db: Session = Depends(get_db)):
    import stage5_service as S
    sk = db.query(Skill).filter(Skill.id == skill_id).first()
    if not sk:
        raise HTTPException(status_code=404, detail="Skill not found")
    ins = S.insight_map(db).get(sk.id)
    dn = None
    if ins and ins.domain_id:
        drow = db.query(IndustryDomain).filter(IndustryDomain.id == ins.domain_id).first()
        dn = drow.name if drow else None
    refs = []
    for rs in db.query(RoleSkill).filter(RoleSkill.skill_id == sk.id).all():
        rr = db.query(JobRole).filter(JobRole.id == rs.role_id).first()
        refs.append({"role_id": rs.role_id, "title": rr.title if rr else "Unknown", "required_level": rs.required_level, "importance": rs.importance, "skill_type": rs.skill_type})
    return {"skill": S.serialize_industry_skill(sk, ins, dn), "roles": refs, "disclaimer": S.DISCLAIMER}


@app.get("/api/skill-mapping/me")
def s5_mapping(role_id: int | None = None, role: str | None = None, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    import stage5_service as S
    target, src = S.resolve_role(db, current_user, role_id=role_id, role_title=role)
    gap = S.build_gap(db, current_user.id, target)
    lv, _, _ = S.student_map(db, current_user.id)
    gap["target_source"] = src
    gap["has_skills"] = len(lv) > 0
    gap["needs_profile"] = len(lv) == 0
    gap["disclaimer"] = S.DISCLAIMER
    return gap


@app.get("/api/skill-gap/me")
def s5_gap(role_id: int | None = None, role: str | None = None, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    import stage5_service as S
    target, src = S.resolve_role(db, current_user, role_id=role_id, role_title=role)
    gap = S.build_gap(db, current_user.id, target)
    return {"role": gap["role"], "readiness_score": gap["readiness_score"], "readiness_level": gap["readiness_level"], "reason": gap["reason"], "matched": gap["matched"], "partial": gap["partial"], "missing": gap["missing"], "counts": gap["counts"], "target_source": src, "disclaimer": S.DISCLAIMER}


@app.get("/api/skill-recommendations/me")
def s5_recs(role_id: int | None = None, role: str | None = None, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    import stage5_service as S
    target, src = S.resolve_role(db, current_user, role_id=role_id, role_title=role)
    gap = S.build_gap(db, current_user.id, target)
    return {"role": gap["role"], "readiness_score": gap["readiness_score"], "readiness_level": gap["readiness_level"], "recommendations": gap["recommendations"], "target_source": src, "disclaimer": S.DISCLAIMER}


@app.get("/api/skills/analyze/me")
def s5_analyze(skill_id: int | None = None, skill: str | None = None, role_id: int | None = None, role: str | None = None, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    import stage5_service as S
    from skill_engine import level_to_num as _lv, normalize_level as _nl
    row = None
    if skill_id is not None:
        row = db.query(Skill).filter(Skill.id == skill_id).first()
    elif skill and skill.strip():
        row = db.query(Skill).filter(func.lower(Skill.name) == skill.strip().lower()).first()
    if not row:
        raise HTTPException(status_code=404, detail="Skill not found in catalog")
    mine = db.query(UserSkill).filter(UserSkill.user_id == current_user.id, UserSkill.skill_id == row.id).first()
    target, src = S.resolve_role(db, current_user, role_id=role_id, role_title=role)
    req = db.query(RoleSkill).filter(RoleSkill.role_id == target.id, RoleSkill.skill_id == row.id).first()
    ins = S.insight_map(db).get(row.id)
    projs = db.query(Project).filter(Project.owner_id == current_user.id).all()
    pn = row.name.lower()
    mp = [p for p in projs if pn and pn in f"{p.title or ''} {p.description or ''} {p.tech_stack or ''}".lower()]
    learns = db.query(LearningRecord).filter(LearningRecord.user_id == current_user.id).all()
    ml = [x for x in learns if pn and pn in f"{x.title or ''} {x.provider or ''} {x.skill or ''}".lower()]
    snum = _lv(mine.level) if mine else 0
    rnum = _lv(req.required_level) if req else None
    if rnum is None:
        status, gp = "not_required", 0
    elif snum <= 0:
        status, gp = "missing", rnum
    elif snum >= rnum:
        status, gp = "matched", 0
    else:
        status, gp = "partial", rnum - snum
    ev = "No evidence"
    if mine:
        ev = "Verified" if mine.is_verified else ("Evidence-backed" if (mine.verified_by or mine.source_type) else "Self-reported")
    return {"skill": S.serialize_industry_skill(row, ins, None), "your_level": _nl(mine.level) if mine else None, "your_level_num": snum, "evidence_status": ev, "role": {"id": target.id, "title": target.title}, "required_level": str(req.required_level).lower() if req else None, "required_level_num": rnum, "importance": str(req.importance).lower() if req else None, "status": status, "gap_levels": gp, "target_source": src, "evidence": {"projects": len(mp), "learning_records": len(ml), "project_titles": [p.title for p in mp[:5]], "learning_titles": [x.title for x in ml[:5]]}, "disclaimer": S.DISCLAIMER}


@app.put("/api/skill-mapping/target-role")
def s5_target(data: dict, current_user=Depends(get_current_user_model), db=Depends(get_db)):
    rid = data.get("role_id"); title = (data.get("title") or data.get("role") or "").strip()
    role = None
    if rid is not None:
        role = db.query(JobRole).filter(JobRole.id == int(rid)).first()
    elif title:
        role = db.query(JobRole).filter(func.lower(JobRole.title) == title.lower()).first()
    if not role:
        raise HTTPException(status_code=404, detail="Target role not found")
    prof = db.query(StudentProfile).filter(StudentProfile.user_id == current_user.id).first()
    if not prof:
        prof = StudentProfile(user_id=current_user.id, target_job_role=role.title)
        db.add(prof)
    else:
        prof.target_job_role = role.title
    db.commit()
    return {"message": "Target role updated", "role": {"id": role.id, "title": role.title}}


@app.get("/admin/requests")
@app.get("/api/admin/requests")
def list_admin_requests(
    status: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List admin access requests (admin JWT required)."""
    query = db.query(AdminAccessRequest).order_by(AdminAccessRequest.created_at.desc())
    if status:
        cleaned = status.strip().lower()
        if cleaned not in ("pending", "approved", "rejected"):
            raise HTTPException(status_code=400, detail="Invalid status filter")
        query = query.filter(AdminAccessRequest.status == cleaned)
    return {"requests": [serialize_admin_request(r) for r in query.all()]}


def _review_admin_request(db: Session, admin: User, request_id: int, decision: str) -> dict:
    req = db.get(AdminAccessRequest, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Admin request not found")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="This request has already been reviewed")
    req.status = decision
    req.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    req.reviewed_by = admin.id
    if decision == "approved":
        # Promote the matching user account if one exists. Approval does
        # NOT auto-create accounts; the requester must already have a login.
        target = db.query(User).filter(User.email == req.email.strip().lower()).first()
        if target is not None:
            target.role = "admin"
            target.account_status = "active"
    db.commit()
    db.refresh(req)
    return {"success": True, "request": serialize_admin_request(req)}


@app.post("/admin/requests/{request_id}/approve")
@app.post("/api/admin/requests/{request_id}/approve")
def approve_admin_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return _review_admin_request(db, admin, request_id, "approved")


@app.post("/admin/requests/{request_id}/reject")
@app.post("/api/admin/requests/{request_id}/reject")
def reject_admin_request(
    request_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return _review_admin_request(db, admin, request_id, "rejected")

# =========================================================
# STAGE 7 REGISTRATION
# =========================================================
# Additive endpoints only (new paths under /api/sandbox/*).
register_stage7(app, get_db, get_current_user_model)


# =========================================================
# STAGE 8 REGISTRATION — INNOVATION LAB
# =========================================================
# Additive endpoints only (new paths under /api/innovation/*).
# No existing route touched. Auth via existing JWT dependency.
try:
    from stage8_api import register_stage8
    register_stage8(app, get_db, get_current_user_model)
except Exception as _stage8_err:  # never break boot on additive stage
    print(f"[stage8] WARNING: innovation routes not registered: {_stage8_err}")


# =========================================================
# STAGE 9 REGISTRATION — AI CAREER COACH
# =========================================================
# Additive endpoints only (new paths under /api/career-coach/*).
# No existing route touched. Auth via existing JWT dependency.
try:
    from stage9_api import register_stage9
    register_stage9(app, get_db, get_current_user_model)
except Exception as _stage9_err:  # never break boot on additive stage
    print(f"[stage9] WARNING: career coach routes not registered: {_stage9_err}")

# ================================================================
# STAGE 10 — CareerVerse aggregation endpoints (/api/careerverse/*).
# Additive only. No existing route touched. Auth via existing JWT.
# ================================================================
try:
    from careerverse_api import register_careerverse
    register_careerverse(app, get_db, get_current_user_model)
except Exception as _cv_err:  # never break boot on additive stage
    print(f"[careerverse] WARNING: CareerVerse routes not registered: {_cv_err}")


# ================================================================
# MY LEARNING — canonical learning endpoints (/api/learning/*).
# Reuses LearningRecord/LearningResource + stage6 evidence sync +
# CareerEvent/CareerVerse aggregation. Additive only.
# ================================================================
try:
    from learning_api import register_learning
    register_learning(app, get_db, get_current_user_model)
    print("[learning] routes registered: /api/learning/*")
except Exception as _learn_err:  # never break boot on additive stage
    print(f"[learning] WARNING: learning routes not registered: {_learn_err}")


# ================================================================
# COMMUNICATION HUB (additive: groups, reactions, attachments,
# preferences, calls, realtime WS). No existing route touched.
# ================================================================
try:
    from comm_api import register_communication
    register_communication(app, get_db, get_current_user_model)
    print("[comm] routes registered: /api/communication/* + /ws/communication")
except Exception as _comm_err:  # never break boot on additive stage
    print(f"[comm] WARNING: communication routes not registered: {_comm_err}")


# ================================================================
# LIVE DISCUSSIONS (additive: rooms, participants, messages,
# resources + optional room WS). No existing route touched.
# Host is always derived from the JWT. Additive tables only.
# ================================================================
try:
    import discussions_models  # registers the discussion tables on Base
    from discussions_api import register_discussions
    register_discussions(app, get_db, get_current_user_model)
    # Additive privacy migration: adds discussion_rooms.is_private with
    # ADD COLUMN IF NOT EXISTS (no-op when present). Never destructive.
    _disc_privacy = discussions_models.run_discussion_privacy_migration(engine)
    if _disc_privacy:
        print(f"[discussions] privacy migration applied: {_disc_privacy}")
    # create_all ran earlier in boot — run again so the new (empty)
    # discussion_* tables are created. It never alters existing tables.
    Base.metadata.create_all(bind=engine)
    print("[discussions] routes registered: /api/discussions/* + /ws/discussions/*")
except Exception as _disc_err:  # never break boot on additive stage
    print(f"[discussions] WARNING: discussion routes not registered: {_disc_err}")


# ================================================================
# LIVEKIT CLOUD (additive: POST /api/livekit/token only).
# Mints short-lived participant tokens for existing discussion
# rooms. Auth via the existing JWT; PostgreSQL stays the source of
# truth for rooms/members/chat. No existing route touched.
# ================================================================
try:
    from livekit_api import register_livekit
    register_livekit(app, get_db, get_current_user_model)
    print("[livekit] route registered: POST /api/livekit/token")
except Exception as _lk_err:  # never break boot on additive stage
    print(f"[livekit] WARNING: livekit route not registered: {_lk_err}")


# ================================================================
# CREDITS (additive: /api/credits, /api/credits/history,
# /api/credits/packages, /api/credits/purchase + credit_wallets,
# credit_transactions, credit_purchases). PostgreSQL is the ONLY
# source of truth for balances; the 1,000/day allowance is renewed
# lazily server-side from the UTC date and never accumulates.
# No existing route, table or row is touched.
# ================================================================
try:
    import credits_models
    # Adds discussion_rooms.expires_at / credit_cost (ADD COLUMN IF NOT
    # EXISTS) and creates the three new credit tables. Non-destructive.
    credits_models.migrate_credits(engine)
    from credits_api import register_credits
    register_credits(app, get_db, get_current_user_model)
    print("[credits] routes registered: /api/credits*")
except Exception as _credits_err:  # never break boot on additive stage
    print(f"[credits] WARNING: credit routes not registered: {_credits_err}")

