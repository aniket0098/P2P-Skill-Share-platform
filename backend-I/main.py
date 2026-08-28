import re

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import Base, engine, SessionLocal
from models import User
import auth

app = FastAPI()

Base.metadata.create_all(bind=engine)


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
        "name": user.name,
        "email": user.email,
    }


@app.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {"user": current_user}
