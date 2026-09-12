#!/usr/bin/env python3
"""Inspect user accounts for login issue."""
import sys
from database import SessionLocal
from models import User
from auth import verify_password

db = SessionLocal()

# Search for any users that look like "sanchit"
print("=== Users matching 'sanchit' (email or name) ===")
for u in db.query(User).filter(
    (User.email.ilike('%sanchit%')) | (User.name.ilike('%sanchit%'))
).all():
    print(f"id={u.id} email={u.email!r} name={u.name!r} role={u.role!r}")
    if u.password_hash:
        ok = verify_password('TestPass123!', u.password_hash)
        print(f"   verify 'TestPass123!': {ok}")
        # Try common passwords
        for pw in ['sanchit123', 'Sanchit123', 'password', 'TestPass123!', '']:
            if verify_password(pw, u.password_hash):
                print(f"   FOUND: password is {pw!r}")

print()
print("=== All users (last 20) ===")
for u in db.query(User).order_by(User.id.desc()).limit(20).all():
    print(f"id={u.id} email={u.email[:30]!r} name={u.name!r} role={u.role!r}")

# Also check if this user exists with exact email
print()
print("=== Exact email lookups ===")
for email in ['sanchit@test.local', 'sanchit@gmail.com', 'sanchit@example.com']:
    u = db.query(User).filter(User.email == email).first()
    print(f"{email}: {'FOUND' if u else 'NOT FOUND'}")

db.close()