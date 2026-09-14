from database import SessionLocal
from models import User

db = SessionLocal()
users = db.query(User).all()
for u in users:
    if u.password_hash and u.password_hash.startswith("'") and u.password_hash.endswith("'"):
        old = u.password_hash
        u.password_hash = u.password_hash.strip("'")
        db.commit()
        print(f"FIXED: {u.email} hash removed surrounding quotes")
    elif u.password_hash and u.password_hash.startswith("'"):
        u.password_hash = u.password_hash.lstrip("'")
        db.commit()
        print(f"FIXED left: {u.email}")
    else:
        print(f"OK: {u.email} hash={u.password_hash[:20] if u.password_hash else 'none'}...")
db.close()
print("Done.")
