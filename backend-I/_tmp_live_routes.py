"""Throwaway: verify the LIVE backend exposes every endpoint profile.js needs."""
import json
import sys
import urllib.request

BASE = "http://127.0.0.1:8000"

try:
    with urllib.request.urlopen(BASE + "/openapi.json", timeout=10) as r:
        spec = json.load(r)
except Exception as exc:  # noqa: BLE001
    print("FAILED to fetch openapi.json:", exc)
    sys.exit(1)

paths = spec.get("paths", {})
print("live routes:", len(paths))

# (method, path) required by profile.js through api-client.js
needed = [
    ("GET", "/api/profile/me/summary"),
    ("GET", "/api/profile/view/{user_id}"),
    ("PATCH", "/api/users/me"),
    ("PUT", "/profile/me"),
    ("GET", "/api/profile/education"),
    ("POST", "/api/profile/education"),
    ("PATCH", "/api/profile/education/{education_id}"),
    ("DELETE", "/api/profile/education/{education_id}"),
    ("GET", "/api/profile/skills"),
    ("POST", "/api/profile/skills"),
    ("PATCH", "/api/profile/skills/{user_skill_id}"),
    ("DELETE", "/api/profile/skills/{user_skill_id}"),
    ("GET", "/api/profile/completion"),
    ("GET", "/api/skills"),
    ("GET", "/api/skills/catalog"),
    ("GET", "/api/users/{user_id}"),
    ("GET", "/api/users/me/projects"),
    ("GET", "/api/users/{user_id}/projects"),
    ("GET", "/api/users/me/activity"),
    ("GET", "/api/users/{user_id}/activity"),
    ("GET", "/api/users/me/learning"),
    ("GET", "/api/users/{user_id}/learning"),
    ("POST", "/api/requests"),
    ("GET", "/api/requests"),
    ("GET", "/api/requests/connections"),
    ("DELETE", "/api/connections/{user_id}"),
    ("PATCH", "/api/requests/{request_id}/accept"),
    ("POST", "/api/communication/direct/{user_id}"),
    ("GET", "/api/settings"),
    ("GET", "/me"),
]

bad = []
for method, path in needed:
    ops = paths.get(path)
    ok = bool(ops) and method.lower() in ops
    if not ok:
        bad.append((method, path, sorted(ops.keys()) if ops else None))
    print("%-6s %-46s %s" % (method, path, "OK" if ok else "MISSING %s" % (sorted(ops.keys()) if ops else "")))

print("")
print("MISSING COUNT:", len(bad))
for b in bad:
    print("  ", b)
