"""STAGE 2.6 live check part 1."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

# ---------------------------------------------------------------- target safety
# Local-only by default. Pointing TEST_BASE at a non-local host requires an
# explicit two-variable opt-in, because every e2e suite creates and deletes
# real rows against the target it is given. This guard runs before any
# request is sent and before any fixture is created.
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
    print("These suites create and delete real fixtures on the target.")
    print("To run against a remote target on purpose, set BOTH:")
    print("    TEST_ALLOW_REMOTE=1")
    print("    TEST_CONFIRM=yes-i-know")
    raise SystemExit(2)
RUN = "s26" + str(int(time.time()))[-7:]
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
               "name": "Stage26 " + tag.title(), "role": role}
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

print("RUN:", RUN)
recA, recA_id, sA = signup_login("recruiter", "rec26a", {"company_name": "SameCo 26",
    "job_title": "Hiring", "industry": "Software", "company_location": "Remote"})
recB, recB_id, sB = signup_login("recruiter", "rec26b", {"company_name": "SameCo 26",
    "job_title": "Hiring", "industry": "Software"})
recN, recN_id, sN = signup_login("recruiter", "rec26n")
stu, stu_id, sS = signup_login("student", "stu26", {"college": "Test College",
    "degree": "B.Tech", "branch": "CSE", "graduation_year": 2027, "cgpa": 8.4,
    "top_skills": ["Python"]})
check("users created", all([recA, recB, recN, stu]), "%s %s %s %s" % (sA, sB, sN, sS))
s, _ = call("/api/opportunities", token=stu, method="POST",
            payload={"title": "Nope", "description": "xxxxxxxxxxxxxxxxxxxx"})
check("1 student cannot create (403)", s == 403, "status=%s" % s)
s, b = call("/api/opportunities", token=recN, method="POST",
            payload={"title": "NoCo", "description": "no company yet " + RUN})
NOCO = (b.get("opportunity") or {}).get("id") if s == 201 else None
if NOCO:
    CREATED["opps"].append(NOCO)
check("no-company draft allowed (company null)",
      s == 201 and (b.get("opportunity") or {}).get("company_name") is None,
      "status=%s %s" % (s, blob(b)[:160]))
s, _ = call("/api/opportunities/%s/publish" % NOCO, token=recN, method="POST")
check("no-company publish blocked (409)", s == 409, "status=%s" % s)
opp = {"title": "26 QA Backend Intern " + RUN,
       "description": "Stage 2.6 end-to-end verification role. Backend plus tests.",
       "opportunity_type": "internship", "work_mode": "remote",
       "location": "Remote", "duration": "6 months", "compensation": "25000",
       "openings": 2, "min_cgpa": 7.0, "allowed_graduation_years": "2026, 2027",
       "min_graduation_year": 2026, "max_graduation_year": 2027,
       "eligible_degree": "B.Tech", "eligible_branch": "CSE",
       "responsibilities": "Build APIs", "eligibility_text": "Students only"}
s, b = call("/api/opportunities", token=recA, method="POST", payload=opp)
OPP = (b.get("opportunity") or {}).get("id") if s == 201 else None
check("2 create draft 201 + id", s == 201 and bool(OPP), "status=%s" % s)
if OPP:
    CREATED["opps"].append(OPP)
    check("3 status draft", (b.get("opportunity") or {}).get("status") == "draft", "ok")
    check("4 company snapshot", (b.get("opportunity") or {}).get("company_name") == "SameCo 26",
          (b.get("opportunity") or {}).get("company_name"))
s, _ = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "", "description": "short"})
check("6 invalid fields rejected (422)", s == 422, "status=%s" % s)
s, _ = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "Bad type " + RUN, "description": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", "opportunity_type": "ceo"})
check("6b bad type rejected (422)", s == 422, "status=%s" % s)
if OPP:
    s, b = call("/api/opportunities/%s" % OPP, token=recA, method="PATCH",
                payload={"title": "26 QA Backend EDITED " + RUN, "openings": 3})
    check("5 PATCH edit works", s == 200 and (b.get("opportunity") or {}).get("openings") == 3, "status=%s" % s)
    s, _ = call("/api/opportunities/%s" % OPP, token=recA, method="PATCH",
                payload={"owner_user_id": 1, "company_name": "Hacked", "slug": "x", "status": "published"})
    s2, b2 = call("/api/opportunities/%s" % OPP, token=recA)
    b2o = b2.get("opportunity") or {}
    check("protected fields ignored (owner/slug/status intact)",
          s == 200 and s2 == 200 and b2o.get("slug") != "x" and b2o.get("status") == "draft",
          "patch=%s get=%s slug=%s status=%s" % (s, s2, b2o.get("slug"), b2o.get("status")))
    s, _ = call("/api/opportunities/%s" % OPP, token=recB, method="PATCH", payload={"title": "Hijack"})
    check("3B same-company non-owner edit 403", s == 403, "status=%s" % s)
    s, _ = call("/api/opportunities/%s/publish" % OPP, token=recB, method="POST")
    check("4B same-company non-owner publish 403", s == 403, "status=%s" % s)
    s, _ = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
                payload={"skills": [{"skill_id": 999999999, "required_level": "advanced"}]})
    check("7 invalid skill rejected (404)", s == 404, "status=%s" % s)
    s, sk = call("/api/skills/catalog?q=&limit=3", token=recA)
    ids = [x["id"] for x in (sk.get("skills") or [])][:2]
    if len(ids) >= 1:
        s, _ = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
                    payload={"skills": [{"skill_id": ids[0]}, {"skill_id": ids[0]}]})
        check("8 duplicate skills 409", s == 409, "status=%s" % s)
    s, _ = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
    check("publish blocked without skills (409)", s == 409, "status=%s" % s)
    if len(ids) >= 2:
        s, b = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
                    payload={"skills": [{"skill_id": ids[0], "required_level": "advanced", "importance": "high", "skill_type": "required"},
                                        {"skill_id": ids[1], "required_level": "intermediate", "importance": "medium", "skill_type": "preferred"}]})
        check("11 skills PUT works", s == 200, "status=%s" % s)
        s, b = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
        check("13 publish works", s == 200 and (b.get("opportunity") or {}).get("status") == "published", "status=%s" % s)
OPP2 = None
s, b = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "26 DRAFT ONLY " + RUN, "description": "Draft privacy check. " + RUN})
if s == 201:
    OPP2 = (b.get("opportunity") or {}).get("id")
    CREATED["opps"].append(OPP2)
check("draft2 created", bool(OPP2), "status=%s" % s)
s, b = call("/api/opportunities", params={"limit": 100})
pub = b.get("opportunities") or []
check("9 draft private", s == 200 and all(p.get("id") != OPP2 for p in pub), "n=%s" % len(pub))
check("10 published public", s == 200 and any(p.get("id") == OPP for p in pub), "status=%s" % s)
s, b = call("/api/opportunities/mine", token=recA)
mine = b.get("opportunities") or b.get("items") or []
check("15 mine contains created", s == 200 and any(m.get("id") == OPP for m in mine), "n=%s" % len(mine))
s, _ = call("/api/opportunities/%s/publish" % OPP, token=stu, method="POST")
check("2 student publish blocked", s in (401, 403, 404), "status=%s" % s)
s, b = call("/api/opportunities/%s" % OPP, token=stu)
check("17 detail opens (authenticated)", s == 200 and (b.get("opportunity") or {}).get("id") == OPP, "status=%s" % s)
s, _ = call("/api/opportunities/%s" % OPP2, token=stu)
check("9b draft detail hidden from students (404)", s == 404, "status=%s" % s)
if OPP:
    s, _ = call("/api/opportunities/%s/close" % OPP, token=recB, method="POST")
    check("recB close blocked 403", s == 403, "status=%s" % s)
    s, b = call("/api/opportunities/%s/close" % OPP, token=recA, method="POST")
    check("close works", s == 200 and (b.get("opportunity") or {}).get("status") == "closed", "status=%s" % s)
    s, b = call("/api/opportunities", params={"limit": 100})
    pub2 = b.get("opportunities") or []
    check("11 closed hidden", s == 200 and all(p.get("id") != OPP for p in pub2), "status=%s" % s)
for oid in list(CREATED["opps"]):
    call("/api/opportunities/%s" % oid, token=recA, method="DELETE")
for uid in list(CREATED["users"]):
    try:
        import sys
        # Backend root for tests/e2e/<file>.py (was cwd-relative "backend-I")
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        from database import SessionLocal
        from models import Application as MApp, Opportunity as MOpp, OpportunitySkill as MOS, User as MUser
        sess = SessionLocal()
        try:
            for a in sess.query(MApp).filter(MApp.student_user_id == uid).all():
                sess.delete(a)
            for o in sess.query(MOpp).filter(MOpp.owner_user_id == uid).all():
                for lk in sess.query(MOS).filter(MOS.opportunity_id == o.id).all():
                    sess.delete(lk)
                sess.delete(o)
            u = sess.get(MUser, uid)
            if u is not None:
                sess.delete(u)
            sess.commit()
        finally:
            sess.close()
    except Exception as exc:
        check("cleanup user %s" % uid, False, str(exc)[:200])
passed = sum(1 for _, ok, _ in R if ok)
failed = [(label, info) for label, ok, info in R if not ok]
print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
for label, info in failed:
    print("FAIL:", label, "::", info[:300])
print("CREATED:", blob(CREATED))
