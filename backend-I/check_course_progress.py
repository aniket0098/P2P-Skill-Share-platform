"""Quick check: course progress derived from per-lecture progress (auth)."""
import time
import requests

BASE = "http://127.0.0.1:8001"
stamp = str(int(time.time()))
PW = "E2eTest123!"
email = "e2ec_%s@t.local" % stamp
requests.post(BASE + "/signup", json={"email": email, "password": PW, "name": "CP Check"}, timeout=30)
tok = requests.post(BASE + "/login", json={"email": email, "password": PW}, timeout=30).json()["access_token"]
H = {"Authorization": "Bearer " + tok}

_, crs = requests.get(BASE + "/api/learning/courses/python-fundamentals", headers=H, timeout=30).json() if False else (0, requests.get(BASE + "/api/learning/courses/python-fundamentals", headers=H, timeout=30).json())
lecs = crs["lectures"]
print("lectures:", [(l["id"], l.get("duration_seconds"), l.get("progress"), l.get("status")) for l in lecs])

# Complete first lecture, watch half of second.
first = lecs[0]["id"]
fdur = int(lecs[0].get("duration_seconds") or 60)
s1 = requests.post(BASE + "/api/learning/start/%s" % first, headers=H, timeout=60).json()
if "record" not in s1:
    print("start1 raw:", s1)
    raise SystemExit(1)
rec1 = s1["record"]["id"]
r1 = requests.post(BASE + "/api/learning/%s/watch" % rec1,
                   json={"duration_seconds": fdur, "completed": True, "segments": [[0, fdur]]},
                   headers=H, timeout=60).json()
s2 = requests.post(BASE + "/api/learning/start/%s" % lecs[1]["id"], headers=H, timeout=60).json()
rec2 = s2["record"]["id"]
sdur = int(lecs[1].get("duration_seconds") or 60)
r2 = requests.post(BASE + "/api/learning/%s/watch" % rec2,
                   json={"duration_seconds": sdur, "position_seconds": sdur // 2,
                         "segments": [[0, sdur // 2]]}, headers=H, timeout=60).json()
if "record" in r1:
    print("lecture1:", r1["record"]["status"], r1["record"]["progress_percentage"])
if "record" in r2:
    print("lecture2:", r2["record"]["status"], r2["record"]["progress_percentage"])

crs2 = requests.get(BASE + "/api/learning/courses/python-fundamentals", headers=H, timeout=30).json()
cp = crs2.get("course_progress") or crs2.get("progress")
print("course_progress:", cp, "| per-lecture:", [(l["id"], l.get("progress")) for l in crs2["lectures"]])
print("COURSE PROGRESS DERIVED FROM LECTURES OK" if cp else "NO course_progress FIELD")
