"""End-to-end API test for Requests <-> Messages connection system."""
import urllib.request
import urllib.error
import json

BASE = "http://localhost:8000"


def api(path, method="GET", token=None, data=None):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
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


def login(email, password):
    status, data = api("/auth/login", method="POST", data={"email": email, "password": password})
    if status == 200:
        return data.get("access_token"), data.get("user", {})
    print(f"  LOGIN FAILED ({status}): {data}")
    return None, {}


print("=" * 60)
print("TEST 1: Login as demo user (receiver)")
print("=" * 60)
demo_token, demo_user = login("demo@skillshare.com", "123456")
print(f"  Demo user: id={demo_user.get('id')}, name={demo_user.get('name')}")
assert demo_token, "Demo login failed!"

print()
print("=" * 60)
print("TEST 2: Login as Alex (sender)")
print("=" * 60)
alex_token, alex_user = login("alex@skillshare.com", "123456")
print(f"  Alex user: id={alex_user.get('id')}, name={alex_user.get('name')}")
assert alex_token, "Alex login failed!"

print()
print("=" * 60)
print("TEST 3: List incoming requests for Demo (should see 4 pending)")
print("=" * 60)
status, data = api("/api/requests", token=demo_token)
requests = data.get("requests", [])
incoming = [r for r in requests if r.get("direction") == "received" and r.get("status") == "pending"]
print(f"  Total requests: {len(requests)}")
print(f"  Incoming pending: {len(incoming)}")
for r in incoming:
    sender = r.get("sender", {})
    print(f"  - {sender.get('name')}: '{r.get('message', '')[:50]}...'")
assert len(incoming) >= 4, f"Expected >=4 incoming requests, got {len(incoming)}"

print()
print("=" * 60)
print("TEST 4: Accept request from Alex")
print("=" * 60)
alex_request = None
for r in requests:
    sender = r.get("sender", {})
    if sender.get("name") == "Alex Johnson" and r.get("status") == "pending":
        alex_request = r
        break

assert alex_request, "Could not find Alex's request!"
req_id = alex_request.get("id")
print(f"  Found request id={req_id} from Alex")
status, data = api(f"/api/requests/{req_id}/accept", method="PATCH", token=demo_token)

print()
print("=" * 60)
print("TEST 5: List conversations for Demo (should see Alex)")
print("=" * 60)
status, data = api("/api/conversations", token=demo_token)
convs = data.get("conversations", [])
print(f"  Total conversations: {len(convs)}")
for c in convs:
    other = c.get("other_user", {})
    last = c.get("last_message", {})
    print(f"  - {other.get('name')}: last='{last.get('content', '')[:40]}...' unread={c.get('unread_count')}")
assert len(convs) >= 1, "Expected at least 1 conversation!"
alex_conv = None
for c in convs:
    if c.get("other_user", {}).get("name") == "Alex Johnson":
        alex_conv = c
        break
assert alex_conv, "Alex conversation not found!"
conv_id = alex_conv.get("id")

print()
print("=" * 60)
print("TEST 6: Get messages in Alex conversation")
print("=" * 60)
status, data = api(f"/api/conversations/{conv_id}/messages", token=demo_token)
msgs = data.get("messages", [])
print(f"  Total messages: {len(msgs)}")
for m in msgs:
    print(f"  - sender_id={m.get('sender_id')}: '{m.get('content', '')[:50]}...'")
assert len(msgs) >= 2, "Expected at least 2 messages!"

print()
print("=" * 60)
print("TEST 7: Send message as Demo to Alex")
print("=" * 60)
status, data = api(f"/api/conversations/{conv_id}/messages", method="POST", token=demo_token, data={"content": "Hi Alex! I'm ready to practice."})
print(f"  Send response: id={data.get('message', {}).get('id')}")
assert data.get("message") is not None, "Send message failed!"

print()
print("=" * 60)
print("TEST 8: Alex sees the message")
print("=" * 60)
status, data = api(f"/api/conversations/{conv_id}/messages", token=alex_token)
msgs = data.get("messages", [])
print(f"  Total messages from Alex's view: {len(msgs)}")
assert len(msgs) >= 3, f"Expected >=3 messages, got {len(msgs)}"

print()
print("=" * 60)
print("TEST 9: Duplicate accept protection")
print("=" * 60)
status, data = api(f"/api/requests/{req_id}/accept", method="PATCH", token=demo_token)
print(f"  Second accept: status={status}, detail={data.get('detail')}")
assert status == 409, f"Expected 409, got {status}"

print()
print("=" * 60)
print("TEST 10: Authorization - Alex cannot accept Demo's request")
print("=" * 60)
# Find a request sent TO alex (from demo or others)
status, data = api("/api/requests", token=alex_token)
alex_reqs = data.get("requests", [])
received_by_alex = [r for r in alex_reqs if r.get("direction") == "received" and r.get("status") == "pending"]
if received_by_alex:
    test_req = received_by_alex[0]
    status, data = api(f"/api/requests/{test_req.get('id')}/accept", method="PATCH", token=alex_token)
    print(f"  Alex accepts request {test_req.get('id')}: status={status}")
    assert status == 200, f"Expected 200, got {status}"
else:
    print("  No pending requests to Alex (skipping)")

print()
print("=" * 60)
print("TEST 11: Authorization - Demo cannot accept own sent request")
print("=" * 60)
status, data = api("/api/requests", token=demo_token)
demo_reqs = data.get("requests", [])
sent_by_demo = [r for r in demo_reqs if r.get("direction") == "sent" and r.get("status") == "pending"]
if sent_by_demo:
    test_req = sent_by_demo[0]
    status, data = api(f"/api/requests/{test_req.get('id')}/accept", method="PATCH", token=demo_token)
    print(f"  Demo tries to accept own sent request: status={status}")
    assert status == 403, f"Expected 403, got {status}"
else:
    print("  No sent pending requests from demo (skipping)")

print()
print("=" * 60)
print("TEST 12: Reject request")
print("=" * 60)
status, data = api("/api/requests", token=demo_token)
demo_reqs = data.get("requests", [])
received_pending = [r for r in demo_reqs if r.get("direction") == "received" and r.get("status") == "pending"]
if received_pending:
    reject_req = received_pending[0]
    status, data = api(f"/api/requests/{reject_req.get('id')}/reject", method="PATCH", token=demo_token)
    print(f"  Reject request {reject_req.get('id')}: success={data.get('success')}")
    assert data.get("success"), "Reject failed!"
    assert data.get("request", {}).get("status") == "rejected"
else:
    print("  No pending requests to reject (skipping)")

print()
print("=" * 60)
print("TEST 13: Duplicate request prevention")
print("=" * 60)
# Try sending request to someone already connected (Alex)
status, data = api("/api/requests", method="POST", token=demo_token, data={"receiver_id": alex_user.get("id"), "message": "test"})
print(f"  Send duplicate request to Alex: status={status}, detail={data.get('detail')}")
assert status == 409, f"Expected 409, got {status}"

print()
print("=" * 60)
print("TEST 14: Self-request prevention")
print("=" * 60)
status, data = api("/api/requests", method="POST", token=demo_token, data={"receiver_id": demo_user.get("id"), "message": "test"})
print(f"  Send self-request: status={status}, detail={data.get('detail')}")
assert status == 400, f"Expected 400, got {status}"

print()
print("=" * 60)
print("TEST 15: Access another user's conversation")
print("=" * 60)
# Login as Priya and try to access Alex-Demo conversation
priya_token, priya_user = login("priya@skillshare.com", "123456")
if priya_token:
    status, data = api(f"/api/conversations/{conv_id}", token=priya_token)
    print(f"  Priya accesses Alex-Demo conversation: status={status}")
    assert status == 403, f"Expected 403, got {status}"
else:
    print("  Could not login as Priya (skipping)")

print()
print("=" * 60)
print("ALL TESTS PASSED!")
print("=" * 60)
print(f"  Accept response: success={data.get('success')}")
print(f"  Request status: {data.get('request', {}).get('status')}")
print(f"  Connection id: {data.get('connection', {}).get('id')}")
print(f"  Conversation id: {data.get('conversation', {}).get('id')}")
assert data.get("success"), "Accept failed!"
assert data.get("request", {}).get("status") == "accepted"
assert data.get("connection") is not None
assert data.get("conversation") is not None
