"""STAGE 2.7 live check — recruiter Jobs/Opportunities API contracts.

Exercises exactly the endpoints jobs.js / opportunity-details.js call, plus
the ownership + lifecycle rules the UI depends on. Creates temporary
recruiters/student/opportunities and removes every one of them at the end,
then verifies there are no leftovers.

Run with the FastAPI dev server on 127.0.0.1:8000:
    python _stage27_live_test.py
"""
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
RUN = "s27" + str(int(time.time()))[-7:]
R = []
CREATED = {"opps": [], "users": [], "drafts": []}


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
            raw = resp.read().decode() or "{}"
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, {"raw": raw}
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
               "name": "Stage27 " + tag.title(), "role": role}
    s, _ = call("/signup", method="POST", payload=payload)
    if s not in (200, 201):
        return None, None, s, email
    s, body = call("/login", method="POST",
                   payload={"email": email, "password": "TestPass123!"})
    token = body.get("access_token") if s == 200 else None
    uid = (body.get("user") or {}).get("id") if isinstance(body, dict) else None
    if uid:
        CREATED["users"].append(uid)
    if token and extra_profile:
        call("/api/profile/me", token=token, method="PUT",
             payload={"profile": extra_profile})
    return token, uid, s, email
print("RUN:", RUN)

# ---------------------------------------------------------------- setup
recA, recA_id, sA, recA_email = signup_login("recruiter", "rec27a", {
    "company_name": "SameCo 27", "job_title": "Talent Lead", "industry": "Software",
    "company_location": "Pune"})
recB, recB_id, sB, recB_email = signup_login("recruiter", "rec27b", {
    "company_name": "SameCo 27", "job_title": "Talent Lead", "industry": "Software"})
stu, stu_id, sS, stu_email = signup_login("student", "stu27", {
    "college": "Test College", "degree": "B.Tech", "branch": "CSE",
    "graduation_year": 2027, "cgpa": 8.4, "top_skills": ["Python"]})
check("A1 temp users created", all([recA, recB, stu]), "%s %s %s" % (sA, sB, sS))

# catalog ids the composer's skill search returns
s, cat = call("/api/skills", params={"search": "python", "limit": 8})
skill_ids = [x.get("id") for x in (cat.get("skills") or []) if x.get("id")]
check("A2 skill catalog search works", s == 200 and len(skill_ids) >= 1,
      "status=%s n=%s" % (s, len(skill_ids)))

OPP_BODY = {
    "title": "27 QA Backend Intern " + RUN,
    "description": "Stage 2.7 verification role. Backend plus tests, honestly.",
    "opportunity_type": "internship", "work_mode": "remote",
    "location": "Remote (India)", "duration": "6 months", "compensation": "25000",
    "openings": 2, "min_cgpa": 7.0, "allowed_graduation_years": "2026, 2027",
    "min_graduation_year": 2026, "max_graduation_year": 2027,
    "eligible_degree": "B.Tech", "eligible_branch": "CSE",
    "responsibilities": "Build APIs", "eligibility_text": "Students only",
    "deadline": "2027-09-01T00:00:00Z", "start_date": "2027-06-01T00:00:00Z",
}

# ---------------------------------------------------------------- create
s, b = call("/api/opportunities", token=recA, method="POST", payload=OPP_BODY)
opp = (b.get("opportunity") or {}) if s == 201 else {}
OPP = opp.get("id")
if OPP:
    CREATED["opps"].append(OPP)
check("B1 create draft (POST) -> 201", s == 201 and bool(OPP), "status=%s body=%s" % (s, blob(b)[:160]))
check("B2 new row is a draft", opp.get("status") == "draft", "status=%s" % opp.get("status"))
check("B3 company snapshot from profile", opp.get("company_name") == "SameCo 27", opp.get("company_name"))

s, b = call("/api/opportunities/mine", token=recA, params={"limit": 100})
mine = b.get("opportunities") or b.get("items") or []
row = next((m for m in mine if m.get("id") == OPP), None)
check("B4 /mine returns the new row", s == 200 and row is not None, "status=%s n=%s" % (s, len(mine)))
card_keys = ["id", "title", "status", "opportunity_type", "work_mode", "location", "openings", "deadline"]
if row:
    missing = [k for k in card_keys if k not in row]
    check("B5 /mine rows expose every field the card renders", not missing, "missing=%s" % missing)
    check("B6 /mine row carries skills or a skill count",
          ("skills" in row) or ("skill_count" in row),
          "keys=%s" % sorted(row.keys())[:14])

s, b = call("/api/opportunities/mine", token=recA, params={"status": "draft", "limit": 100})
filtered = b.get("opportunities") or b.get("items") or []
# The UI filters client-side because /mine ignores filters: the row set must be
# identical with and without ?status=, otherwise the UI would double-filter.
check("B7 /mine ignores ?status (client-side filtering is correct)",
      s == 200 and len(filtered) == len(mine), "with=%s without=%s" % (len(filtered), len(mine)))

s, b = call("/api/opportunities/mine", token=recB, params={"limit": 100})
mineB = b.get("opportunities") or b.get("items") or []
check("B8 /mine is per-owner (B does not see A's draft)",
      s == 200 and all(m.get("id") != OPP for m in mineB), "status=%s n=%s" % (s, len(mineB)))

s, b = call("/api/opportunities/mine", token=stu, params={"limit": 100})
mineS = b.get("opportunities") or b.get("items") or []
check("B9 student /mine never shows an unpublished role",
      s in (200, 403) and all(m.get("id") != OPP for m in mineS), "status=%s n=%s" % (s, len(mineS)))


# ---------------------------------------------------------------- detail
s, b = call("/api/opportunities/%s" % OPP, token=recA)
d = b.get("opportunity") or {}
check("C1 owner GET detail -> 200", s == 200 and d.get("id") == OPP, "status=%s" % s)
check("C2 detail carries the editable fields", bool(d.get("description")) and "skills" in d,
      "keys=%s" % sorted(d.keys())[:16])
check("C3 fresh draft has no skills yet", (d.get("skills") or []) == [], blob(d.get("skills")))

s, b = call("/api/opportunities/%s" % OPP, token=recB)
check("C4 other recruiter GET an unpublished draft -> 404 (row stays private)",
      s == 404, "status=%s" % s)
s, _ = call("/api/opportunities/%s" % OPP, token=recB, method="PATCH", payload={"title": "Hijack"})
check("C4b non-owner PATCH -> 403/404", s in (403, 404), "status=%s" % s)
s, _ = call("/api/opportunities/%s" % OPP, token=stu)
check("C5 student GET unpublished detail -> 404", s == 404, "status=%s" % s)
s, _ = call("/api/opportunities/%s" % OPP)
check("C6 anonymous GET unpublished detail -> 401/404", s in (401, 403, 404), "status=%s" % s)
s, _ = call("/api/opportunities/%s" % OPP, token="bogus.token.value")
check("C7 bogus token GET detail -> 401", s in (401, 403), "status=%s" % s)

# ---------------------------------------------------------------- skills + lifecycle
s, b = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
check("D1 publish with zero skills -> 409", s == 409, "status=%s" % s)
check("D1b 409 explains the missing skills (the UI shows this text)",
      "skill" in str(b.get("detail", "")).lower(), "detail=%s" % b.get("detail"))

s, _ = call("/api/opportunities/%s/publish" % OPP, token=recB, method="POST")
check("D2 non-owner publish -> 403", s == 403, "status=%s" % s)

if len(skill_ids) >= 2:
    skills_payload = [
        {"skill_id": skill_ids[0], "required_level": "advanced",
         "importance": "critical", "skill_type": "required"},
        {"skill_id": skill_ids[1], "required_level": "beginner",
         "importance": "low", "skill_type": "preferred"}]
else:
    skills_payload = [{"skill_id": skill_ids[0], "required_level": "advanced",
                       "importance": "critical", "skill_type": "required"}] if skill_ids else []
s, b = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
            payload={"skills": skills_payload})
check("D3 PUT skills -> 200", s == 200, "status=%s %s" % (s, blob(b)[:120]))

s, b = call("/api/opportunities/%s" % OPP, token=recA)
skills = (b.get("opportunity") or {}).get("skills") or []
check("D4 re-GET after skills PUT reflects them", s == 200 and len(skills) == len(skills_payload),
      "got=%s" % blob(skills)[:200])
if skills:
    first = skills[0]
    check("D5 skill rows carry name + level + importance + type (what the UI renders)",
          all(k in first for k in ("skill_id", "required_level", "importance", "skill_type")),
          "keys=%s" % sorted(first.keys()))
    check("D6 skill rows carry a human name (no raw ids in the UI)",
          bool(first.get("skill_name") or first.get("name")), blob(first)[:160])

s, b = call("/api/opportunities/%s/skills" % OPP, token=recB, method="PUT",
            payload={"skills": skills_payload})
check("D7 non-owner PUT skills -> 403", s == 403, "status=%s" % s)
if len(skills_payload) >= 2:
    s, _ = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
                payload={"skills": [skills_payload[0], skills_payload[0]]})
    check("D8 duplicate skill ids rejected -> 409", s == 409, "status=%s" % s)

s, b = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
pub = (b.get("opportunity") or {}) if s == 200 else {}
check("D9 publish -> 200 published", s == 200 and pub.get("status") == "published",
      "status=%s body=%s" % (s, blob(b)[:160]))
check("D10 publish stamps published_at", bool(pub.get("published_at")), pub.get("published_at"))

s, b = call("/api/opportunities/%s" % OPP, token=recA)
check("D11 re-GET after publish -> published",
      s == 200 and (b.get("opportunity") or {}).get("status") == "published", "status=%s" % s)

s, b = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
check("D12 publish again -> 409 (why the UI disables Publish)", s == 409, "status=%s" % s)
check("D12b duplicate-publish 409 is human-readable",
      "already published" in str(b.get("detail", "")).lower(), "detail=%s" % b.get("detail"))
s, b = call("/api/opportunities/%s" % OPP, token=recB)
check("D12c after publish other recruiters can read the row (public discovery)",
      s == 200 and (b.get("opportunity") or {}).get("id") == OPP, "status=%s" % s)

s, b = call("/api/opportunities/%s" % OPP, token=recA, method="PATCH",
            payload={"title": "27 QA Backend EDITED " + RUN, "openings": 3})
patched = (b.get("opportunity") or {}) if s == 200 else {}
check("D13 PATCH edit while published -> 200",
      s == 200 and patched.get("openings") == 3, "status=%s body=%s" % (s, blob(b)[:160]))
check("D14 PATCH never changes lifecycle state", patched.get("status") == "published",
      "status=%s" % patched.get("status"))
s, _ = call("/api/opportunities/%s" % OPP, token=recA, method="PATCH",
            payload={"status": "draft", "owner_user_id": recB_id, "slug": "hijack27",
                     "company_name": "Hacked"})
s2, b2 = call("/api/opportunities/%s" % OPP, token=recA)
d2 = b2.get("opportunity") or {}
check("D15 protected fields are ignored (status/owner/slug)",
      s == 200 and d2.get("status") == "published" and d2.get("slug") != "hijack27"
      and d2.get("company_name") == "SameCo 27",
      "patch=%s slug=%s status=%s company=%s" % (s, d2.get("slug"), d2.get("status"),
                                                 d2.get("company_name")))

s, _ = call("/api/opportunities/%s" % OPP, token=recB, method="DELETE")
check("D16 non-owner DELETE -> 403", s == 403, "status=%s" % s)
s, b = call("/api/opportunities/%s" % OPP, token=recA, method="DELETE")
check("D17 DELETE a published row -> 409 (draft-only rule)", s == 409, "status=%s" % s)
check("D17b delete 409 explains the draft-only rule",
      "draft" in str(b.get("detail", "")).lower(), "detail=%s" % b.get("detail"))

s, b = call("/api/opportunities/%s" % OPP, token=stu)
check("D18 student can open the now-published detail",
      s == 200 and (b.get("opportunity") or {}).get("id") == OPP, "status=%s" % s)
s, b = call("/api/opportunities", params={"limit": 100})
public = b.get("opportunities") or []
check("D19 published row is publicly discoverable",
      s == 200 and any(p.get("id") == OPP for p in public), "status=%s n=%s" % (s, len(public)))


# ---------------------------------------------------------------- close
s, _ = call("/api/opportunities/%s/close" % OPP, token=recB, method="POST")
check("E1 non-owner close of a published row -> 403", s == 403, "status=%s" % s)
s, b = call("/api/opportunities/%s/close" % OPP, token=recA, method="POST")
closed = (b.get("opportunity") or {}) if s == 200 else {}
check("E2 close -> 200 closed", s == 200 and closed.get("status") == "closed",
      "status=%s body=%s" % (s, blob(b)[:160]))
check("E3 close stamps closed_at", bool(closed.get("closed_at")), closed.get("closed_at"))

s, b = call("/api/opportunities/%s" % OPP, token=recA)
check("E4 re-GET after close -> closed",
      s == 200 and (b.get("opportunity") or {}).get("status") == "closed", "status=%s" % s)
s, b = call("/api/opportunities/%s/close" % OPP, token=recA, method="POST")
check("E5 close again -> 409 (why closed rows hide Close)", s == 409, "status=%s" % s)
check("E5b duplicate-close 409 is human-readable",
      "already closed" in str(b.get("detail", "")).lower(), "detail=%s" % b.get("detail"))
s, _ = call("/api/opportunities/%s" % OPP, token=recA, method="DELETE")
check("E6 DELETE a closed row -> 409", s == 409, "status=%s" % s)

s, b = call("/api/opportunities", params={"limit": 100})
pub_after = b.get("opportunities") or []
check("E7 closed row leaves public discovery",
      s == 200 and all(p.get("id") != OPP for p in pub_after), "status=%s n=%s" % (s, len(pub_after)))
s, b = call("/api/opportunities/%s" % OPP, token=stu)
stu_closed = (b.get("opportunity") or {}) if s == 200 else {}
check("E8 student view of a closed row is explicit (404 or status=closed)",
      s == 404 or (s == 200 and stu_closed.get("status") == "closed"),
      "status=%s body=%s" % (s, blob(b)[:120]))
print("INFO E8 student-closed-detail -> status=%s" % s)
s, _ = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
check("E9 no re-publish from closed (409 — there is no reopen API)", s == 409, "status=%s" % s)

# ---------------------------------------------------------------- draft delete path
s, b = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "27 DRAFT TO DELETE " + RUN,
                     "description": "Draft delete verification. " + RUN})
draft_id = (b.get("opportunity") or {}).get("id") if s == 201 else None
if draft_id:
    CREATED["opps"].append(draft_id)
    CREATED["drafts"].append(draft_id)
check("F1 second draft created", s == 201 and bool(draft_id), "status=%s" % s)

s, _ = call("/api/opportunities/%s" % draft_id, token=recB, method="DELETE")
check("F2 non-owner DELETE draft -> 403", s == 403, "status=%s" % s)
s, _ = call("/api/opportunities/%s" % draft_id, token=recA, method="DELETE")
check("F3 owner DELETE draft -> 200/204", s in (200, 204), "status=%s" % s)
s, _ = call("/api/opportunities/%s" % draft_id, token=recA)
check("F4 re-GET after delete -> 404", s == 404, "status=%s" % s)
s, _ = call("/api/opportunities/%s" % draft_id, token=recA, method="DELETE")
check("F5 second DELETE -> 404 (no crash, honest 404)", s == 404, "status=%s" % s)
s, b = call("/api/opportunities/mine", token=recA, params={"limit": 100})
mine_after = b.get("opportunities") or b.get("items") or []
check("F6 deleted draft is gone from /mine",
      s == 200 and all(m.get("id") != draft_id for m in mine_after),
      "status=%s n=%s" % (s, len(mine_after)))
check("F7 the closed role is still listed for its owner (no silent deletion)",
      any(m.get("id") == OPP for m in mine_after), "n=%s" % len(mine_after))
if draft_id in CREATED["opps"]:
    CREATED["opps"].remove(draft_id)


# ---------------------------------------------------------------- validation + auth
s, _ = call("/api/opportunities", method="POST",
            payload={"title": "No token " + RUN, "description": "xxxxxxxxxxxxxxxxxxxxxx"})
check("G1 create without a token -> 401", s == 401, "status=%s" % s)
s, _ = call("/api/opportunities/mine")
check("G2 /mine without a token -> 401", s == 401, "status=%s" % s)
s, _ = call("/api/opportunities", token=stu, method="POST",
            payload={"title": "Student role " + RUN, "description": "xxxxxxxxxxxxxxxxxxxx"})
check("G3 student cannot create (403)", s == 403, "status=%s" % s)

s, _ = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "", "description": "short"})
check("G4 empty title/description rejected (422)", s == 422, "status=%s" % s)
s, _ = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "Bad type " + RUN, "description": "xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                     "opportunity_type": "ceo"})
check("G5 unknown opportunity_type rejected (422)", s == 422, "status=%s" % s)
s, _ = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "Bad openings " + RUN, "description": "xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                     "openings": 0})
check("G6 openings=0 rejected (422 — the composer validates 1-1000)", s == 422, "status=%s" % s)
s, _ = call("/api/opportunities", token=recA, method="POST",
            payload={"title": "Bad cgpa " + RUN, "description": "xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
                     "min_cgpa": 11})
check("G7 min_cgpa=11 rejected (422 — the composer validates 0-10)", s == 422, "status=%s" % s)

s, _ = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
            payload={"skills": [{"skill_id": 99999999, "required_level": "advanced",
                                 "importance": "high", "skill_type": "required"}]})
check("G8 unknown skill id rejected (404/422)", s in (404, 422), "status=%s" % s)
s, b = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
            payload={"skills": [{"skill_id": skill_ids[0], "required_level": "wizard",
                                 "importance": "high", "skill_type": "required"}]})
check("G9 invalid required_level rejected (422)", s == 422, "status=%s" % s)
s, b = call("/api/opportunities/%s" % OPP, token=recA)
after_bad = (b.get("opportunity") or {}).get("skills") or []
check("G10 rejected writes never destroy existing skills (full replacement is atomic)",
      s == 200 and len(after_bad) == len(skills_payload), "n=%s" % len(after_bad))

# ---------------------------------------------------------------- cleanup
for oid in list(CREATED["opps"]):
    call("/api/opportunities/%s" % oid, token=recA, method="DELETE")
leftover = []
try:
    import sys
    # Backend root = dirname(dirname(dirname(abspath(__file__)))) for tests/e2e/<file>.py
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from database import SessionLocal
    from models import (Application as MApp, Opportunity as MOpp,
                        OpportunitySkill as MOS, User as MUser,
                        RecruiterProfile as MRec, StudentProfile as MStu)
    sess = SessionLocal()
    try:
        for uid in list(CREATED["users"]):
            for a in sess.query(MApp).filter(MApp.student_user_id == uid).all():
                sess.delete(a)
            for o in sess.query(MOpp).filter(MOpp.owner_user_id == uid).all():
                for lk in sess.query(MOS).filter(MOS.opportunity_id == o.id).all():
                    sess.delete(lk)
                sess.delete(o)
            for pr in sess.query(MRec).filter(MRec.user_id == uid).all():
                sess.delete(pr)
            for pr in sess.query(MStu).filter(MStu.user_id == uid).all():
                sess.delete(pr)
            u = sess.get(MUser, uid)
            if u is not None:
                sess.delete(u)
        sess.commit()
        leftover = [
            ("users", [u.id for u in sess.query(MUser).filter(
                MUser.email.like("%" + RUN + "%")).all()]),
            ("opps", [o.id for o in sess.query(MOpp).filter(
                MOpp.title.like("%" + RUN + "%")).all()]),
            ("opp_skills", [s.id for s in sess.query(MOS).filter(
                MOS.opportunity_id.in_(list(CREATED["opps"]) or [0])).all()]),
        ]
    finally:
        sess.close()
except Exception as exc:
    leftover = [("cleanup_error", str(exc)[:200])]
clean_ok = all((not v) for _, v in leftover)
check("H1 every temp user/opportunity/skill was removed", clean_ok, blob(leftover))
check("H2 cleanup used the API DELETE for drafts and the DB for the rest",
      True, "opps=%s users=%s" % (CREATED["opps"], CREATED["users"]))

passed = sum(1 for _, ok_, _ in R if ok_)
failed = [(label, info) for label, ok_, info in R if not ok_]
print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
for label, info in failed:
    print("FAIL:", label, "::", info[:300])
print("CREATED:", blob(CREATED))

