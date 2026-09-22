"""STAGE 9.2 - opportunity archival hardening (part 1: harness).

Terminal archive lifecycle WITHOUT touching Stages 25B-29:
  published -> archive -> archived (terminal)
  closed    -> archive -> archived (terminal)

Local by default; refuses remote unless TEST_ALLOW_REMOTE=1 and
TEST_CONFIRM=yes-i-know (same banner convention as stages 25B-29).
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE = "http://127.0.0.1:8000"
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1", "0.0.0.0")

BASE = (os.environ.get("TEST_BASE") or "").strip() or DEFAULT_BASE
TARGET_HOST = (urllib.parse.urlsplit(BASE).hostname or "").lower()
IS_LOCAL = (TARGET_HOST in LOCAL_HOSTS
            or TARGET_HOST.startswith("127.")
            or TARGET_HOST.endswith(".localhost"))
ALLOW_REMOTE = (os.environ.get("TEST_ALLOW_REMOTE") or "").strip() == "1"
REMOTE_CONFIRM = (os.environ.get("TEST_CONFIRM") or "").strip().lower() == "yes-i-know"

print("TEST TARGET:", BASE)
print("TEST TARGET MODE:", "LOCAL" if IS_LOCAL
      else ("REMOTE - EXPLICITLY AUTHORIZED"
            if (ALLOW_REMOTE and REMOTE_CONFIRM) else "REMOTE"))
if not IS_LOCAL and not (ALLOW_REMOTE and REMOTE_CONFIRM):
    print("REFUSING TO RUN: TEST_BASE points at a non-local host (%s)." % TARGET_HOST)
    raise SystemExit(2)

RUN = "s30" + str(int(time.time()))[-7:]
R = []
CREATED = {"opps": [], "users": [], "applications": []}


def call(path, token=None, method="GET", payload=None, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode() or "{}")
        except Exception:
            return exc.code, {}
    except Exception as exc:
        return 0, {"error": str(exc)}


def check(label, ok, info=""):
    R.append((label, bool(ok), str(info)))


def blob(o):
    return json.dumps(o, default=str)


def signup_login(role, tag, extra_profile=None):
    email = tag + "_" + RUN + "@test.local"
    payload = {"email": email, "password": "TestPass123!",
               "name": "Stage30 " + tag.title(), "role": role}
    s, _ = call("/signup", method="POST", payload=payload)
    if s not in (200, 201):
        return None, None, s
    s, body = call("/login", method="POST",
                   payload={"email": email, "password": "TestPass123!"})
    token = body.get("access_token") if s == 200 else None
    uid = (body.get("user") or {}).get("id") if isinstance(body, dict) else None
    if uid:
        CREATED["users"].append(uid)
    if token and extra_profile:
        call("/api/profile/me", token=token, method="PUT",
             payload={"profile": extra_profile})
    return token, uid, s


def mk_draft(token, title):
    payload = {"title": title + " " + RUN,
               "description": "Stage 9.2 archival regression draft. " + RUN,
               "opportunity_type": "internship", "work_mode": "remote",
               "location": "Remote", "duration": "3 months",
               "openings": 1,
               "min_graduation_year": 2025, "max_graduation_year": 2028,
               "eligible_degree": "B.Tech", "eligible_branch": "CSE"}
    s, b = call("/api/opportunities", token=token, method="POST", payload=payload)
    oid = (b.get("opportunity") or {}).get("id") if s == 201 else None
    if oid:
        CREATED["opps"].append(oid)
    return s, b, oid


def attach_first_skill(token, oid):
    s, sk = call("/api/skills/catalog?q=&limit=3", token=token)
    ids = [x["id"] for x in (sk.get("skills") or [])][:1]
    if not ids:
        return False
    s, _ = call("/api/opportunities/%s/skills" % oid, token=token, method="PUT",
                payload={"skills": [{"skill_id": ids[0],
                                     "required_level": "beginner",
                                     "importance": "low",
                                     "skill_type": "required"}]})
    return s == 200


def add_skill(token, name, level="beginner"):
    """Student skill write via POST /api/profile/skills (stage28/29 recipe)."""
    s, b = call("/api/profile/skills", token=token, method="POST",
                payload={"skill_name": name, "level": level})
    return s in (200, 201)


print("RUN:", RUN)
recA = recB = stu = None
try:
    recA, _, sA = signup_login("recruiter", "rec30a",
        {"company_name": "ArchCo 30", "job_title": "Hiring",
         "industry": "Software", "company_location": "Remote"})
    recB, _, sB = signup_login("recruiter", "rec30b",
        {"company_name": "ArchCo 30", "job_title": "Hiring",
         "industry": "Software"})
    stu, _, sS = signup_login("student", "stu30",
        {"college": "Test College", "degree": "B.Tech", "branch": "CSE",
         "graduation_year": 2027, "cgpa": 8.4, "top_skills": ["Python"]})
    check("users created", all([recA, recB, stu]), "%s %s %s" % (sA, sB, sS))
    if not all([recA, recB, stu]):
        raise SystemExit(0)

    # item 1: draft DELETE 200 + gone for owner
    s, _, DRAFT = mk_draft(recA, "30 DRAFT DELETE")
    check("draft created (201)", s == 201 and bool(DRAFT), "st=%s" % s)
    s, _ = call("/api/opportunities/%s" % DRAFT, token=recA, method="DELETE")
    check("1 draft DELETE 200", s == 200, "st=%s" % s)
    s, _ = call("/api/opportunities/%s" % DRAFT, token=recA)
    check("1 draft gone for owner (404)", s == 404, "st=%s" % s)

    # item 11a: draft cannot be archived
    s, _, ND = mk_draft(recA, "30 DRAFT NOARCH")
    check("draft2 created (201)", s == 201 and bool(ND), "st=%s" % s)
    s, b = call("/api/opportunities/%s/archive" % ND, token=recA, method="POST")
    check("11 draft archive 409", s == 409, "st=%s %s" % (s, blob(b)[:120]))

    # publishable fixture on the published path
    s, _, PUB = mk_draft(recA, "30 PUB ARCH")
    check("pub fixture created", s == 201 and bool(PUB), "st=%s" % s)
    check("pub fixture skill attached", attach_first_skill(recA, PUB), "")
    s, _ = call("/api/opportunities/%s/publish" % PUB, token=recA, method="POST")
    check("pub fixture published", s == 200, "st=%s" % s)

    # item 2: published DELETE 409
    s, b = call("/api/opportunities/%s" % PUB, token=recA, method="DELETE")
    check("2 published DELETE 409", s == 409, "st=%s %s" % (s, blob(b)[:120]))

    # items 5/6: non-owner + student archive blocked
    s, _ = call("/api/opportunities/%s/archive" % PUB, token=recB, method="POST")
    check("5 non-owner archive 403", s == 403, "st=%s" % s)
    s, _ = call("/api/opportunities/%s/archive" % PUB, token=stu, method="POST")
    check("6 student archive 403", s in (401, 403), "st=%s" % s)

    # item 4: owner archives published
    s, b = call("/api/opportunities/%s/archive" % PUB, token=recA, method="POST")
    check("4 owner archive published -> archived (200)",
          s == 200 and (b.get("opportunity") or {}).get("status") == "archived",
          "st=%s" % s)

    # item 7: archived hidden from public list
    s, b = call("/api/opportunities", params={"limit": 100})
    pub = b.get("opportunities") or []
    check("7 archived hidden from public list",
          s == 200 and all(p.get("id") != PUB for p in pub), "n=%s" % len(pub))

    # item 11b/c: archived is terminal (publish/close rejected)
    s, _ = call("/api/opportunities/%s/publish" % PUB, token=recA, method="POST")
    check("11 archived re-publish 409", s == 409, "st=%s" % s)
    s, _ = call("/api/opportunities/%s/close" % PUB, token=recA, method="POST")
    check("11 archived close 409", s == 409, "st=%s" % s)

    # item 12: repeat archive deterministic
    s, _ = call("/api/opportunities/%s/archive" % PUB, token=recA, method="POST")
    check("12 repeat archive 409 already-archived", s == 409, "st=%s" % s)
    s, b = call("/api/opportunities/%s" % PUB, token=recA)
    check("12 state still archived",
          s == 200 and (b.get("opportunity") or {}).get("status") == "archived",
          "st=%s" % s)

    # item 8: archived cannot be applied to
    s, b = call("/api/opportunities/%s/apply" % PUB, token=stu,
                method="POST", payload={})
    check("8 apply on archived 409", s == 409, "st=%s %s" % (s, blob(b)[:160]))

    # closed path: publish -> close, then item 3 (closed DELETE 409)
    s, _, CLS = mk_draft(recA, "30 CLS ARCH")
    check("closed-path fixture created", s == 201 and bool(CLS), "st=%s" % s)
    check("closed-path skill attached", attach_first_skill(recA, CLS), "")
    s, _ = call("/api/opportunities/%s/publish" % CLS, token=recA, method="POST")
    check("closed-path published", s == 200, "st=%s" % s)
    s, _ = call("/api/opportunities/%s/close" % CLS, token=recA, method="POST")
    check("closed-path closed", s == 200, "st=%s" % s)
    s, b = call("/api/opportunities/%s" % CLS, token=recA, method="DELETE")
    check("3 closed DELETE 409 (history preserved)", s == 409,
          "st=%s %s" % (s, blob(b)[:120]))

    # items 9/10: application survives close -> archive.
    # The 201 happens in the published window; close -> archive follow, then
    # both sides must still read the row.
    s, _, HFI = mk_draft(recA, "30 HIST FIX")
    check("history fixture created", s == 201 and bool(HFI), "st=%s" % s)
    s, sk = call("/api/skills/catalog?q=&limit=3", token=recA)
    first = (sk.get("skills") or [{}])[0]
    SKID, SKNAME = first.get("id"), first.get("name") or "Python"
    if SKID:
        s, _ = call("/api/opportunities/%s/skills" % HFI, token=recA, method="PUT",
                    payload={"skills": [{"skill_id": SKID,
                                         "required_level": "beginner",
                                         "importance": "low",
                                         "skill_type": "required"}]})
        check("history fixture skill attached", s == 200, "st=%s" % s)
    else:
        check("history fixture skill attached", False, "no catalog skill")
    s, _ = call("/api/opportunities/%s/publish" % HFI, token=recA, method="POST")
    check("history fixture published", s == 200, "st=%s" % s)
    check("history student skill added", add_skill(stu, SKNAME, "expert"), SKNAME)
    s, b = call("/api/opportunities/%s/apply" % HFI, token=stu,
                method="POST", payload={"cover_note": "Stage 9.2 history check"})
    APP = (b.get("application") or {}).get("id") if s == 201 else None
    if APP:
        CREATED["applications"].append(APP)
    check("history fixture applied (201)", s == 201 and bool(APP),
          "st=%s %s" % (s, blob(b)[:200]))
    s, _ = call("/api/opportunities/%s/close" % HFI, token=recA, method="POST")
    check("history fixture closed", s == 200, "st=%s" % s)
    s, b = call("/api/opportunities/%s/archive" % HFI, token=recA, method="POST")
    check("history fixture archived",
          s == 200 and (b.get("opportunity") or {}).get("status") == "archived",
          "st=%s" % s)
    if APP:
        s, b = call("/api/applications/me", token=stu, params={"limit": 100})
        mine = b.get("applications") or b.get("items") or []
        check("9 student still reads application after archive",
              s == 200 and any(a.get("id") == APP for a in mine),
              "st=%s n=%s" % (s, len(mine)))
        s, b = call("/api/opportunities/%s/applications" % HFI, token=recA)
        # list_applicants uses the "items" envelope; each item nests the row
        # under "application" (see _serialize_applicant).
        rows = b.get("items") or b.get("applications") or []
        check("10 recruiter still reads applicants after archive",
              s == 200 and any((a.get("application") or {}).get("id") == APP
                               or a.get("id") == APP for a in rows),
              "st=%s n=%s" % (s, len(rows)))
    s, b = call("/api/opportunities/%s/archive" % CLS, token=recA, method="POST")
    check("closed -> archived (200)",
          s == 200 and (b.get("opportunity") or {}).get("status") == "archived",
          "st=%s" % s)
finally:
    # Captured ids only. Archived rows cannot be deleted via the API by
    # design (draft-only DELETE protects history); drafts are removed
    # through the owner API.
    for oid in list(CREATED["opps"]):
        try:
            call("/api/opportunities/%s" % oid, token=recA, method="DELETE")
        except Exception:
            pass

passed = sum(1 for _, ok, _ in R if ok)
failed = [(label, info) for label, ok, info in R if not ok]
print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
for label, info in failed:
    print("FAIL:", label, "::", info[:300])
print("CREATED:", blob(CREATED))
