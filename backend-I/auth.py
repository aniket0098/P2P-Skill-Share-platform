from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext

# ==========================================
# PASSWORD HASHING
# ==========================================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ==========================================
# JWT SETTINGS
# ==========================================

SECRET_KEY = "skillshare-super-secret-key-change-this-later"

ALGORITHM = "HS256"

ACCESS_TOKEN_EXPIRE_MINUTES = 60


# ==========================================
# PASSWORD FUNCTIONS
# ==========================================


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:

    return pwd_context.verify(plain_password, hashed_password)


# ==========================================
# JWT TOKEN
# ==========================================


def create_access_token(data: dict, expires_delta: timedelta | None = None):

    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


# ==========================================
# JWT DECODE
# ==========================================


def decode_access_token(token: str) -> dict | None:
    """
    Returns the token payload if valid and not expired,
    otherwise returns None.
    """

    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    except JWTError:
        return None
