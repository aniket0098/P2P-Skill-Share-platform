"""Live integration test: REAL PostgreSQL users -> FastAPI -> Requests -> Messages.

Run:  python integration_test.py   (server must be on http://localhost:8000)
"""
import json
import time
import urllib.parse
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
STAMP = str(int(time.time() * 1000))
USER_A = {"name": "E2E Alpha", "email": f"alpha_{STAMP}@test.com", "password": "secret123"}
USER_B = {"name": "E2E Beta", "email": f"beta_{STAMP}@test.com", "password": "secret123"}

PASSED = []
FAILED = []


def check(name, condition, extra=""):
    if condition:
        PASSED.append(name)
        print(f"  PASS  {name}")
    else:
        FAILED.append(name)
        print(f"  FAIL  {name}  {extra}")


def api(path, method="GET", token=None, data=None, raw_token=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if raw_token is not None:
        headers["Authorization"] = raw_token
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}
    except Exception as e:
        return 0, {"raw": str(e)}


print("=" * 62)
print("1-2. SIGNUP two real users (written to PostgreSQL)")
print("=" * 62)
status, data = api("/signup", "POST", data=USER_A)
check("Signup A returns 200", status == 200, f"{status} {data}")
status, data = api("/signup", "POST", data=USER_B)
check("Signup B returns 200", status == 200, f"{status} {data}")

print()
print("=" * 62)
print("3-4. LOGIN A and B (JWT issued)")
print("=" * 62)
status, data = api("/login", "POST", data={"email": USER_A["email"], "password": USER_A["password"]})
token_a = data.get("access_token")
check("Login A returns token", status == 200 and token_a, f"{status}")
status, data = api("/login", "POST", data={"email": USER_B["email"], "password": USER_B["password"]})
token_b = data.get("access_token")
check("Login B returns token", status == 200 and token_b, f"{status}")

status, data = api("/me", token=token_a)
check("GET /me identifies A from JWT", status == 200 and data.get("user", {}).get("name") == USER_A["name"], f"{status} {data}")
id_a = data["user"]["id"]
status, data = api("/me", token=token_b)
id_b = data["user"]["id"]

print()
print("=" * 62)
print("5. SEARCH: A searches for B in PostgreSQL")
print("=" * 62)
status, data = api(f"/api/users/search?q={urllib.parse.quote(USER_B['name'])}", token=token_a)
found = [u for u in data.get("users", []) if u["id"] == id_b]
check("Search finds user B", status == 200 and found, f"{status} {data}")
check("Search result has no email/password", found and "email" not in found[0] and "password" not in found[0], found)
check("Search excludes self (A not in results)", all(u["id"] != id_a for u in data.get("users", [])))

print()
print("=" * 62)
print("6. SEND REQUEST A -> B")
print("=" * 62)
status, data = api("/api/requests", "POST", token=token_a, data={"receiver_id": id_b, "message": "Let's learn Python together"})
check("POST /api/requests returns 200", status == 200 and data.get("success"), f"{status} {data}")
request_id = data["request"]["id"]
check("Sender comes from JWT (A), not frontend", data["request"]["sender"]["id"] == id_a)

print()
print("7. Duplicate request prevention")
status, data = api("/api/requests", "POST", token=token_a, data={"receiver_id": id_b})
check("Duplicate pending request rejected (409)", status == 409, f"{status} {data}")

print()
print("8. Validation checks")
status, data = api("/api/requests", "POST", token=token_a, data={"receiver_id": id_a})
check("Self-request rejected (400)", status == 400, f"{status} {data}")
status, data = api("/api/requests", "POST", token=token_a, data={"receiver_id": 999999})
check("Invalid receiver rejected (404)", status == 404, f"{status} {data}")

print()
print("9. Protected API without/with bad token")
status, data = api("/api/requests")
check("No token -> 401", status == 401, f"{status}")
status, data = api("/api/requests", raw_token="Bearer garbage.token.here")
check("Bad token -> 401", status == 401, f"{status}")

print()
print("10. Sender cannot accept own request")
status, data = api(f"/api/requests/{request_id}/accept", "PATCH", token=token_a)
check("Sender cannot accept own request (403)", status == 403, f"{status}")

print()
print("11-12. B sees received request and accepts")
status, data = api("/api/requests?direction=received&status=pending", token=token_b)
incoming = [r for r in data.get("requests", []) if r["sender"]["id"] == id_a]
check("B sees A's pending request", status == 200 and incoming, f"{status} {data}")

status, data = api(f"/api/requests/{request_id}/accept", "PATCH", token=token_b)
check("B accepts -> 200 + accepted", status == 200 and data.get("request", {}).get("status") == "accepted", f"{status} {data}")
conversation_id = data.get("conversation", {}).get("id")
check("Accept creates conversation", conversation_id is not None, data)

print()
print("13. Double-accept prevention")
status, data = api(f"/api/requests/{request_id}/accept", "PATCH", token=token_b)
check("Second accept rejected (409)", status == 409, f"{status}")

print()
print("14. A sees B in connections (with conversation id)")
status, data = api("/api/requests/connections", token=token_a)
conns = [c for c in data.get("connections", []) if c["user"] and c["user"]["id"] == id_b]
check("Connection listed for A", status == 200 and conns and conns[0]["conversation_id"] == conversation_id, f"{status} {data}")

print()
print("15. User profile endpoint")
status, data = api(f"/api/users/{id_b}", token=token_a)
check("GET /api/users/{id} returns B + relationship", status == 200 and data.get("user", {}).get("id") == id_b and data.get("relationship", {}).get("connected") is True, f"{status} {data}")
status, data = api("/api/users/999999", token=token_a)
check("Unknown user -> 404", status == 404, f"{status}")

print()
print("=" * 62)
print("16-17. MESSAGING: A sends message to B")
print("=" * 62)
status, data = api(f"/api/conversations/{conversation_id}/messages", "POST", token=token_a, data={"content": "Hello Beta! Ready to learn?"})
check("A sends message -> 200", status == 200 and data.get("success"), f"{status} {data}")
msg_id = data["message"]["id"]
check("Message sender is JWT user A", data["message"]["sender_id"] == id_a)

print()
print("18. Security: third user cannot read the conversation")
api("/signup", "POST", data={"name": "E2E Gamma", "email": f"gamma_{STAMP}@test.com", "password": "secret123"})
status, data = api("/login", "POST", data={"email": f"gamma_{STAMP}@test.com", "password": "secret123"})
token_c = data.get("access_token")
status, data = api(f"/api/conversations/{conversation_id}/messages", token=token_c)
check("Outsider cannot read conversation (403)", status == 403, f"{status}")

print()
print("19. Unread counts")
status, data = api("/api/conversations", token=token_b)
conv_b = [c for c in data["conversations"] if c["id"] == conversation_id][0]
check("B has unread_count 1", conv_b["unread_count"] == 1, conv_b)
status, data = api("/api/conversations", token=token_a)
conv_a = [c for c in data["conversations"] if c["id"] == conversation_id][0]
check("A has unread_count 0 (own message)", conv_a["unread_count"] == 0, conv_a)

print()
print("20. B reads messages -> unread cleared")
status, data = api(f"/api/conversations/{conversation_id}/messages", token=token_b)
check("B loads messages (marks read)", status == 200 and any(m["content"].startswith("Hello Beta") for m in data["messages"]), f"{status}")
status, data = api("/api/conversations", token=token_b)
conv_b = [c for c in data["conversations"] if c["id"] == conversation_id][0]
check("B unread_count now 0", conv_b["unread_count"] == 0, conv_b)

print()
print("21. B replies; A sees it")
status, data = api(f"/api/conversations/{conversation_id}/messages", "POST", token=token_b, data={"content": "Hi Alpha! Let's start tomorrow."})
check("B replies -> 200", status == 200, f"{status}")
status, data = api(f"/api/conversations/{conversation_id}/messages", token=token_a)
contents = [m["content"] for m in data["messages"]]
check("A sees both messages from PostgreSQL", "Hello Beta! Ready to learn?" in contents and "Hi Alpha! Let's start tomorrow." in contents, contents)

print()
print("22. Empty message rejected")
status, data = api(f"/api/conversations/{conversation_id}/messages", "POST", token=token_a, data={"content": "   "})
check("Empty message -> 400", status == 400, f"{status}")

print()
print("23. Cancel flow with Gamma -> A")
status, data = api("/api/requests", "POST", token=token_c, data={"receiver_id": id_a})
cancel_id = data["request"]["id"]
status, data = api(f"/api/requests/{cancel_id}", "DELETE", token=token_c)
check("DELETE cancels own sent request", status == 200 and data["request"]["status"] == "cancelled", f"{status} {data}")
status, data = api(f"/api/requests/{cancel_id}", "DELETE", token=token_c)
check("Second cancel rejected (409)", status == 409, f"{status}")
status, data = api(f"/api/requests/{cancel_id}", "DELETE", token=token_a)
check("Receiver cannot cancel others' request (403)", status == 403, f"{status}")

print()
print("=" * 62)
print("24. DATABASE VERIFICATION (direct PostgreSQL check)")
print("=" * 62)
try:
    import psycopg2
    conn = psycopg2.connect("postgresql://postgres:aniketd@localhost:5433/skillshare")
    cur = conn.cursor()
    cur.execute("select status from connection_requests where id=%s", (request_id,))
    check("Request persisted as accepted in PostgreSQL", cur.fetchone()[0] == "accepted")
    cur.execute("select content, sender_id from messages where id=%s", (msg_id,))
    row = cur.fetchone()
    check("Message persisted in PostgreSQL", row and row[0] == "Hello Beta! Ready to learn?" and row[1] == id_a, row)
    cur.execute("select is_read from messages where id=%s", (msg_id,))
    check("Message marked read in PostgreSQL", cur.fetchone()[0] is True)
    cur.execute(
        "select count(*) from connections where "
        "((user_one_id=%s and user_two_id=%s) or (user_one_id=%s and user_two_id=%s))",
        (id_a, id_b, id_b, id_a),
    )
    check("Connection row exists for the pair", cur.fetchone()[0] == 1)
    conn.close()
except Exception as e:
    check("PostgreSQL direct verification", False, str(e))

print()
print("=" * 62)
print(f"RESULT: {len(PASSED)} passed, {len(FAILED)} failed")
if FAILED:
    print("FAILED:", FAILED)
print("=" * 62)

