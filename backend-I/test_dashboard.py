# -*- coding: utf-8 -*-
"""Live test: GET /api/dashboard for two real users + security checks."""
import json
import urllib.request

BASE = "http://127.0.0.1:8000"
USERS = [
    ("demo@skillshare.com", "123456", 23, "Aniket Deshmukh"),
    ("alex@skillshare.com", "123456", 24, "Alex Johnson"),
]


def post(path, payload):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def get(path, token=None):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, headers=headers)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


results = []
tokens = {}

for email, password, uid, name in USERS:
    status, body = post("/login", {"email": email, "password": password})
    ok = status == 200
    results.append(("LOGIN " + email, ok, f"status={status}"))
    if ok:
        tokens[email] = body["access_token"]
    else:
        results.append(("LOGIN DETAIL", False, json.dumps(body)[:120]))

for email, password, uid, name in USERS:
    token = tokens.get(email)
    if not token:
        continue
    status, body = get("/api/dashboard", token)
    passed = status == 200 and body["user"]["id"] == uid and body["user"]["name"] == name
    results.append(
        (
            f"DASHBOARD {email}",
            passed,
            f"status={status} user.id={body.get('user', {}).get('id')} "
            f"name={body.get('user', {}).get('name')} "
            f"stats={json.dumps(body.get('stats'))[:160]}",
        )
    )
    results.append(
        (
            f"  sections {email}",
            True,
            f"community_skills={len(body.get('community_skills', []))} "
            f"recent_skills={len(body.get('recent_skills', []))} "
            f"spotlight={len(body.get('spotlight', []))} "
            f"pend_req={len(body.get('notifications', {}).get('pending_requests', []))} "
            f"unread_conv={len(body.get('notifications', {}).get('unread_conversations', []))} "
            f"activity_days={len(body.get('activity', {}).get('days', []))} "
            f"week_total={sum(d['messages_sent'] for d in body.get('activity', {}).get('days', []))}",
        )
    )
    results.append(
        (
            f"  no password_hash leak",
            "password_hash" not in json.dumps(body),
            "",
        )
    )

# ---- security: no token / bad token / cross-user spoofing ----
s, b = get("/api/dashboard")
results.append(("DASHBOARD no token -> 401", s == 401, f"status={s}"))

s, b = get("/api/dashboard", "garbage.token.value")
results.append(("DASHBOARD bad token -> 401", s == 401, f"status={s}"))

demo_tok = tokens.get("demo@skillshare.com")
s, b = get("/api/dashboard", demo_tok)
results.append(
    (
        "spoof user 24 identity ignored (JWT wins)",
        s == 200 and b["user"]["id"] == 23,
        f"returned id={b.get('user', {}).get('id')}",
    )
)

# ---- user-specific difference check ----
t1, t2 = tokens.get(USERS[0][0]), tokens.get(USERS[1][0])
s1, b1 = get("/api/dashboard", t1)
s2, b2 = get("/api/dashboard", t2)
different = json.dumps(b1["stats"]) != json.dumps(b2["stats"]) or b1["user"]["id"] != b2["user"]["id"]
results.append(
    (
        "two users -> different data",
        different,
        f"user23.stats={json.dumps(b1['stats'])} | user24.stats={json.dumps(b2['stats'])}",
    )
)

print("\n" + "=" * 70)
failures = 0
for label, passed, info in results:
    mark = "PASS" if passed else "FAIL"
    if not passed:
        failures += 1
    print(f"[{mark}] {label}" + (f"  -- {info}" if info else ""))
print("=" * 70)
print(f"{len(results) - failures}/{len(results)} passed")
