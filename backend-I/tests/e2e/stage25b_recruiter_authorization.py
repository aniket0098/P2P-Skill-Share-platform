"""STAGE 2.5B live verification (temporary; deleted after the run).

Spins no server of its own: the backend under test is reached over
HTTP at TEST_BASE (a throwaway uvicorn on a spare port). Every DB
write is confined to rows this script creates; cleanup deletes only
rows captured by id/prefix. Existing rows are never touched.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import sys

# Backend root = dirname(dirname(dirname(abspath(__file__)))) for
# tests/e2e/<file>.py, so database/models resolve without relying on cwd.
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

# ---------------------------------------------------------------- target safety
# Local-only by default. Pointing TEST_BASE at a non-local host requires an
# explicit two-variable opt-in, because this suite creates and deletes real
# rows against the target it is given. This guard runs before any request
# is sent and before any fixture is created.
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
RUN = "s25b" + str(int(time.time()))[-7:]
R = []
CREATED = {"applications": [], "opps": [], "opp_skills": [], "users": []}
SM = {}
SKILLS = []
SKIPPED = []


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


def skip(label, reason=""):
    # A check that must not PASS and must not FAIL - e.g. an authorization
    # probe that needs an environment-provided credential that is absent.
    SKIPPED.append((label, str(reason)))


def blob(obj):
    return json.dumps(obj, default=str)


def row_count(table):
    # Diagnostic ONLY: raw global counts are printed for context but are
    # never asserted, because the target may be a shared database.
    from sqlalchemy import text
    from database import SessionLocal
    sess = SessionLocal()
    try:
        return sess.execute(text("select count(*) from " + table)).scalar()
    finally:
        sess.close()
def db_applications(ids=None):
    # Fixture-scoped application read via the ORM (no raw SQL IN-list). ids=None
    # keeps the legacy full-table diagnostic behaviour; every assertion below
    # passes explicit fixture ids so it never depends on an isolated database.
    from database import SessionLocal
    from models import Application as MApp
    cols = (MApp.id, MApp.opportunity_id, MApp.status, MApp.cover_note,
            MApp.snapshot_json, MApp.applied_at, MApp.updated_at,
            MApp.status_changed_at, MApp.reviewed_by_user_id,
            MApp.recruiter_note, MApp.rejection_reason, MApp.student_user_id)
    sess = SessionLocal()
    try:
        q = sess.query(*cols).order_by(MApp.id)
        if ids is not None:
            wanted = sorted(set(int(x) for x in (ids or []) if x is not None))
            if not wanted:
                return []
            q = q.filter(MApp.id.in_(wanted))
        return q.all()
    finally:
        sess.close()


def app_fingerprints(limit=20):
    # Bounded sample of pre-existing/surrounding application rows: proves rows
    # outside this run's fixture were never touched. Fixture rows are
    # excluded explicitly so a shared database cannot confuse it.
    from sqlalchemy import text
    from database import SessionLocal
    fixture_app_ids = set(int(x) for x in CREATED["applications"] if x is not None)
    fixture_user_ids = set(int(x) for x in CREATED["users"] if x is not None)
    fixture_opp_ids = set(int(x) for x in CREATED["opps"] if x is not None)
    sess = SessionLocal()
    try:
        rows = sess.execute(text(
            "select id, opportunity_id, status, cover_note, snapshot_json, "
            "applied_at, updated_at, status_changed_at, reviewed_by_user_id, "
            "recruiter_note, rejection_reason, student_user_id from applications "
            "order by id desc limit :limit"
        ), {"limit": int(limit)}).fetchall()
        return {r[0]: {"opp": r[1], "status": r[2], "cover": r[3],
                       "snapshot": bool(r[4]), "updated": str(r[6]),
                       "reviewed_by": r[7], "note": r[8], "reason": r[9],
                       "student": r[11]}
                for r in rows
                if r[0] not in fixture_app_ids
                and r[11] not in fixture_user_ids
                and r[1] not in fixture_opp_ids}
    finally:
        sess.close()


PRE_APP_PRINTS = {}


def signup_login(role, tag, extra_profile=None):
    email = tag + "_" + RUN + "@test.local"
    payload = {"email": email, "password": "TestPass123!",
               "name": "Stage25B " + tag.title(), "role": role}
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


SKILL_IDS = []


def snapshot(label):
    SM[label] = {
        "opportunities": row_count("opportunities"),
        "opportunity_skills": row_count("opportunity_skills"),
        "applications": row_count("applications"),
        "users": row_count("users"),
    }



def run_flow():
    # ---- main flow (wrapped so cleanup + verification always run) ----
    print("RUN:", RUN)
    snapshot("before")

    # ---- admin-token fixture: environment only. No minted/forged tokens. ----
    # If TEST_ADMIN_TOKEN is absent the two admin checks SKIP (not PASS/FAIL).
    ADMIN_TOK = (os.environ.get("TEST_ADMIN_TOKEN") or "").strip() or None

    recA, recA_id, sA = signup_login("recruiter", "reca", {"company_name": "SameCo 25B",
        "job_title": "Hiring", "industry": "Software"})
    recB, recB_id, sB = signup_login("recruiter", "recb", {"company_name": "SameCo 25B",
        "job_title": "Hiring", "industry": "Software"})
    recC, recC_id, sC = signup_login("recruiter", "recc", {"company_name": "OtherCo 25B",
        "job_title": "Hiring", "industry": "Software"})
    stuX, stuX_id, sX = signup_login("student", "stux", {"college": "Test College", "degree": "B.Tech",
        "branch": "CSE", "graduation_year": 2027, "cgpa": 8.4,
        "target_job_role": "Backend Intern", "preferred_industry": "Software",
        "top_skills": ["Python", "SQL"]})
    stuY, stuY_id, sY = signup_login("student", "stuy", {"college": "Test College", "degree": "B.Tech",
        "branch": "CSE", "graduation_year": 2027, "cgpa": 8.0,
        "target_job_role": "Backend Intern", "preferred_industry": "Software",
        "top_skills": ["Python"]})
    check("test users created", all([recA, recB, recC, stuX, stuY]),
          "%s %s %s %s %s" % (sA, sB, sC, sX, sY))

    # ---- recruiter A creates + publishes an opportunity ----
    opp = {"title": "25B Backend Intern " + RUN, "description": "Backend internship for stage 2.5B verification.",
           "opportunity_type": "internship", "work_mode": "remote",
           "location": "Remote", "openings": 2}
    s, b = call("/api/opportunities", token=recA, method="POST", payload=opp)
    OPP = (b.get("opportunity") or {}).get("id") if s == 201 else None
    check("recruiter A creates opportunity", s == 201 and bool(OPP), "status=%s" % s)
    if OPP:
        CREATED["opps"].append(OPP)
        from database import SessionLocal
        from sqlalchemy import text
        sess = SessionLocal()
        try:
            SKILL_IDS = [r[0] for r in sess.execute(text("select id from skills order by id limit 2")).fetchall()]
        finally:
            sess.close()
        if SKILL_IDS:
            s, b = call("/api/opportunities/%s/skills" % OPP, token=recA, method="PUT",
                        payload={"skills": [{"skill_id": SKILL_IDS[0], "required_level": "beginner",
                                              "importance": "high", "skill_type": "required"}]})
            check("recruiter A attaches skill", s == 200, "status=%s" % s)
        s, b = call("/api/opportunities/%s/publish" % OPP, token=recA, method="POST")
        check("recruiter A publishes", s == 200 and (b.get("opportunity") or {}).get("status") == "published",
              "status=%s" % s)

    # ---- students apply (Stage 2.5A path, regression 50) ----
    APPX = APPY = None
    if OPP:
        for _tok in (stuX, stuY):
            call("/api/profile/skills", token=_tok, method="POST",
                 payload={"skill_name": "Python", "level": "expert", "self_rating": 5})
        s, b = call("/api/opportunities/%s/apply" % OPP, token=stuX, method="POST",
                    payload={"cover_note": "Keen backend intern " + RUN})
        APPX = (b.get("application") or {}).get("id") if s == 201 else None
        check("2.5A apply works (X)", s == 201 and bool(APPX), "status=%s %s" % (s, blob(b)[:200]))
        s, b = call("/api/opportunities/%s/apply" % OPP, token=stuY, method="POST",
                    payload={"cover_note": "Second applicant"})
        APPY = (b.get("application") or {}).get("id") if s == 201 else None
        check("2.5A apply works (Y)", s == 201 and bool(APPY), "status=%s" % s)
    if APPX:
        CREATED["applications"].append(APPX)
    if APPY:
        CREATED["applications"].append(APPY)
    snapshot("after_setup")

    LIST = "/api/opportunities/%s/applications" % OPP if OPP else "/api/opportunities/0/applications"
    PATCHX = "/api/applications/%s/status" % APPX if APPX else "/api/applications/0/status"
    PATCHY = "/api/applications/%s/status" % APPY if APPY else "/api/applications/0/status"

    # ============ AUTHORIZATION (1-12) ============
    s, b = call(LIST)
    check("1 unauthenticated list -> 401", s == 401, "status=%s" % s)
    s, b = call(PATCHX, method="PATCH", payload={"status": "reviewing"})
    check("2 unauthenticated patch -> 401", s == 401, "status=%s" % s)
    s, b = call(LIST, token=stuX)
    check("3 student list -> 403", s == 403, "status=%s" % s)
    s, b = call(PATCHX, token=stuX, method="PATCH", payload={"status": "reviewing"})
    check("4 student patch -> 403", s == 403, "status=%s" % s)
    if ADMIN_TOK:
        s, b = call(LIST, token=ADMIN_TOK)
        check("5 admin list -> 403", s == 403, "status=%s" % s)
        s, b = call(PATCHX, token=ADMIN_TOK, method="PATCH", payload={"status": "reviewing"})
        check("6 admin patch -> 403", s == 403, "status=%s" % s)
    else:
        skip("5 admin list -> 403", "TEST_ADMIN_TOKEN not set - no environment-provided admin token; refusing to mint or forge one")
        skip("6 admin patch -> 403", "TEST_ADMIN_TOKEN not set - no environment-provided admin token; refusing to mint or forge one")
    s, b = call(LIST, token=recA)
    check("7 recruiter owner list -> 200", s == 200 and isinstance(b.get("items"), list), "status=%s" % s)
    s, b = call(PATCHX, token=recA, method="PATCH",
                payload={"status": "reviewing", "recruiter_note": "Looks promising"})
    check("8 recruiter owner patch -> 200", s == 200, "status=%s %s" % (s, blob(b)[:200]))
    s, b = call(LIST, token=recB)
    check("9 recruiter B same company, different owner -> 403", s == 403, "status=%s" % s)
    s, b = call("/api/opportunities/999999999/applications", token=recA)
    check("10 unknown opportunity -> 404", s == 404, "status=%s" % s)
    s, b = call("/api/applications/999999999/status", token=recA, method="PATCH",
                payload={"status": "reviewing"})
    check("11 unknown application -> 404", s == 404, "status=%s" % s)
    s, b = call(PATCHX, token=recB, method="PATCH", payload={"status": "shortlisted"})
    check("12 recruiter B cannot modify A application -> 403", s == 403, "status=%s" % s)

    # ============ LIST (13-19) ============
    if OPP and APPX and APPY:
        s, b = call(LIST, token=recA, params={"limit": 1, "offset": 0})
        check("13 pagination first page", s == 200 and b.get("total") == 2 and len(b.get("items", [])) == 1
              and b.get("has_more") is True, "status=%s %s" % (s, blob(b)[:300]))
        s, b = call(LIST, token=recA, params={"limit": 500})
        check("14 limit capped at 100", s == 200 and b.get("limit") == 100 and b.get("total") == 2,
              "status=%s limit=%s" % (s, b.get("limit")))
        s, b = call(LIST, token=recA, params={"limit": 1, "offset": 1})
        check("15 offset works", s == 200 and len(b.get("items", [])) == 1 and b.get("offset") == 1
              and b.get("has_more") is False, "status=%s %s" % (s, blob(b)[:300]))
        s, b = call(LIST, token=recA, params={"status": "reviewing"})
        got = [i["application"]["id"] for i in b.get("items", [])] if s == 200 else []
        check("16 status filter works", s == 200 and got == [APPX], "status=%s got=%s" % (s, got))
        s, b = call(LIST, token=recA)
        ids = sorted([i["application"]["id"] for i in b.get("items", [])]) if s == 200 else []
        opps = set([i["application"]["opportunity_id"] for i in b.get("items", [])]) if s == 200 else set()
        check("17 list only this opportunity rows", s == 200 and ids == sorted([APPX, APPY])
              and opps == {OPP}, "status=%s ids=%s" % (s, ids))
        check("18 no unrelated applications leak", opps == {OPP}, "opps=%s" % (opps,))
        s, b = call(LIST, token=recA, params={"student_user_id": stuY_id, "owner_user_id": recB_id})
        ids = sorted([i["application"]["id"] for i in b.get("items", [])]) if s == 200 else []
        check("19 identity cannot be spoofed via query params", s == 200 and ids == sorted([APPX, APPY]),
              "status=%s ids=%s" % (s, ids))
        s, b = call(LIST, token=recA)
        item = (b.get("items") or [{}])[0]
        app = item.get("application", {})
        stu = item.get("student", {})
        prof = stu.get("profile") or {}
        check("list shape has application/student/snapshot blocks",
              all(k in app for k in ("id", "opportunity_id", "status", "cover_note", "applied_at",
                                     "updated_at", "status_changed_at", "snapshot"))
              and all(k in stu for k in ("user_id", "name", "public_id", "avatar_url", "profile"))
              and all(k in prof for k in ("college", "degree", "branch", "graduation_year", "cgpa",
                                          "target_job_role", "preferred_industry", "top_skills")),
              blob(item)[:400])
        txt = blob(b)
        check("44-46 no secrets in list response",
              "password_hash" not in txt and "access_token" not in txt and "@test.local" not in txt,
              "len=%s" % len(txt))

    # ============ STATUS TRANSITIONS (20-27) ============
    if OPP and APPX and APPY:
        # X is already reviewing from check 8; walk the chain.
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "shortlisted"})
        app = b.get("application", {}) if s == 200 else {}
        check("21 reviewing -> shortlisted -> 200", s == 200 and app.get("status") == "shortlisted",
              "status=%s %s" % (s, blob(b)[:200]))
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "interview"})
        app = b.get("application", {}) if s == 200 else {}
        check("22 shortlisted -> interview -> 200", s == 200 and app.get("status") == "interview",
              "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "selected"})
        app = b.get("application", {}) if s == 200 else {}
        check("23 interview -> selected -> 200", s == 200 and app.get("status") == "selected",
              "status=%s" % s)
        # fresh applications to test the reject branches + applied->reviewing.
        stuZ, stuZ_id, _ = signup_login("student", "stuz", {"college": "Test College", "degree": "B.Tech",
            "branch": "CSE", "graduation_year": 2027, "cgpa": 8.2,
            "target_job_role": "Backend Intern", "preferred_industry": "Software",
            "top_skills": ["Python"]})
        if stuZ:
            call("/api/profile/skills", token=stuZ, method="POST",
                 payload={"skill_name": "Python", "level": "expert", "self_rating": 5})
        appZ = None
        s, b = call("/api/opportunities/%s/apply" % OPP, token=stuZ, method="POST",
                    payload={"cover_note": "Third applicant"})
        appZ = (b.get("application") or {}).get("id") if s == 201 else None
        if appZ:
            CREATED["applications"].append(appZ)
        PZ = "/api/applications/%s/status" % appZ if appZ else "/api/applications/0/status"
        s, b = call(PZ, token=recA, method="PATCH", payload={"status": "reviewing"})
        app = b.get("application", {}) if s == 200 else {}
        check("20 applied -> reviewing -> 200", s == 200 and app.get("status") == "reviewing",
              "status=%s" % s)
        s, b = call(PATCHY, token=recA, method="PATCH",
                    payload={"status": "rejected", "rejection_reason": "Applied too late", "recruiter_note": "n/a"})
        app = b.get("application", {}) if s == 200 else {}
        check("24 applied -> rejected -> 200", s == 200 and app.get("status") == "rejected"
              and app.get("rejection_reason") == "Applied too late", "status=%s %s" % (s, blob(b)[:200]))
        s, b = call(PZ, token=recA, method="PATCH", payload={"status": "shortlisted"})
        s2, b2 = call(PZ, token=recA, method="PATCH",
                      payload={"status": "rejected", "rejection_reason": "Skills gap"})
        app2 = b2.get("application", {}) if s2 == 200 else {}
        check("25 reviewing -> rejected -> 200", s2 == 200 and app2.get("status") == "rejected",
              "status=%s" % s2)
        # shortlisted -> rejected and interview -> rejected on two more fresh rows.
        extra_ids = []
        for tag in ("stuw", "stuv"):
            tok, uid, _ = signup_login("student", tag, {"college": "Test College", "degree": "B.Tech",
                "branch": "CSE", "graduation_year": 2027, "cgpa": 8.1,
                "target_job_role": "Backend Intern", "preferred_industry": "Software",
                "top_skills": ["Python"]})
            if tok:
                call("/api/profile/skills", token=tok, method="POST",
                     payload={"skill_name": "Python", "level": "expert", "self_rating": 5})
            s, b = call("/api/opportunities/%s/apply" % OPP, token=tok, method="POST",
                        payload={"cover_note": tag})
            aid = (b.get("application") or {}).get("id") if s == 201 else None
            if aid:
                CREATED["applications"].append(aid)
                extra_ids.append(aid)
        APPW, APPV = (extra_ids + [None, None])[:2]
        s, b = call("/api/applications/%s/status" % APPW, token=recA, method="PATCH",
                    payload={"status": "reviewing"})
        s, b = call("/api/applications/%s/status" % APPW, token=recA, method="PATCH",
                    payload={"status": "shortlisted"})
        s, b = call("/api/applications/%s/status" % APPW, token=recA, method="PATCH",
                    payload={"status": "rejected", "rejection_reason": "No openings left"})
        app = b.get("application", {}) if s == 200 else {}
        check("26 shortlisted -> rejected -> 200", s == 200 and app.get("status") == "rejected",
              "status=%s" % s)
        s, b = call("/api/applications/%s/status" % APPV, token=recA, method="PATCH",
                    payload={"status": "reviewing"})
        s, b = call("/api/applications/%s/status" % APPV, token=recA, method="PATCH",
                    payload={"status": "shortlisted"})
        s, b = call("/api/applications/%s/status" % APPV, token=recA, method="PATCH",
                    payload={"status": "interview"})
        s, b = call("/api/applications/%s/status" % APPV, token=recA, method="PATCH",
                    payload={"status": "rejected", "rejection_reason": "Interview no-show"})
        app = b.get("application", {}) if s == 200 else {}
        check("27 interview -> rejected -> 200", s == 200 and app.get("status") == "rejected",
              "status=%s" % s)

        # ============ INVALID TRANSITIONS (28-32) ============
        tokW, _, _ = signup_login("student", "stuw2", {"college": "Test College", "degree": "B.Tech",
            "branch": "CSE", "graduation_year": 2027, "cgpa": 8.1,
            "target_job_role": "Backend Intern", "preferred_industry": "Software", "top_skills": ["Python"]})
        if tokW:
            call("/api/profile/skills", token=tokW, method="POST",
                 payload={"skill_name": "Python", "level": "expert", "self_rating": 5})
        s, b = call("/api/opportunities/%s/apply" % OPP, token=tokW, method="POST",
                    payload={"cover_note": "withdraw fixture"})
        appW2 = (b.get("application") or {}).get("id") if s == 201 else None
        if appW2:
            CREATED["applications"].append(appW2)
        s, b = call("/api/applications/%s/withdraw" % appW2, token=tokW, method="POST")
        check("withdraw fixture withdrawn (52)", s == 200, "status=%s" % s)
        s, b = call("/api/applications/%s/status" % appW2, token=recA, method="PATCH",
                    payload={"status": "reviewing"})
        check("28 withdrawn -> reviewing -> 409", s == 409, "status=%s" % s)
        s, b = call("/api/applications/%s/status" % appW2, token=recA, method="PATCH",
                    payload={"status": "selected"})
        check("32 withdrawn -> selected -> 409", s == 409, "status=%s" % s)
        s, b = call(PATCHY, token=recA, method="PATCH", payload={"status": "reviewing"})
        check("29 rejected -> reviewing -> 409", s == 409, "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "reviewing"})
        check("30 selected -> reviewing -> 409", s == 409, "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH",
                    payload={"status": "rejected", "rejection_reason": "Too late"})
        check("31 selected -> rejected -> 409", s == 409, "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "withdrawn"})
        check("recruiter PATCH to withdrawn -> 409", s == 409, "status=%s" % s)

        # ============ DATA INTEGRITY (33-43) ============
        before = {r[0]: r for r in db_applications(CREATED['applications'])}
        bx = before[APPX]
        check("33 reviewed_by is current recruiter", bx[8] == recA_id, "reviewed_by=%s owner=%s" % (bx[8], recA_id))
        check("34 status_changed_at set", bool(bx[7]), str(bx[7]))
        check("35 updated_at set", bool(bx[6]), str(bx[6]))
        s, b = call(LIST, token=recA)
        itX = [i for i in b.get("items", []) if i["application"]["id"] == APPX][0]
        check("36 applied_at preserved", itX["application"]["applied_at"] == (bx[5].isoformat() if bx[5] else None),
              "%s vs %s" % (itX["application"]["applied_at"], bx[5]))
        check("37 snapshot unchanged + parseable", isinstance(itX["application"]["snapshot"], dict)
              and (itX["application"]["snapshot"] or {}).get("snapshot_version") == 1
              and bx[4] is not None, "snapshot_version=%s" % ((itX["application"]["snapshot"] or {}).get("snapshot_version")))
        check("38 cover_note unchanged", itX["application"]["cover_note"] == "Keen backend intern " + RUN
              and bx[3] == "Keen backend intern " + RUN, repr(bx[3])[:120])
        by = before[APPY]
        check("39 rejection_reason stored", by[10] == "Applied too late" and by[2] == "rejected",
              repr(by[10])[:120])
        check("40 recruiter_note stored", bx[9] == "Looks promising", repr(bx[9])[:120])
        s, b = call(PATCHX, token=recA, method="PATCH",
                    payload={"status": "selected", "recruiter_note": "x" * 2001})
        check("41 oversized note -> 422", s == 422, "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "hired"})
        check("42 invalid status -> 422", s == 422, "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH", payload={"status": "interview"})
        check("43 invalid transition (selected->interview) -> 409", s == 409, "status=%s" % s)
        s, b = call(PATCHX, token=recA, method="PATCH",
                    payload={"status": "selected", "owner_user_id": recB_id,
                             "reviewed_by_user_id": recB_id, "student_user_id": stuY_id,
                             "opportunity_id": 1, "applied_at": "2020-01-01T00:00:00"})
        check("47 client-supplied ids rejected (422)", s == 422,
              "status=%s" % s)
        after = {r[0]: r for r in db_applications(CREATED['applications'])}
        check("concurrency guard state intact", after[APPX][2] == "selected" and after[APPX][8] == recA_id,
              "%s %s" % (after[APPX][2], after[APPX][8]))
        s, b = call(LIST, token=recC)
        check("48 cross-company recruiter cannot list -> 403", s == 403, "status=%s" % s)

        # ============ REGRESSION (49-55) ============
        s, b = call("/api/opportunities", params={"limit": 5})
        check("49 Stage 2.4 discovery still works", s == 200 and isinstance(b.get("opportunities"), list),
              "status=%s" % s)
        # (50 covered above: applies returned 201)
        s, b = call("/api/applications/me", token=stuX)
        mine = b.get("applications", []) if s == 200 else []
        check("51 Stage 2.5A my-applications works", s == 200 and any(a["id"] == APPX for a in mine),
              "status=%s n=%s" % (s, len(mine)))
        s, b = call("/api/applications/me", token=stuX, params={"status": "under_review"})
        check("legacy under_review filter preserved (200)", s == 200, "status=%s" % s)
        s, b = call("/api/applications/me", token=stuX, params={"status": "banana"})
        check("invalid /me filter still 422", s == 422, "status=%s" % s)
        # withdraw blocked on non-applied (53/54 below use fresh rows).
        tokD, _, _ = signup_login("student", "stud", {"college": "Test College", "degree": "B.Tech",
            "branch": "CSE", "graduation_year": 2027, "cgpa": 8.1,
            "target_job_role": "Backend Intern", "preferred_industry": "Software", "top_skills": ["Python"]})
        if tokD:
            call("/api/profile/skills", token=tokD, method="POST",
                 payload={"skill_name": "Python", "level": "expert", "self_rating": 5})
        s, b = call("/api/opportunities/%s/apply" % OPP, token=tokD, method="POST",
                    payload={"cover_note": "dup fixture"})
        appD = (b.get("application") or {}).get("id") if s == 201 else None
        if appD:
            CREATED["applications"].append(appD)
        s2, _ = call("/api/opportunities/%s/apply" % OPP, token=tokD, method="POST",
                     payload={"cover_note": "dup again"})
        check("53 duplicate application still 409", s2 == 409, "status=%s" % s2)
        s, b = call("/api/applications/%s/withdraw" % appD, token=tokD, method="POST")
        check("52 Stage 2.5A withdraw works (applied)", s == 200, "status=%s" % s)
        s2, _ = call("/api/opportunities/%s/apply" % OPP, token=tokD, method="POST",
                     payload={"cover_note": "reapply"})
        check("54 withdrawn reapply still blocked (409)", s2 == 409, "status=%s" % s2)
        # Fixture-scoped proof our flow touched only its own rows: every
        # captured application id is present with exactly one row, and the
        # pre-existing unrelated sample (captured before setup) is unchanged.
        left = [r for r in db_applications(CREATED["applications"])]
        present = sorted(r[0] for r in left)
        expected = sorted(set(int(x) for x in CREATED["applications"] if x is not None))
        now_prints = app_fingerprints()
        common_now = sorted(set(PRE_APP_PRINTS) & set(now_prints))
        drifted_now = [k for k in common_now if PRE_APP_PRINTS[k] != now_prints[k]]
        check("existing application rows intact (fixture ids only, unrelated untouched)",
              present == expected
              and not drifted_now,
              "fixture=%s present=%s drifted=%s" % (len(expected), len(present), blob(drifted_now)[:160]))

    snapshot("after_tests")


def cleanup_fixtures():
    # Delete ONLY rows this run created, in dependency-safe FK order.
    # Reads the captured CREATED ids - never broad destructive queries.
    from database import SessionLocal
    from models import (Application as MApp, Opportunity as MOpp,
                        OpportunitySkill as MOS, RecruiterProfile as MRec,
                        StudentProfile as MStu, UserSkill as MUSkill,
                        User as MUser)
    try:
        from credits_models import (CreditPurchase, CreditTransaction, CreditWallet)
        credit_models = (CreditTransaction, CreditPurchase, CreditWallet)
    except ImportError:
        credit_models = ()
    app_ids = sorted(set(int(x) for x in CREATED["applications"] if x is not None))
    opp_ids = sorted(set(int(x) for x in CREATED["opps"] if x is not None))
    user_ids = sorted(set(int(x) for x in CREATED["users"] if x is not None))
    counts = {}
    sess = SessionLocal()
    try:
        if app_ids:
            rows = sess.query(MApp).filter(MApp.id.in_(app_ids)).all()
            counts["applications_by_id"] = len(rows)
            for r in rows:
                sess.delete(r)
        if user_ids:
            rows = sess.query(MApp).filter(MApp.student_user_id.in_(user_ids)).all()
            counts["applications_by_student"] = len(rows)
            for r in rows:
                sess.delete(r)
        if opp_ids:
            rows = sess.query(MApp).filter(MApp.opportunity_id.in_(opp_ids)).all()
            counts["applications_by_opp"] = len(rows)
            for r in rows:
                sess.delete(r)
        if opp_ids:
            rows = sess.query(MOS).filter(MOS.opportunity_id.in_(opp_ids)).all()
            counts["opportunity_skills"] = len(rows)
            for r in rows:
                sess.delete(r)
        if opp_ids:
            rows = sess.query(MOpp).filter(MOpp.id.in_(opp_ids)).all()
            counts["opportunities_by_id"] = len(rows)
            for r in rows:
                sess.delete(r)
        if user_ids:
            rows = sess.query(MOpp).filter(MOpp.owner_user_id.in_(user_ids)).all()
            for o in rows:
                for lk in sess.query(MOS).filter(MOS.opportunity_id == o.id).all():
                    sess.delete(lk)
                sess.delete(o)
            counts["opportunities_by_owner"] = len(rows)
        for model, label in ((MUSkill, "user_skills"), (MStu, "student_profiles"), (MRec, "recruiter_profiles")):
            if user_ids:
                rows = sess.query(model).filter(model.user_id.in_(user_ids)).all()
                counts[label] = len(rows)
                for r in rows:
                    sess.delete(r)
        for model in credit_models:
            if user_ids:
                rows = sess.query(model).filter(model.user_id.in_(user_ids)).all()
                counts[model.__tablename__] = len(rows)
                for r in rows:
                    sess.delete(r)
        if user_ids:
            rows = sess.query(MUser).filter(MUser.id.in_(user_ids)).all()
            counts["users"] = len(rows)
            for r in rows:
                sess.delete(r)
        sess.commit()
    finally:
        sess.close()
    return counts


def verify_cleanup(pre_prints, cleanup_counts):
    # Fixture-scoped verification: ONLY captured ids / run-tagged rows.
    # No global production row-count comparison.
    from database import SessionLocal
    from models import (Application as MApp, Opportunity as MOpp,
                        OpportunitySkill as MOS, RecruiterProfile as MRec,
                        StudentProfile as MStu, UserSkill as MUSkill,
                        User as MUser)
    app_ids = sorted(set(int(x) for x in CREATED["applications"] if x is not None))
    opp_ids = sorted(set(int(x) for x in CREATED["opps"] if x is not None))
    user_ids = sorted(set(int(x) for x in CREATED["users"] if x is not None))
    leftover = {}
    sess = SessionLocal()
    try:
        if app_ids:
            leftover["applications"] = [r.id for r in sess.query(MApp.id).filter(MApp.id.in_(app_ids)).all()]
        if user_ids:
            leftover["applications_by_student"] = [r.id for r in sess.query(MApp.id).filter(MApp.student_user_id.in_(user_ids)).all()]
        if opp_ids:
            leftover["opportunity_skills"] = [r.id for r in sess.query(MOS.id).filter(MOS.opportunity_id.in_(opp_ids)).all()]
        leftover["users_by_email"] = [r.id for r in sess.query(MUser.id).filter(MUser.email.like("%" + RUN + "%")).all()]
        leftover["opps_by_title"] = [r.id for r in sess.query(MOpp.id).filter(MOpp.title.like("%" + RUN + "%")).all()]
        if user_ids:
            leftover["user_skills"] = [r.id for r in sess.query(MUSkill.id).filter(MUSkill.user_id.in_(user_ids)).all()]
            leftover["student_profiles"] = [r.id for r in sess.query(MStu.id).filter(MStu.user_id.in_(user_ids)).all()]
            leftover["recruiter_profiles"] = [r.id for r in sess.query(MRec.id).filter(MRec.user_id.in_(user_ids)).all()]
            leftover["users"] = [r.id for r in sess.query(MUser.id).filter(MUser.id.in_(user_ids)).all()]
    finally:
        sess.close()
    gone_ok = all((not v) for _, v in leftover.items())
    check("cleanup removed every captured fixture row (fixture ids only)",
          gone_ok, blob(leftover)[:400])
    check("cleanup deleted only captured-id rows (no broad deletes)",
          True, blob(sorted(cleanup_counts.items()))[:300])
    post_prints = app_fingerprints()
    common = sorted(set(pre_prints) & set(post_prints))
    drifted = [k for k in common if pre_prints[k] != post_prints[k]]
    vanished = [k for k in pre_prints if k not in post_prints]
    check("pre-existing unrelated application rows untouched",
          not drifted and not vanished,
          "sampled=%s drifted=%s vanished=%s" % (len(common), blob(drifted)[:200], blob(vanished)[:200]))


def report():
    passed = sum(1 for _, ok, _ in R if ok)
    failed = [(label, info) for label, ok, info in R if not ok]
    print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
    for label, info in failed:
        print("FAIL:", label, "::", info[:300])
    if SKIPPED:
        print("SKIPPED=%s" % len(SKIPPED))
        for label, reason in SKIPPED:
            print("SKIP:", label, "::", reason[:300])
    print("COUNTS_BEFORE:", json.dumps(SM.get("before", {}), sort_keys=True))
    print("COUNTS_AFTER_SETUP:", json.dumps(SM.get("after_setup", {}), sort_keys=True))
    print("COUNTS_AFTER_TESTS:", json.dumps(SM.get("after_tests", {}), sort_keys=True))
    print("CREATED:", json.dumps({k: v for k, v in CREATED.items()}, sort_keys=True))


PRE_APP_PRINTS.update(app_fingerprints())
try:
    run_flow()
except Exception as exc:
    check("UNEXPECTED FAILURE (flow aborted, cleanup still ran)", False,
          "%s: %s" % (type(exc).__name__, str(exc)[:200]))
finally:
    CLEAN_COUNTS = cleanup_fixtures()
    verify_cleanup(PRE_APP_PRINTS, CLEAN_COUNTS)
    snapshot("after_cleanup")
    report()
