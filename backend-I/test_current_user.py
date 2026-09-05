"""
Current-user endpoint tests (GET /me and GET /users/me).

Ground truth: the users table in PostgreSQL is queried directly
via the project's SQLAlchemy models and compared with what the
API returns for the authenticated JWT.

Run with the server up:  python test_current_user.py
"""

import json
import urllib.request
import urllib.error

from database import SessionLocal
from models import User

BASE = "http://127.0.0.1:8000"

USER_A = {"email": "demo@skillshare.com", "password": "123456"}
USER_B = {"email": "alex@skillshare.com", "password": "123456"}

results = []


def check(name, ok, info=""):
    results.append((name, ok))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({info})" if info else ""))


def api(path, method="GET", token=None, headers=None, data=None):
    request_headers = {"Content-Type": "application/json"}
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    if headers:
        request_headers.update(headers)
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        BASE + path, data=body, headers=request_headers, method=method
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"detail": str(e)}


def db_user(email):
    db = SessionLocal()
    try:
        return db.query(User).filter(User.email == email).first()
    finally:
        db.close()


print("=" * 62)
print("CURRENT-USER ENDPOINT TESTS (/me, /users/me)")
print("=" * 62)

# ----------------------------------------------------------
# 1. LOGIN real database users
# ----------------------------------------------------------
print("\n1. LOGIN users A and B (real PostgreSQL records)")
print("-" * 62)

row_a = db_user(USER_A["email"])
row_b = db_user(USER_B["email"])
check("User A exists in PostgreSQL", row_a is not None, f"id={row_a.id if row_a else '?'}")
check("User B exists in PostgreSQL", row_b is not None, f"id={row_b.id if row_b else '?'}")

status, data = api("/login", "POST", data=USER_A)
token_a = data.get("access_token")
check("Login A returns token", status == 200 and bool(token_a), str(status))

status, data = api("/login", "POST", data=USER_B)
token_b = data.get("access_token")
check("Login B returns token", status == 200 and bool(token_b), str(status))

# ----------------------------------------------------------
# 2. /me returns the real DB record for the JWT subject
# ----------------------------------------------------------
print("\n2. GET /me vs PostgreSQL ground truth (user A)")
print("-" * 62)

status, data = api("/me", token=token_a)
user = data.get("user", {})
check("GET /me returns 200", status == 200, str(status))
check("id matches DB", user.get("id") == row_a.id, f"api={user.get('id')} db={row_a.id}")
check("name matches DB", user.get("name") == row_a.name, f"api={user.get('name')!r} db={row_a.name!r}")
check("email matches DB", user.get("email") == row_a.email, f"api={user.get('email')!r} db={row_a.email!r}")
check("public_id matches DB", user.get("public_id") == row_a.public_id,
      f"api={user.get('public_id')!r} db={row_a.public_id!r}")
check("password_hash NOT exposed", "password_hash" not in user and "password" not in user)

# ----------------------------------------------------------
# 3. /users/me alias behaves identically
# ----------------------------------------------------------
print("\n3. GET /users/me alias")
print("-" * 62)

status, data = api("/users/me", token=token_a)
user2 = data.get("user", {})
check("GET /users/me returns 200", status == 200, str(status))
check("alias returns same DB record",
      user2.get("id") == row_a.id and user2.get("email") == row_a.email)

# ----------------------------------------------------------
# 4. Switching users changes the returned record
# ----------------------------------------------------------
print("\n4. Same endpoint, different token -> different DB record")
print("-" * 62)

status, data = api("/me", token=token_b)
user_b = data.get("user", {})
check("GET /me as user B returns 200", status == 200, str(status))
check("id matches user B's DB row", user_b.get("id") == row_b.id,
      f"api={user_b.get('id')} db={row_b.id}")
check("email matches user B's DB row", user_b.get("email") == row_b.email,
      f"api={user_b.get('email')!r} db={row_b.email!r}")
check("name matches user B's DB row", user_b.get("name") == row_b.name,
      f"api={user_b.get('name')!r} db={row_b.name!r}")
check("record differs between users", user_b.get("id") != row_a.id)

# ----------------------------------------------------------
# 5. Frontend-supplied user_id is NEVER trusted
# ----------------------------------------------------------
print("\n5. Identity spoofing attempts (must be ignored)")
print("-" * 62)

status, data = api(f"/me?user_id={row_b.id}", token=token_a)
user3 = data.get("user", {})
check("query param user_id ignored",
      status == 200 and user3.get("id") == row_a.id,
      f"got id={user3.get('id')}")

status, data = api("/me", token=token_a, headers={"X-User-Id": str(row_b.id)})
user4 = data.get("user", {})
check("X-User-Id header ignored",
      status == 200 and user4.get("id") == row_a.id,
      f"got id={user4.get('id')}")

status, data = api("/me", token=token_a, data={"user_id": row_b.id})
check("JSON body user_id ignored on GET",
      status == 200 and data.get("user", {}).get("id") == row_a.id)

# ----------------------------------------------------------
# 6. Missing / invalid tokens -> 401
# ----------------------------------------------------------
print("\n6. Authentication failures")
print("-" * 62)

status, data = api("/me")
check("No token -> 401", status == 401, str(status))

status, data = api("/me", token="not-a-real-jwt")
check("Garbage token -> 401", status == 401, str(status))

forged = token_a[:-4] + "AAAA"  # tampered signature
status, data = api("/me", token=forged)
check("Tampered token -> 401", status == 401, str(status))

status, data = api("/users/me")
check("Alias without token -> 401", status == 401, str(status))

# ----------------------------------------------------------
# Summary
# ----------------------------------------------------------
passed = sum(1 for _, ok in results if ok)
total = len(results)
print()
print("=" * 62)
print(f"RESULT: {passed}/{total} passed" + ("  — ALL OK" if passed == total else "  — FAILURES PRESENT"))
print("=" * 62)
raise SystemExit(0 if passed == total else 1)
