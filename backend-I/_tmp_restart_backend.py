"""Throwaway: restart the stale local uvicorn so it loads the CURRENT main.py.

Destructive? No. main.py only runs ADDITIVE migrations on boot
(run_communication_migrations = new tables/columns only) and the same
Postgres database is reused. Nothing is dropped or reset.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

BACK = r"c:\project p2p\backend-I"
PY = os.path.join(BACK, ".venv", "Scripts", "python.exe")
BASE = "http://127.0.0.1:8000"
OUT_LOG = os.path.join(BACK, "_tmp_backend_restart.out.log")
ERR_LOG = os.path.join(BACK, "_tmp_backend_restart.err.log")


def listeners(port=8000):
    try:
        raw = subprocess.run(["netstat", "-ano"], capture_output=True, text=True,
                             timeout=30).stdout
    except Exception as exc:  # noqa: BLE001
        print("netstat failed:", exc)
        return set()
    pids = set()
    for line in raw.splitlines():
        if ":%d" % port not in line or "LISTENING" not in line:
            continue
        m = re.search(r"\s(\d+)\s*$", line.strip())
        if m:
            pids.add(m.group(1))
    return pids


print("listeners on 8000:", sorted(listeners()))
for pid in sorted(listeners()):
    r = subprocess.run(["taskkill", "/PID", pid, "/F"], capture_output=True, text=True)
    print("taskkill", pid, "->", (r.stdout or r.stderr).strip()[:120])

time.sleep(2)
print("listeners after kill:", sorted(listeners()) or "none")

env = dict(os.environ)
env["PYTHONUNBUFFERED"] = "1"
creation = 0
if hasattr(subprocess, "DETACHED_PROCESS"):
    creation = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP

out = open(OUT_LOG, "w", encoding="utf-8")
err = open(ERR_LOG, "w", encoding="utf-8")
proc = subprocess.Popen(
    [PY, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
    cwd=BACK, stdout=out, stderr=err, env=env, creationflags=creation, close_fds=True,
)
print("started uvicorn pid", proc.pid)

deadline = time.time() + 180
live = False
while time.time() < deadline:
    try:
        with urllib.request.urlopen(BASE + "/api/stats", timeout=5) as r:
            body = r.read(200).decode("utf-8", "replace")
            print("UP after %.1fs :: %s" % (time.time() - (deadline - 180), body[:120]))
            live = True
            break
    except Exception:
        time.sleep(3)

if not live:
    print("backend did NOT come up in 180s")
    print("---- stderr tail ----")
    try:
        print(open(ERR_LOG, encoding="utf-8", errors="replace").read()[-3000:])
    except Exception as exc:  # noqa: BLE001
        print(exc)
    sys.exit(1)

# re-check the aggregate routes on the LIVE server
with urllib.request.urlopen(BASE + "/openapi.json", timeout=20) as r:
    spec = json.load(r)
paths = spec.get("paths", {})
print("live routes now:", len(paths))
for p in ("/api/profile/me/summary", "/api/profile/view/{user_id}",
          "/api/profile/education", "/api/profile/skills", "/api/skills",
          "/api/settings", "/api/communication/direct/{user_id}"):
    print("  %-42s %s" % (p, sorted(paths[p].keys()) if p in paths else "MISSING"))
