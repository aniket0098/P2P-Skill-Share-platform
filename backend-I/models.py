from sqlalchemy import Column, Integer, String, DateTime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)

    # Matches the existing PostgreSQL column "password_hash"
    # (stores the bcrypt hash produced by auth.hash_password)
    password_hash = Column(String, nullable=False)

    # Matches the existing PostgreSQL column "created_at"
    created_at = Column(DateTime, nullable=True)
