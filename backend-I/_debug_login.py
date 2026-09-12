from database import SessionLocal
from models import User
from auth import verify_password, hash_password

db = SessionLocal()
try:
    # Check users with gmail addresses
    users = db.query(User).filter(User.email.ilike("%gmail%")).all()
    print(f"=== Users with gmail addresses: {len(users)} ===\n")
    
    for u in users:
        print(f"id={u.id}")
        print(f"  email: {u.email}")
        print(f"  name: {u.name}")
        print(f"  role: {getattr(u, 'role', None)}")
        print(f"  account_status: {getattr(u, 'account_status', None)}")
        print(f"  password_hash present: {bool(u.password_hash)}")
        if u.password_hash:
            print(f"  hash length: {len(u.password_hash)}")
            print(f"  hash: {u.password_hash[:30]}...")
            
            # Test common passwords
            for pwd in ["test123", "TestPass123!", "123456", "password", u.name]:
                result = verify_password(pwd, u.password_hash)
                if result:
                    print(f"  *** PASSWORD FOUND: '{pwd}' works! ***")
        print()
    
    # Also check daniket797 specifically
    print("\n=== Checking daniket797@gmail.com ===")
    u = db.query(User).filter(User.email == "daniket797@gmail.com").first()
    if u:
        print(f"id={u.id}, name={u.name}, role={getattr(u, 'role', None)}")
        print(f"password_hash: {u.password_hash[:40] if u.password_hash else 'NONE'}...")
        for pwd in ["test123", "TestPass123!", "123456", u.name, "daniket797"]:
            result = verify_password(pwd, u.password_hash) if u.password_hash else False
            print(f"  '{pwd}': {result}")
    else:
        print("NOT FOUND")
    
    # Check for users with NO password hash at all
    print("\n=== Users with NO password hash ===")
    no_pwd_users = db.query(User).filter(User.password_hash.is_(None)).all()
    print(f"Count: {len(no_pwd_users)}")
    for u in no_pwd_users:
        print(f"  id={u.id}, email={u.email}, name={u.name}")
        
finally:
    db.close()