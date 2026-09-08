import urllib.request, json
BASE = "http://127.0.0.1:8000"
OUT = r"C:\project p2p\backend-I\_api_check.txt"

def fetch(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=15) as resp:
            return resp.status, json.loads(resp.read())
    except Exception as e:
        return 0, {"error": str(e)}

out = []

code, body = fetch("/api/learning-resources/skills")
out.append(f"GET /api/learning-resources/skills: {code}")
out.append(f"  skills: {body.get('skills')}")

code, body = fetch("/api/learning-resources/providers")
out.append(f"\nGET /api/learning-resources/providers: {code}")
out.append(f"  providers: {body.get('providers')}")

code, body = fetch("/api/learning-resources")
out.append(f"\nGET /api/learning-resources (all): {code}")
out.append(f"  count: {body.get('count')}")
all_res = body.get("resources", [])
out.append(f"  first resource: {all_res[0].get('title') if all_res else 'NONE'}")

code, body = fetch("/api/learning-resources?skill=Python&resource_type=video")
out.append(f"\nGET /api/learning-resources?skill=Python&resource_type=video: {code}")
out.append(f"  count: {body.get('count')}")
for r in body.get("resources", []):
    out.append(f"  - [{r.get('provider')}] {r.get('title')} ({r.get('url')})")

code, body = fetch("/api/learning-resources?skill=FastAPI")
out.append(f"\nGET /api/learning-resources?skill=FastAPI: {code}")
out.append(f"  count: {body.get('count')}")
for r in body.get("resources", []):
    out.append(f"  - [{r.get('resource_type')}] {r.get('title')} ({r.get('url')})")

with open(OUT, "w") as f:
    f.write("\n".join(out))
print("DONE - see output file")
