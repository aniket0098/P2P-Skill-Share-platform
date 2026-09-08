"""
E2E Test for Upgraded Profile Page backend endpoints & data flow.
Tests:
1. User registration & authentication
2. Profile update (name, bio, skills, interests, location)
3. Projects API: POST /api/projects, GET /api/users/me/projects, GET /api/projects
4. Activity API: GET /api/users/me/activity
5. Learning API: GET /api/users/me/learning
6. Public profile endpoints for peer viewing: GET /api/users/{id}/projects & activity
7. Brand new user empty state validation
"""
import time
import requests

BASE = "http://127.0.0.1:8000"
TS = int(time.time() * 1000)
SUFFIX = f"profup_{TS}"

results = []

def check(label, ok, extra=""):
    results.append((label, ok))
    status_str = "PASS" if ok else "FAIL"
    print(f"{status_str}  {label}" + (f"  [{extra}]" if extra and not ok else ""))

def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# 1. Create primary test user
email_a = f"user_a_{SUFFIX}@test.local"
password = "Password123!"
name_a = "Aniket Sharma"

r_signup = requests.post(f"{BASE}/signup", json={"email": email_a, "password": password, "name": name_a})
check("User A signup 200/201", r_signup.status_code in (200, 201), r_signup.text[:200])

r_login = requests.post(f"{BASE}/login", json={"email": email_a, "password": password})
check("User A login 200", r_login.status_code == 200, r_login.text[:200])
token_a = r_login.json().get("access_token")
user_a = r_login.json().get("user")
user_a_id = user_a["id"]

# 2. Update Profile with bio, skills, interests, location
update_payload = {
    "name": "Aniket Sharma",
    "username": f"aniket_{SUFFIX[:8]}",
    "bio": "Full stack engineer passionate about AI and distributed systems.",
    "location": "Pune, India",
    "skills": "Python, FastAPI, PostgreSQL, React",
    "interests": "Machine Learning, Distributed Systems, Cloud Architecture",
}
r_patch = requests.patch(f"{BASE}/api/users/me", json=update_payload, headers=auth_headers(token_a))
check("PATCH /api/users/me 200", r_patch.status_code == 200, r_patch.text[:200])
patched_user = r_patch.json().get("user", {})
check("Patched user has updated bio", patched_user.get("bio") == update_payload["bio"])
check("Patched user has updated location", patched_user.get("location") == update_payload["location"])
check("Patched user has updated skills", "FastAPI" in (patched_user.get("skills") or ""))
check("Patched user has updated interests", "Machine Learning" in (patched_user.get("interests") or ""))

# 3. Test Projects API: Create project in PostgreSQL
project_payload = {
    "title": "SkillShare Platform",
    "description": "A real-time peer-to-peer skill-sharing marketplace.",
    "technologies": "Python, FastAPI, PostgreSQL, Vanilla JS",
    "status": "completed",
    "github_url": "https://github.com/aniket0098/P2P-Skill-Share-platform",
    "demo_url": "http://127.0.0.1:5500",
}
r_create_proj = requests.post(f"{BASE}/api/projects", json=project_payload, headers=auth_headers(token_a))
check("POST /api/projects 200", r_create_proj.status_code == 200, r_create_proj.text[:200])
proj_data = r_create_proj.json().get("project", {})
check("Project title matches", proj_data.get("title") == "SkillShare Platform")
check("Project status is completed", proj_data.get("status") == "completed")
check("Project owner ID matches User A", proj_data.get("owner_id") == user_a_id)

# 4. GET /api/users/me/projects
r_my_projs = requests.get(f"{BASE}/api/users/me/projects", headers=auth_headers(token_a))
check("GET /api/users/me/projects 200", r_my_projs.status_code == 200, r_my_projs.text[:200])
my_projs = r_my_projs.json().get("projects", [])
check("My projects contains 1 project", len(my_projs) == 1)
check("Project has technologies list", isinstance(my_projs[0].get("technologies"), list))
check("Project owner summary present", my_projs[0].get("owner", {}).get("name") == "Aniket Sharma")

# 5. GET /api/users/me/activity
r_my_act = requests.get(f"{BASE}/api/users/me/activity", headers=auth_headers(token_a))
check("GET /api/users/me/activity 200", r_my_act.status_code == 200, r_my_act.text[:200])
activities = r_my_act.json().get("activities", [])
check("Activities returned", len(activities) >= 3, f"count={len(activities)}")
act_types = [a["type"] for a in activities]
check("Activity has project event", "project" in act_types)
check("Activity has teaching/skill event", "teaching" in act_types)
check("Activity has community/join event", "community" in act_types)

# 6. GET /api/users/me/learning (Ground truth - zero invented percentages)
r_my_learn = requests.get(f"{BASE}/api/users/me/learning", headers=auth_headers(token_a))
check("GET /api/users/me/learning 200", r_my_learn.status_code == 200, r_my_learn.text[:200])
learn_data = r_my_learn.json()
check("Learning progress is 0% when untracked", learn_data.get("overall_progress") == 0)
check("Learning has_activity is False", learn_data.get("has_activity") is False)
check("Learning empty state message present", "Start learning from Explore Skills" in learn_data.get("message", ""))

# 7. Create User B to test public view of User A & User B empty state
email_b = f"user_b_{SUFFIX}@test.local"
r_signup_b = requests.post(f"{BASE}/signup", json={"email": email_b, "password": password, "name": "Rohan Verma"})
check("User B signup 200", r_signup_b.status_code in (200, 201))
r_login_b = requests.post(f"{BASE}/login", json={"email": email_b, "password": password})
token_b = r_login_b.json().get("access_token")

# User B viewing User A's public projects
r_pub_projs = requests.get(f"{BASE}/api/users/{user_a_id}/projects", headers=auth_headers(token_b))
check("GET /api/users/{id}/projects 200", r_pub_projs.status_code == 200)
check("Public view sees User A project", len(r_pub_projs.json().get("projects", [])) == 1)

# User B viewing User A's public activity
r_pub_act = requests.get(f"{BASE}/api/users/{user_a_id}/activity", headers=auth_headers(token_b))
check("GET /api/users/{id}/activity 200", r_pub_act.status_code == 200)
check("Public view sees User A activity", len(r_pub_act.json().get("activities", [])) >= 3)

# User B empty states validation
r_b_projs = requests.get(f"{BASE}/api/users/me/projects", headers=auth_headers(token_b))
check("New User B has 0 projects", len(r_b_projs.json().get("projects", [])) == 0)

# Summary
total = len(results)
passed = sum(1 for _, ok in results if ok)
failed = total - passed
print("\n" + "=" * 50)
print(f"RESULTS: {passed}/{total} PASSED ({failed} FAILED)")
print("=" * 50)
if failed > 0:
    exit(1)
