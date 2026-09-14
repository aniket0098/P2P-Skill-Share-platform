"""Explore Skills end-to-end HTTP test (Tests A-I). Run against live server."""
import sys
import time
import requests

BASE = "http://127.0.0.1:8001"
PASS, FAIL = [0], [0]


def ok(cond, msg):
    if cond:
        PASS[0] += 1
        print("PASS:", msg)
    else:
        FAIL[0] += 1
        print("FAIL:", msg)


def req(method, path, body=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = requests.request(method, BASE + path, json=body, headers=headers, timeout=40)
    try:
        data = r.json()
    except Exception:
        data = None
    return r.status_code, data


stamp = str(int(time.time()))
user_a = "e2ea_%s@t.local" % stamp
user_b = "e2eb_%s@t.local" % stamp
PW = "E2eTest123!"

print("=== 0. Public catalog + course detail ===")
st, cat = req("GET", "/api/learning/catalog")
ok(st == 200, "catalog reachable (%s)" % st)
print("    counts:", cat.get("counts") if cat else None)
ok(cat and cat["counts"]["courses"] > 0, "catalog has courses")
ok(cat and cat["counts"]["lectures"] > 0, "catalog has lectures")
st, crs = req("GET", "/api/learning/courses/python-fundamentals")
ok(st == 200 and crs.get("lectures"), "course detail python-fundamentals (%s)" % st)
lectures = [l for l in crs["lectures"] if l.get("duration_seconds")] or crs["lectures"]
rid, dur = lectures[0]["id"], int(lectures[0]["duration_seconds"] or 3000)
if dur <= 0:
    dur = 3000
print("    using lecture id=%s duration=%ss" % (rid, dur))

print("=== Register users A and B ===")
for e, n in ((user_a, "E2E User A"), (user_b, "E2E User B")):
    st, _ = req("POST", "/signup", {"email": e, "password": PW, "name": n})
    if st not in (200, 400):
        print("    signup %s -> %s" % (e, st))
st, la = req("POST", "/login", {"email": user_a, "password": PW})
st, lb = req("POST", "/login", {"email": user_b, "password": PW})
tok_a = (la or {}).get("access_token")
tok_b = (lb or {}).get("access_token")
ok(bool(tok_a) and bool(tok_b), "login A+B returns JWT")

print("=== Security: JWT ===")
st, _ = req("GET", "/api/learning/me")
ok(st == 401, "no JWT -> 401 (got %s)" % st)
st, _ = req("GET", "/api/learning/me", token="not-a-real-token")
ok(st == 401, "invalid JWT -> 401 (got %s)" % st)

print("=== TEST A: start lecture -> record created, 0%% ===")
st, r = req("POST", "/api/learning/start/%s" % rid, token=tok_a)
ok(st == 200, "start lecture OK (%s)" % st)
rec_id = (r or {}).get("record", {}).get("id")
ok(r and r.get("created") is True, "LearningRecord created (id=%s)" % rec_id)
ok(r and (r["record"]["progress_percentage"] in (0, 0.0, None)
          or r["record"]["status"] == "not_started"), "progress 0%")
st, r2 = req("POST", "/api/learning/start/%s" % rid, token=tok_a)
ok(st == 200 and r2.get("created") is False, "second start reuses record (no duplicate)")

print("=== TEST B: watch 25 of 50 min -> 50%% ===")
half = dur // 2
st, r = req("POST", "/api/learning/%s/watch" % rec_id,
            {"duration_seconds": dur, "position_seconds": half,
             "segments": [[0, half]]}, tok_a)
ok(st == 200, "watch POST accepted (%s: %s)" % (st, (r or {}).get("detail")))
if st == 200:
    ok(r["watched_seconds"] == half, "watched_seconds = %s (unique merge OK)" % half)
    ok(round(r["record"]["progress_percentage"], 1) == 50.0,
       "progress = 50%% (got %s)" % r["record"]["progress_percentage"])
    ok(r["total_duration_seconds"] == dur, "total duration = %s" % dur)

print("=== Anti-double-count: repeat same segment ===")
st, r = req("POST", "/api/learning/%s/watch" % rec_id,
            {"duration_seconds": dur, "position_seconds": half,
             "segments": [[0, half]]}, tok_a)
ok(st == 200 and r["watched_seconds"] == half,
   "re-sending same range does not inflate (%s -> %s)" % (st, (r or {}).get("watched_seconds")))

print("=== TEST C: refresh persistence ===")
st, act = req("GET", "/api/learning/active", token=tok_a)
items = act if isinstance(act, list) else (act or {}).get("records", (act or {}).get("active", []))
row = [x for x in items if isinstance(x, dict) and x.get("id") == rec_id]
ok(bool(row) and round(row[0]["progress_percentage"]) == 50,
   "GET active still shows ~50%% after re-fetch (%s)" % (row and row[0]["progress_percentage"]))

print("=== TEST D/E: resume + completion -> 100%% COMPLETED ===")
st, r = req("POST", "/api/learning/%s/watch" % rec_id,
            {"duration_seconds": dur, "position_seconds": dur, "completed": True,
             "segments": [[half, dur]]}, tok_a)
ok(st == 200 and r.get("was_completed"), "completion accepted (%s: %s)" % (st, (r or {}).get("detail")))
ok(r and r["record"]["progress_percentage"] == 100, "progress = 100%")
ok(r and r["record"]["status"] == "completed", "status = completed")

print("=== TEST F: My Learning reflects completion ===")
st, me = req("GET", "/api/learning/me", token=tok_a)
comp = [x for x in (me or {}).get("completed", []) if x.get("id") == rec_id]
ok(bool(comp), "record appears in /me completed")
st, stats = req("GET", "/api/learning/stats", token=tok_a)
print("    stats:", stats)

print("=== TEST I: user isolation ===")
st, me_b = req("GET", "/api/learning/me", token=tok_b)
ok(len((me_b or {}).get("active", [])) == 0, "user B sees no active records")
ok(len((me_b or {}).get("completed", [])) == 0, "user B sees no completed records")
st, _ = req("PATCH", "/api/learning/%s/progress" % rec_id,
            {"progress_percentage": 100}, tok_b)
ok(st == 404, "user B cannot update user A record (404, got %s)" % st)
st, _ = req("POST", "/api/learning/%s/watch" % rec_id,
            {"duration_seconds": dur, "segments": [[0, dur]]}, tok_b)
ok(st == 404, "user B cannot watch-log user A record (404, got %s)" % st)

print("=== Progress exploit guard (user B own record) ===")
st, r = req("POST", "/api/learning/start/%s" % rid, token=tok_b)
rec_b = (r or {}).get("record", {}).get("id")
ok(st == 200 and rec_b, "user B starts own record (id=%s)" % rec_b)
st, _ = req("POST", "/api/learning/%s/watch" % rec_b,
            {"duration_seconds": 99999, "segments": [[0, 99999]]}, tok_b)
ok(st == 422, "duration mismatch rejected (422, got %s)" % st)
st, r = req("PATCH", "/api/learning/%s/progress" % rec_b,
            {"progress_percentage": 100}, tok_b)
ok(st == 200, "manual /progress endpoint works for legacy clients (got %s)" % st)

print("=== Bookmarks ===")
st, r = req("POST", "/api/learning/bookmarks/%s" % rid, token=tok_a)
ok(st == 200, "bookmark add OK (%s)" % st)
st, bm = req("GET", "/api/learning/bookmarks", token=tok_a)
print("    bookmarks:", bm)
bm_list = bm if isinstance(bm, list) else (bm or {}).get("bookmarks", [])
ok(any(x.get("id") == rid or x.get("resource_id") == rid
       or ((x.get("resource") or {}).get("id") == rid) for x in bm_list),
   "bookmark listed")
st, _ = req("DELETE", "/api/learning/bookmarks/%s" % rid, token=tok_a)
ok(st == 200, "bookmark removed (%s)" % st)

print("=== Recommendations (real data, JWT) ===")
st, recs = req("GET", "/api/learning/recommendations", token=tok_a)
ok(st == 200, "recommendations endpoint OK (%s)" % st)
print("    rec count:", len(recs) if isinstance(recs, list) else recs)

print()
print("RESULT: %s passed, %s failed" % (PASS[0], FAIL[0]))
sys.exit(1 if FAIL[0] else 0)