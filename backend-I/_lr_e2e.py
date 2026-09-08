import urllib.request
import urllib.error
import json
import time

BASE = "http://127.0.0.1:8000"
OUT = r"C:\project p2p\backend-I\_lr_e2e_out.txt"
PW = "TestPass123!"


def req(path, method="GET", data=None, token=None):
    url = BASE + path
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            raw = e.read()
            return e.code, json.loads(raw) if raw else {}
        except Exception:
            return e.code, {}


def log(msg):
    with open(OUT, "a") as f:
        f.write(msg + "\n")
    print(msg)


with open(OUT, "w") as f:
    f.write("")

# 1. Unfiltered list
code, body = req("/api/learning-resources")
log(f"[1] GET /api/learning-resources: {code} count={len(body.get('resources', []))}")

# 2. Skill filter
code, body = req("/api/learning-resources?skill=Python")
rs = body.get("resources", [])
log(f"[2] ?skill=Python: {code} count={len(rs)} all_python={all(r['skill'] == 'Python' for r in rs)}")

# 3. Difficulty filter
code, body = req("/api/learning-resources?difficulty=beginner")
rs = body.get("resources", [])
log(f"[3] ?difficulty=beginner: {code} count={len(rs)} all_beginner={all((r.get('difficulty') or '').lower() == 'beginner' for r in rs)}")

# 4. Provider filter (use a real provider from the DB)
code, body = req("/api/learning-resources/providers")
providers = body.get("providers", [])
log(f"[4] GET /providers: {code} providers={providers}")

if providers:
    p = providers[0]
    code, body = req("/api/learning-resources?provider=" + urllib.request.quote(p))
    rs = body.get("resources", [])
    log(f"    ?provider={p}: {code} count={len(rs)} all_match={all(r['provider'] == p for r in rs)}")

# 5. Type filter
code, body = req("/api/learning-resources?resource_type=video")
rs = body.get("resources", [])
log(f"[5] ?resource_type=video: {code} count={len(rs)} all_video={all((r.get('resource_type') or '').lower() == 'video' for r in rs)}")

# 6. Search
code, body = req("/api/learning-resources?search=python")
rs = body.get("resources", [])
log(f"[6] ?search=python: {code} count={len(rs)} (all mention python={all('python' in json.dumps(r).lower() for r in rs) if rs else 'n/a'})")

# 7. Skills meta endpoint
code, body = req("/api/learning-resources/skills")
log(f"[7] GET /skills: {code} skills={body.get('skills', [])}")

# 8. Single resource detail
code, body = req("/api/learning-resources/1")
log(f"[8] GET /api/learning-resources/1: {code} title={body.get('resource', {}).get('title', body.get('title', '?'))!r}")

# 9. '+ My Learning' flow: signup, start a real resource, verify record
suffix = str(int(time.time()))
email = f"lr_{suffix}@test.local"
req("/signup", "POST", {"email": email, "password": PW, "name": "LR Tester"})
code, body = req("/login", "POST", {"email": email, "password": PW})
token = body.get("access_token")
log(f"[9] login: {code} token={'YES' if token else 'NO'}")

# Pick a real course resource
code, body = req("/api/learning-resources?skill=Python&resource_type=course")
res = body.get("resources", [])
if res:
    r0 = res[0]
    log(f"    starting real resource: {r0['title']!r} ({r0['provider']})")
    code, body = req("/api/users/me/learning", "POST", {
        "skill_name": r0["skill"],
        "resource_title": r0["title"],
        "resource_type": "course",
        "progress_percentage": 0,
        "status": "in_progress",
    }, token=token)
    log(f"    POST /api/users/me/learning: {code} overall={body.get('overall_progress')} has_activity={body.get('has_activity')}")
    rec_ok = body.get("has_activity") is True
    log(f"    LEARNING RECORD CREATED: {'YES' if rec_ok else 'NO'}")
else:
    log("    no Python course found — skipped")

# 10. Verify resource detail includes url (real link, not fake)
code, body = req("/api/learning-resources/1")
r1 = body.get("resource") or body
url = r1.get("url") or r1.get("resource_url") or ""
log(f"[10] resource 1 url present: {bool(url)} starts_with_http={url.startswith('http')}")

log("\n=== LR E2E COMPLETE ===")
