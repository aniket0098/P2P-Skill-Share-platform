"""End-to-end test of the Requests/Connections feature.

Creates REAL users through the public /signup API (no direct DB
inserts), runs the full two-user workflow against the live FastAPI +
PostgreSQL backend, and cleans up its own test data afterwards.
"""

import json
import time
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
STAMP = str(int(time.time()))
A = {"name": "E2E Two Alpha", "email": f"e2e2a_{STAMP}@test.com", "password": "Str0ngPass!x"}
B = {"name": "E2E Two Beta", "email": f"e2e2b_{STAMP}@test.com", "password": "Str0ngPass!x"}

results = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=15) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def check(label, ok, extra=""):
    results.append((label, ok, extra))
    print(("PASS" if ok else "FAIL"), "-", label, extra)


def token_for(user):
    s, d = call("POST", "/login", body=user)
    return d.get("access_token") if s == 200 else None


# ---- 1. signup A and B (real DB users via the public API) ----
s, d = call("POST", "/signup", body=A)
check("A signs up via /signup", s in (200, 201), f"({s})")
s, d = call("POST", "/signup", body=B)
check("B signs up via /signup", s in (200, 201), f"({s})")

tokA = token_for(A)
tokB = token_for(B)
check("A logs in (JWT issued)", bool(tokA))
check("B logs in (JWT issued)", bool(tokB))

# ---- 2. A searches B (real PostgreSQL search) ----
s, d = call("GET", "/api/users/search?q=" + urllib.request.quote(B["name"]), tokA)
users = d.get("users", [])
match = next((u for u in users if u["name"] == B["name"]), None)
check("A searches and finds B", s == 200 and match is not None, f"({s}, {len(users)} results)")
bid = match["id"] if match else None
bpub = match["public_id"] if match else None
check("B result includes unique public_id", bool(match and match.get("public_id")),
      str(match.get("public_id") if match else ""))

# ---- 3. self-request + unauthenticated protection ----
s, d = call("GET", "/me", tokA)
me_id = d.get("user", {}).get("id")
s, d = call("POST", "/api/requests", tokA, {"receiver_id": me_id})
check("A cannot send request to self", s == 400, f"({s}: {d.get('detail')})")

s, d = call("POST", "/api/requests", None, {"receiver_id": bid})
check("Unauthenticated request rejected (401)", s == 401, f"({s})")

# ---- 4. A sends request to B (sender derived from JWT) ----
s, d = call("POST", "/api/requests", tokA, {"receiver_id": bid, "message": "Hi, let's connect!"})
check("A sends request to B", s == 200 and d.get("request", {}).get("status") == "pending", f"({s})")
req_id = d.get("request", {}).get("id")
check("Request sender is A (from JWT, not client body)",
      d.get("request", {}).get("sender", {}).get("id") == me_id)

# ---- 5. duplicate protection (same direction + reverse) ----
s, d = call("POST", "/api/requests", tokA, {"receiver_id": bid})
check("Duplicate pending request blocked (409)", s == 409, f"({s}: {d.get('detail')})")

s, d = call("POST", "/api/requests", tokB, {"receiver_id": me_id})
check("Reverse request B->A blocked (409)", s == 409, f"({s}: {d.get('detail')})")

# ---- 6. B sees the incoming request; authorization checks ----
s, d = call("GET", "/api/requests", tokB)
recv = [r for r in d.get("requests", [])
        if r["direction"] == "received" and r["status"] == "pending"]
check("B sees A under incoming requests",
      any(r["id"] == req_id for r in recv), f"({s}, {len(recv)} pending)")

s, d = call("DELETE", f"/api/requests/{req_id}", tokB)
check("B cannot cancel A's request (403)", s == 403, f"({s}: {d.get('detail')})")

s, d = call("PATCH", f"/api/requests/{req_id}/accept", tokA)
check("A cannot accept own sent request (403)", s == 403, f"({s}: {d.get('detail')})")

# ---- 7. B accepts; connection created in PostgreSQL ----
s, d = call("PATCH", f"/api/requests/{req_id}/accept", tokB)
check("B accepts the request",
      s == 200 and d.get("request", {}).get("status") == "accepted", f"({s})")

s, d = call("PATCH", f"/api/requests/{req_id}/accept", tokB)
check("Re-accepting blocked (409)", s == 409, f"({s}: {d.get('detail')})")

# ---- 8. connections visible to both sides ----
s, d = call("GET", "/api/requests/connections", tokA)
connA = [c for c in d.get("connections", []) if c["user"] and c["user"]["id"] == bid]
check("A sees B under Connections", s == 200 and len(connA) == 1, f"({s})")
check("Connection includes conversation_id (Message button)",
      bool(connA and connA[0].get("conversation_id")))

s, d = call("GET", "/api/requests/connections", tokB)
connB = [c for c in d.get("connections", []) if c["user"] and c["user"]["id"] == me_id]
check("B sees A under Connections", s == 200 and len(connB) == 1, f"({s})")

s, d = call("GET", "/api/users/search?q=" + urllib.request.quote(bpub or ""), tokA)
rel = (d.get("users") or [{}])[0].get("relationship", {})
check("A searching B shows relationship=connected",
      rel.get("relationship") == "connected", str(rel))

s, d = call("POST", "/api/requests", tokA, {"receiver_id": bid})
check("New request to connected user blocked (409)", s == 409, f"({s}: {d.get('detail')})")

# ---- 9. cancel flow (third real user C) ----
C = {"name": "E2E Two Gamma", "email": f"e2e2c_{STAMP}@test.com", "password": "Str0ngPass!x"}
call("POST", "/signup", body=C)
tokC = token_for(C)
s, d = call("GET", "/me", tokC)
cid = d.get("user", {}).get("id")
cpub = d.get("user", {}).get("public_id")

s, d = call("POST", "/api/requests", tokA, {"receiver_id": cid})
creq = d.get("request", {}).get("id")
check("A sends request to C", s == 200, f"({s})")

s, d = call("DELETE", f"/api/requests/{creq}", tokA)
check("A cancels own sent request",
      s == 200 and d.get("request", {}).get("status") == "cancelled", f"({s})")

s, d = call("GET", "/api/requests", tokC)
recvC = [r for r in d.get("requests", [])
         if r["status"] == "pending" and r["direction"] == "received"]
check("Cancelled request no longer pending for C", len(recvC) == 0, f"({len(recvC)} pending)")

# ---- 10. decline flow; declined resets relationship ----
s, d = call("POST", "/api/requests", tokA, {"receiver_id": cid})
dreq = d.get("request", {}).get("id")
s, d = call("PATCH", f"/api/requests/{dreq}/reject", tokC)
check("C declines A's request",
      s == 200 and d.get("request", {}).get("status") == "rejected", f"({s})")

s, d = call("GET", "/api/users/search?q=" + urllib.request.quote(cpub or ""), tokA)
rel = (d.get("users") or [{}])[0].get("relationship", {})
check("After decline, relationship resets (Connect allowed again)",
      rel.get("relationship") == "none", str(rel))

# ---- 11. profile modal endpoint ----
s, d = call("GET", f"/api/users/{bid}", tokA)
check("Profile data (GET /api/users/{id}) with relationship",
      s == 200 and d.get("user", {}).get("name") == B["name"]
      and d.get("relationship", {}).get("connected") is True, f"({s})")

# ---- cleanup: remove ONLY users created by this test run ----
from database import SessionLocal  # noqa: E402
from models import (User, ConnectionRequest, Connection,  # noqa: E402
                    Conversation, ConversationParticipant, Message)
from sqlalchemy import or_  # noqa: E402

db = SessionLocal()
try:
    test_emails = [A["email"], B["email"], C["email"]]
    users = db.query(User).filter(User.email.in_(test_emails)).all()
    ids = [u.id for u in users]
    if ids:
        conv_ids = [
            row[0] for row in db.query(ConversationParticipant.conversation_id)
            .filter(ConversationParticipant.user_id.in_(ids)).all()
        ]
        db.query(Message).filter(Message.conversation_id.in_(conv_ids)) \
            .delete(synchronize_session=False)
        db.query(ConversationParticipant).filter(
            ConversationParticipant.conversation_id.in_(conv_ids)) \
            .delete(synchronize_session=False)
        db.query(Conversation).filter(Conversation.id.in_(conv_ids)) \
            .delete(synchronize_session=False)
        db.query(ConnectionRequest).filter(or_(
            ConnectionRequest.sender_id.in_(ids),
            ConnectionRequest.receiver_id.in_(ids))) \
            .delete(synchronize_session=False)
        db.query(Connection).filter(or_(
            Connection.user_one_id.in_(ids),
            Connection.user_two_id.in_(ids))) \
            .delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(ids)).delete(synchronize_session=False)
        db.commit()
    print(f"\nCLEANUP: removed {len(ids)} test users created by this run")
finally:
    db.close()

failed = [r for r in results if not r[1]]
print(f"\n=== RESULT: {len(results) - len(failed)}/{len(results)} passed ===")
for label, _, extra in failed:
    print("  FAILED:", label, extra)
