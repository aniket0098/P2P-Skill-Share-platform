"""Secure one-time bootstrap for the main admin (Phase 1).

Usage (server shell, never from the browser):
    cd backend-I
    set MAIN_ADMIN_EMAIL=daniket797@gmail.com   (PowerShell: $env:MAIN_ADMIN_EMAIL="...")
    python init_admin.py --email daniket797@gmail.com --name "Main Admin" --password "ChooseAStrongPassword123!"

What it does:
  * Creates the user if missing, otherwise upgrades that user's role to admin.
  * NEVER grants admin because someone typed the email in signup — this
    script is the only bootstrap path, and it requires server access.
  * Safe to re-run (idempotent).
"""
import argparse
import getpass
import sys

import config
from database import SessionLocal, engine
from database import Base
import models  # noqa: F401  (register tables)
from models import User
import auth


def main() -> int:
    parser = argparse.ArgumentParser(description="Bootstrap the main admin account.")
    parser.add_argument("--email", default=config.MAIN_ADMIN_EMAIL)
    parser.add_argument("--name", default="Main Admin")
    parser.add_argument("--password", default=None, help="If omitted, you will be prompted securely.")
    args = parser.parse_args()

    email = (args.email or "").strip().lower()
    if "@" not in email:
        print("ERROR: provide a valid --email")
        return 2
    password = args.password or getpass.getpass("Admin password (min 8 chars): ")
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.")
        return 2

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Ensure Phase 1 columns exist even if create_all ran before models grew.
        from sqlalchemy import text as _text
        for stmt in [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR DEFAULT 'active'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP",
        ]:
            db.execute(_text(stmt))
        db.commit()

        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                name=args.name.strip() or "Main Admin",
                email=email,
                password_hash=auth.hash_password(password),
                role="admin",
                account_status="active",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created admin user id={user.id} email={email}")
        else:
            user.role = "admin"
            user.account_status = "active"
            # Only reset password when explicitly provided via --password.
            if args.password:
                user.password_hash = auth.hash_password(password)
            db.commit()
            print(f"Upgraded existing user id={user.id} email={email} to admin "
                  f"({'password reset' if args.password else 'password unchanged'})")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
