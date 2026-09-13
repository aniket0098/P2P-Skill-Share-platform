"""Debug the Career Coach chat failure end-to-end."""
import httpx

BASE = "http://127.0.0.1:8000"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


print("=" * 70)
print("STEP 0: Signup + Login a fresh test user")
print("=" * 70)
email = "debug-coach-" + str(hash("coach") % 1000000) + "@test.com"
r = httpx.post(f"{BASE}/signup", json={
    "email": email, "password": "Pass1!", "name": "Debug Coach User"
}, timeout=20)
print(f"SIGNUP: {r.status_code}  {r.text[:200]}")
assert r.status_code in (200, 201), f"Signup failed: {r.status_code} {r.text}"

r = httpx.post(f"{BASE}/login", json={"email": email, "password": "Pass1!"}, timeout=20)
print(f"LOGIN:  {r.status_code}  {r.text[:200]}")
assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
data = r.json()
token = data.get("access_token") or data.get("token")
assert token, "No token in login response"
print(f"TOKEN: present ({len(token)} chars)")

print()
print("=" * 70)
print("STEP 1: /me (verify auth works)")
print("=" * 70)
r = httpx.get(f"{BASE}/me", headers=auth(token), timeout=20)
print(f"/me:    {r.status_code}  {r.text[:200]}")
assert r.status_code == 200, f"/me failed: {r.status_code}"

print()
print("=" * 70)
print("STEP 2: GET /api/career-coach/status (provider health)")
print("=" * 70)
r = httpx.get(f"{BASE}/api/career-coach/status", timeout=5)
print(f"STATUS: {r.status_code}")
try:
    s = r.json()
    for k, v in s.items():
        sv = str(v)
        if len(sv) > 120:
            sv = sv[:120] + "..."
        print(f"  {k}: {sv}")
except Exception:
    print(f"  body: {r.text[:500]}")

print()
print("=" * 70)
print("STEP 3: GET /api/career-coach/context (career context build)")
print("=" * 70)
r = httpx.get(f"{BASE}/api/career-coach/context", headers=auth(token), timeout=20)
print(f"CONTEXT: {r.status_code}")
try:
    c = r.json()
    for k, v in c.items():
        sv = str(v)
        if len(sv) > 300:
            sv = sv[:300] + "..."
        print(f"  {k}: {sv}")
except Exception:
    print(f"  body: {r.text[:600]}")

print()
print("=" * 70)
print("STEP 4: POST /api/career-coach/chat (THE FAILING REQUEST)")
print("=" * 70)
payload = {"message": "What should I learn next?", "mode": "general"}
r = httpx.post(f"{BASE}/api/career-coach/chat",
               json=payload,
               headers=auth(token),
               timeout=60)
print(f"CHAT:   {r.status_code}  ({r.elapsed.total_seconds():.2f}s)")
try:
    j = r.json()
    print("RESPONSE JSON:")
    for k, v in j.items():
        sv = str(v)
        if len(sv) > 600:
            sv = sv[:600] + "..."
        print(f"  {k}: {sv}")
except Exception:
    print(f"  body (non-json): {r.text[:800]}")

print()
print("=" * 70)
print("STEP 5: Repeat chat with mode=system_design equivalent")
print("=" * 70)
payload2 = {"message": "Which of my skills is strongest?", "mode": "general"}
r = httpx.post(f"{BASE}/api/career-coach/chat",
               json=payload2,
               headers=auth(token),
               timeout=60)
print(f"CHAT2:  {r.status_code}  ({r.elapsed.total_seconds():.2f}s)")
try:
    j = r.json()
    for k, v in j.items():
        sv = str(v)
        if len(sv) > 600:
            sv = sv[:600] + "..."
        print(f"  {k}: {sv}")
except Exception:
    print(f"  body: {r.text[:800]}")
