#!/usr/bin/env python3
"""Part 2 Security + Integration Tests for Dynamic Role-Based Profile.

Tests A-K as specified in the requirements.
Uses the real PostgreSQL database (Neon).
"""
import sys
import os
import time
import requests

# Use the real database
os.environ.setdefault("DATABASE_URL", "postgresql://neondb_owner:npg_ahdkLCVYl39S@ep-lingering-pond-a1i3j9hv-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require")

BASE = os.getenv("API_BASE", "http://127.0.0.1:8000")

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

def signup(email, password, name, role, profile=None):
    payload = {"email": email, "password": password, "name": name, "role": role}
    if profile:
        payload["profile"] = profile
    return requests.post(f"{BASE}/signup", json=payload, timeout=60)

def login(email, password):
    r = requests.post(f"{BASE}/login", json={"email": email, "password": password}, timeout=60)
    if r.status_code == 200:
        return r.json().get("access_token")
    return None

def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}

# Generate unique emails to avoid conflicts
TS = int(time.time())
print(f"\nTest timestamp: {TS}")
print(f"API Base: {BASE}")
print("=" * 60)

# TEST A: Student signup -> login -> profile
print("\nTEST A: Student signup -> login -> profile")
r = signup(f"student_{TS}@test.local", "pass1234", "Test Student", "student", {
    "college": "ABC College", "degree": "B.Tech", "branch": "CSE",
    "graduation_year": 2026, "semester": "7", "cgpa": 8.5,
    "top_skills": ["Python", "React"], "programming_languages": ["Python", "JS"],
    "technologies": ["Django"], "target_job_role": "SDE",
    "preferred_industry": "Tech", "looking_for": ["Jobs", "Internships"]
})
check("student signup 200/201", r.status_code in (200, 201), r.text[:200])
if r.status_code == 201:
    sid = r.json()["user"]["id"]
    check("student role stored", r.json()["user"]["role"] == "student")
    
    token = login(f"student_{TS}@test.local", "pass1234")
    check("student login 200", token is not None)
    
    if token:
        r = requests.get(f"{BASE}/profile/me", headers=auth_headers(token), timeout=60)
        check("GET /profile/me 200", r.status_code == 200, r.text[:200])
        body = r.json()
        check("profile has role student", body["role"] == "student", str(body))
        check("profile has user", body["user"]["email"] == f"student_{TS}@test.local")
        check("profile college", body["profile"]["college"] == "ABC College")
        check("profile cgpa", body["profile"]["cgpa"] == 8.5)
        check("profile skills", "Python" in body["profile"]["top_skills"])
        check("profile has no password_hash", "password_hash" not in body)
        check("profile has no password", "password" not in body)
        check("profile user no password_hash", "password_hash" not in body["user"])

# TEST B: Recruiter signup -> login -> profile
print("\nTEST B: Recruiter signup -> login -> profile")
r = signup(f"recruiter_{TS}@test.local", "pass1234", "Test Recruiter", "recruiter", {
    "job_title": "HR Manager", "company_name": "TechCorp",
    "company_website": "https://techcorp.com", "industry": "IT",
    "company_size": "500+", "company_location": "Bangalore",
    "hiring_for": ["SDE", "Data Scientist"], "job_roles": ["Frontend", "Backend"],
    "required_skills": ["React", "Python"], "internship_availability": "Yes"
})
check("recruiter signup 200/201", r.status_code in (200, 201), r.text[:200])
if r.status_code == 201:
    token = login(f"recruiter_{TS}@test.local", "pass1234")
    check("recruiter login 200", token is not None)
    
    if token:
        r = requests.get(f"{BASE}/profile/me", headers=auth_headers(token), timeout=60)
        check("GET /profile/me 200", r.status_code == 200, r.text[:200])
        body = r.json()
        check("profile has role recruiter", body["role"] == "recruiter", str(body))
        check("profile company", body["profile"]["company_name"] == "TechCorp")
        check("profile job_title", body["profile"]["job_title"] == "HR Manager")
        check("profile verification pending", body["profile"]["verification_status"] == "pending")

# TEST C: Mentor signup -> login -> profile
print("\nTEST C: Mentor signup -> login -> profile")
r = signup(f"mentor_{TS}@test.local", "pass1234", "Test Mentor", "mentor", {
    "job_title": "Senior Engineer", "company": "Google",
    "industry": "Tech", "years_experience": 10,
    "skills": ["Python", "System Design"], "expertise_areas": ["Backend", "Distributed Systems"],
    "linkedin_url": "https://linkedin.com/in/testmentor",
    "portfolio_url": "https://testmentor.dev",
    "github_url": "https://github.com/testmentor",
    "available_days": ["Mon", "Wed", "Fri"], "available_hours": "2-4 PM",
    "mentorship_topics": ["Career Growth", "System Design"],
    "mentorship_types": ["1-on-1", "Group"],
    "bio": "Experienced engineer helping others grow."
})
check("mentor signup 200/201", r.status_code in (200, 201), r.text[:200])
if r.status_code == 201:
    token = login(f"mentor_{TS}@test.local", "pass1234")
    check("mentor login 200", token is not None)
    
    if token:
        r = requests.get(f"{BASE}/profile/me", headers=auth_headers(token), timeout=60)
        check("GET /profile/me 200", r.status_code == 200, r.text[:200])
        body = r.json()
        check("profile has role mentor", body["role"] == "mentor", str(body))
        check("profile company", body["profile"]["company"] == "Google")
        check("profile years_experience", body["profile"]["years_experience"] == 10)
        check("profile linkedin", body["profile"]["linkedin_url"] == "https://linkedin.com/in/testmentor")
        check("profile skills", "Python" in body["profile"]["skills"])

# TEST D: Try to access admin API as student
print("\nTEST D: Student cannot access admin endpoints")
student_token = login(f"student_{TS}@test.local", "pass1234")
if student_token:
    r = requests.get(f"{BASE}/admin/requests", headers=auth_headers(student_token), timeout=60)
    check("student cannot access admin (401/403)", r.status_code in (401, 403), str(r.status_code))

# TEST E: Try changing role via PUT /profile/me
print("\nTEST E: Role change via PUT /profile/me is rejected")
if student_token:
    r = requests.put(f"{BASE}/profile/me", headers=auth_headers(student_token), json={"role": "admin"}, timeout=60)
    check("role change in body ignored (200 but role unchanged)", r.status_code == 200, r.text[:200])
    if r.status_code == 200:
        body = r.json()
        check("role still student after attempt", body["role"] == "student", str(body))

# TEST F: Try sending admin role during normal signup
print("\nTEST F: Admin role during signup is rejected")
r = signup(f"admin_try_{TS}@test.local", "pass1234", "Fake Admin", "admin")
check("admin role signup rejected (400/403)", r.status_code in (400, 403), r.text[:200])

# TEST G: Admin request flow
print("\nTEST G: Admin request submission")
r = requests.post(f"{BASE}/admin/requests", json={
    "full_name": "Test Requester",
    "email": f"requester_{TS}@test.local",
    "phone": "9876543210",
    "organization": "Test Org",
    "current_role": "student",
    "reason": "I want to help manage the platform."
}, timeout=60)
check("admin request submitted (200/201)", r.status_code in (200, 201), r.text[:200])
if r.status_code == 201:
    check("request has id", bool(r.json().get("request", {}).get("id")))
    check("request status pending", r.json().get("request", {}).get("status") == "pending")

# TEST H & I: Admin approve/reject (requires admin token - skip if no admin)
print("\nTEST H/I: Admin approve/reject (requires existing admin)")
print("  (Skipped - requires existing admin account)")

# TEST J: Refresh profile page - data persists
print("\nTEST J: Profile data persists after refresh")
if student_token:
    r = requests.get(f"{BASE}/profile/me", headers=auth_headers(student_token), timeout=60)
    check("profile still loads after refresh", r.status_code == 200)
    if r.status_code == 200:
        body = r.json()
        check("data still correct", body["profile"]["college"] == "ABC College")

# TEST K: Logout - protected pages respect auth
print("\nTEST K: Protected pages respect authentication")
r = requests.get(f"{BASE}/profile/me", timeout=60)
check("unauthenticated request rejected (401/403)", r.status_code in (401, 403), str(r.status_code))

# Summary
print("\n" + "=" * 60)
print(f"RESULTS: {passed} passed, {failed} failed")
if failures:
    print("FAILURES:")
    for f in failures:
        print(f"  - {f}")
print("=" * 60)
sys.exit(1 if failed else 0)

