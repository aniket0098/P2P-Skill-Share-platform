"""Safely delete ONLY the test accounts created for auth verification.
Targeted deletes by exact email. Never touches any other user."""
from dotenv import load_dotenv
load_dotenv()
from database import SessionLocal
from models import User

TEST_EMAILS = [
    "auth-test-20260914162232@example.com",
    "authfix_check@test.local",
]

db = SessionLocal()
try:
    for email in TEST_EMAILS:
        u = db.query(User).filter(User.email == email).first()
        if u:
            db.delete(u)
            print("DELETED test account: %s (id=%s)" % (email, u.id))
        else:
            print("not found (skip): %s" % email)
    db.commit()
    total = db.query(User).count()
    print("Remaining total users: %d" % total)
finally:
    db.close()
