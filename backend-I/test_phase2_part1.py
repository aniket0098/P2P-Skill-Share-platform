import sys, os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

TEST_DATABASE_URL = "sqlite:///:memory:"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from database import Base
from main import get_db
from main import app
from models import User, AdminAccessRequest, PUBLIC_SIGNUP_ROLES
from auth import hash_password, create_access_token

engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)

def override_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_db
client = TestClient(app)

def make_token(uid):
    return create_access_token({"sub": str(uid), "type": "access"})

def auth_headers(uid):
    return {"Authorization": f"Bearer {make_token(uid)}"}

passed = 0
failed = 0
failures = []

def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ok {name}")
    else:
        failed += 1
        failures.append(name)
        print(f"  FAIL {name}: {detail}")

print("\n=== TEST A: Student signup -> login -> profile ===")
r = client.post("/signup", json={
    "name": "Test Student", "email": "student@test.com", "password": "pass1234",
    "role": "student", "phone": "9876543210",
    "profile": {
        "college": "ABC College", "degree": "B.Tech", "branch": "CSE",
        "graduation_year": 2026, "semester": "7", "cgpa": 8.5,
        "top_skills": ["Python", "React"], "programming_languages": ["Python", "JS"],
        "technologies": ["Django"], "target_job_role": "SDE",
        "preferred_industry": "Tech", "looking_for": ["Jobs", "Internships"]
    }
})
check("student signup 201", r.status_code == 201, r.text)
sid = r.json()["user"]["id"]
check("student role stored", r.json()["user"]["role"] == "student")

r = client.post("/login", json={"email": "student@test.com", "password": "pass1234"})
check("student login 200", r.status_code == 200, r.text)
check("login has token", bool(r.json().get("access_token")))
token = r.json()["access_token"]

r = client.get("/profile/me", headers={"Authorization": f"Bearer {token}"})
check("GET /profile/me 200", r.status_code == 200, r.text)
body = r.json()
check("profile has role student", body["role"] == "student", str(body))
check("profile has user", body["user"]["email"] == "student@test.com")
check("profile college", body["profile"]["college"] == "ABC College")
check("profile cgpa", body["profile"]["cgpa"] == 8.5)
check("profile skills", "Python" in body["profile"]["top_skills"])
check("profile has no password_hash", "password_hash" not in body)
check("profile has no password", "password" not in body)
check("profile user no password_hash", "password_hash" not in body["user"])
