"""
E2E test: Profile page <-> Settings -> Profile <-> PostgreSQL integration.
Uses two real database users; cleans up after itself.
Run:  python e2e_profile_test.py   (server must be on 127.0.0.1:8000)
"""
import sys

import requests
from sqlalchemy import text

from database import SessionLocal

BASE = "http://127.0.0.1:8000"
SUFFIX = "e2eprof"

results = []


def check(label, ok, extra=""):
    results.append((label, ok))
    print(("PASS" if ok else "FAIL") + f"  {label}" + (f"  [{extra}]" if extra and not ok else ""))


def signup(email, password, name):
    requests.post(
        f"{BASE}/signup",
        json={"email": email, "password": password, "name": name},
        timeout=60,
    )
    return login(email, password)


def login(email, password):
    r = requests.post(
        f"{BASE}/login",
        json={"email": email, "password": password},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def patch_me(token, payload):
    return requests.patch(
        f"{BASE}/users/me", json=payload, headers=auth(token), timeout=60
    )


def get_me(token):
    return requests.get(f"{BASE}/users/me", headers=auth(token), timeout=60)


# ---------------------------------------------------------------- setup
a_email = f"alpha_{SUFFIX}@test.local"
b_email = f"bravo_{SUFFIX}@test.local"
PW = "TestPass123!"

a = signup(a_email, PW, "Alpha Tester")
b = signup(b_email, PW, "Bravo Tester")

a_tok = a.get("access_token") or a.get("token")
b_tok = b.get("access_token") or b.get("token")
a_id = (a.get("user") or a).get("id")
b_id = (b.get("user") or b).get("id")
check("users created/logged in", bool(a_tok and b_tok and a_id and b_id))

# ---------------------------------------------------------------- 1. Profile-like save (A)
r = patch_me(a_tok, {
    "name": "Alpha Prime",
    "username": f"alpha_{SUFFIX}",
    "bio": "Backend developer learning AI.",
    "location": "Pune, India",
    "skills": "Python, FastAPI, PostgreSQL",
    "interests": "AI, Distributed Systems",
})
check("PATCH /users/me 200", r.status_code == 200, r.text[:200])
data = r.json()
user = data.get("user") or data
check("response returns updated name", user.get("name") == "Alpha Prime")
check("response returns username", user.get("username") == f"alpha_{SUFFIX}")


# ---------------------------------------------------------------- 2. Persistence: fresh GET (Profile page reload path)
r = get_me(a_tok)
check("GET /users/me 200", r.status_code == 200, r.text[:200])
me = (r.json().get("user") or r.json())
check(
    "persistence: name/bio/username/location survive reload",
    me.get("name") == "Alpha Prime"
    and me.get("bio") == "Backend developer learning AI."
    and me.get("username") == f"alpha_{SUFFIX}"
    and me.get("location") == "Pune, India",
    str({k: me.get(k) for k in ("name", "bio", "username", "location")}),
)
skills_val = me.get("skills")
if isinstance(skills_val, str):
    skills_val = [s.strip() for s in skills_val.split(",") if s.strip()]
interests_val = me.get("interests")
if isinstance(interests_val, str):
    interests_val = [s.strip() for s in interests_val.split(",") if s.strip()]
check(
    "persistence: skills + interests survive reload",
    skills_val == ["Python", "FastAPI", "PostgreSQL"]
    and interests_val == ["AI", "Distributed Systems"],
    f"skills={skills_val} interests={interests_val}",
)

# ---------------------------------------------------------------- 3. Direct PostgreSQL verification
db = SessionLocal()
row = db.execute(
    text(
        "SELECT name, username, bio, location, skills, interests "
        "FROM users WHERE email = :email"
    ),
    {"email": a_email},
).fetchone()
db.close()
check(
    "database row actually updated",
    row is not None
    and row[0] == "Alpha Prime"
    and row[1] == f"alpha_{SUFFIX}"
    and row[2] == "Backend developer learning AI."
    and row[3] == "Pune, India"
    and "FastAPI" in (row[4] or "")
    and "AI" in (row[5] or ""),
    str(row),
)

# ---------------------------------------------------------------- 4. Settings-side change (same user, same record)
r = patch_me(a_tok, {
    "bio": "AI Developer",
    "location": "Nagpur, India",
    "skills": "Python, Machine Learning",
    "interests": "Cloud Computing",
})
check("Settings-style PATCH 200", r.status_code == 200, r.text[:200])
r = get_me(a_tok)
me = (r.json().get("user") or r.json())
sk = me.get("skills")
if isinstance(sk, str):
    sk = [s.strip() for s in sk.split(",") if s.strip()]
check(
    "Settings change reflected on Profile endpoint",
    me.get("bio") == "AI Developer"
    and me.get("location") == "Nagpur, India"
    and sk == ["Python", "Machine Learning"],
    str({k: me.get(k) for k in ("bio", "location", "skills")}),
)

# ---------------------------------------------------------------- 5. Username rules
r = patch_me(a_tok, {"username": "ab"})
check("username too short rejected (400)", r.status_code == 400, r.text[:150])
r = patch_me(a_tok, {"username": "bad name!"})
check("username invalid chars rejected (400)", r.status_code == 400, r.text[:150])
r = patch_me(b_tok, {"username": f"alpha_{SUFFIX}"})
check("duplicate username rejected (409)", r.status_code == 409, r.text[:150])
r = patch_me(a_tok, {"username": "@alpha_e2eprof"})
check("leading @ accepted + stripped", r.status_code == 200 and (r.json().get("user") or r.json()).get("username") == f"alpha_{SUFFIX}", r.text[:150])

# ---------------------------------------------------------------- 6. Security: no cross-user writes / JWT-only identity
r = patch_me(b_tok, {"name": "Bravo Renamed", "bio": "Bravo bio here."})
check("B can update only own record (200)", r.status_code == 200, r.text[:150])
r = get_me(a_tok)
me = (r.json().get("user") or r.json())
check("A's record untouched by B's save", me.get("name") == "Alpha Prime", me.get("name"))
r = requests.patch(f"{BASE}/users/me", json={"bio": "hacked"}, timeout=60)
check("unauthenticated PATCH rejected (401)", r.status_code in (401, 403), str(r.status_code))

# ---------------------------------------------------------------- 7. Empty-string clears + no duplicate user rows
r = patch_me(a_tok, {"location": ""})
check("empty location clears (200)", r.status_code == 200, r.text[:150])
r = get_me(a_tok)
me = (r.json().get("user") or r.json())
check("location now empty", not me.get("location"), str(me.get("location")))

db = SessionLocal()
count_a = db.execute(
    text("SELECT COUNT(*) FROM users WHERE email = :email"), {"email": a_email}
).scalar()
count_b = db.execute(
    text("SELECT COUNT(*) FROM users WHERE email = :email"), {"email": b_email}
).scalar()
db.close()
check("exactly ONE row per user (no duplicates)", count_a == 1 and count_b == 1, f"a={count_a} b={count_b}")

# ---------------------------------------------------------------- cleanup
db = SessionLocal()
for email in (a_email, b_email):
    db.execute(text("DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE email = :e)"), {"e": email})
    db.execute(text("DELETE FROM conversation_participants WHERE user_id IN (SELECT id FROM users WHERE email = :e)"), {"e": email})
    db.execute(text("DELETE FROM conversations WHERE id NOT IN (SELECT conversation_id FROM conversation_participants)"), {})
    db.execute(text("DELETE FROM connection_requests WHERE sender_id IN (SELECT id FROM users WHERE email = :e) OR receiver_id IN (SELECT id FROM users WHERE email = :e)"), {"e": email})
    db.execute(text("DELETE FROM connections WHERE user_one_id IN (SELECT id FROM users WHERE email = :e) OR user_two_id IN (SELECT id FROM users WHERE email = :e)"), {"e": email})
    db.execute(text("DELETE FROM users WHERE email = :e"), {"e": email})
db.commit()
db.close()

passed = sum(1 for _, ok in results if ok)
failed = len(results) - passed
print(f"\n{passed}/{len(results)} passed" + (f"  — {failed} FAILED" if failed else "  — ALL OK"))
sys.exit(1 if failed else 0)
