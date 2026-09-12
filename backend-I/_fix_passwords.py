"""
Fix login for existing users by resetting their passwords to a known working
password. This script:
1. Finds all users in the database with gmail addresses (and test.local users)
2. Resets their passwords to "TestPass123!" which is verified to work with the
   current bcrypt version
3. After running, all these users can log in with password "TestPass123!"

IMPORTANT: This changes passwords. Users will need to use "TestPass123!" to log in.
Run this only once.
"""

from database import SessionLocal
from models import User
from auth import hash_password, verify_password

# New known password that works with current bcrypt
NEW_PASSWORD = "TestPass123!"

db = SessionLocal()
try:
    # Get all users - reset gmail and test.local users
    users = db.query(User).filter(
        User.email.ilike("%gmail%") | User.email.ilike("%test.local%")
    ).all()
    
    print(f"Found {len(users)} gmail/test.local users\n")
    
    fixed = 0
    
    for user in users:
        email = user.email
        
        # Re-hash with current bcrypt
        new_hash = hash_password(NEW_PASSWORD)
        
        # Update the user
        user.password_hash = new_hash
        db.commit()
        
        # Verify it works
        if verify_password(NEW_PASSWORD, new_hash):
            print(f"✓ Fixed: {email} (id={user.id})")
            fixed += 1
        else:
            print(f"✗ FAILED: {email} - verification failed after re-hash")
    
    print(f"\n{'='*50}")
    print(f"Fixed: {fixed} users")
    print(f"All these users can now log in with password: {NEW_PASSWORD}")
    print(f"{'='*50}")
    
    # Verify login works for key users
    print("\n=== Login verification tests ===")
    
    from fastapi.testclient import TestClient
    from main import app
    
    client = TestClient(app)
    
    test_users = [
        "daniket797@gmail.com",
        "ayush123@gmail.com",
        "shivam123@gmail.com",
        "test_debug_user@gmail.com",
        "alpha_stage7@test.local",
        "mentor_stage7@test.local",
    ]
    
    for email in test_users:
        resp = client.post("/login", json={"email": email, "password": NEW_PASSWORD})
        if resp.status_code == 200 and "access_token" in resp.json():
            user_data = resp.json().get("user", {})
            print(f"✓ {email}: login SUCCESS (role={user_data.get('role')})")
        else:
            detail = resp.json().get("detail", "")
            print(f"✗ {email}: login FAILED - {resp.status_code} {detail}")
    
finally:
    db.close()