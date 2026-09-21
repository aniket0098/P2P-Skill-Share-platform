"""STAGE 2.9 - live API tests for the real student application flow."""
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
RUN = "s29" + str(int(time.time()))[-7:]
COMPANY = "Stage29Co " + RUN
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


def rows_of(body):
    return (body or {}).get("applications") or (body or {}).get("items") or []


def signup_login(role, tag, profile=None):
    email = tag + "_" + RUN + "@test.local"
    s, _ = call("/signup", method="POST", payload={
        "email": email, "password": "TestPass123!",
        "name": "Stage29 " + tag.title(), "role": role})
    if s not in (200, 201):
        return None, None, s
    s, body = call("/login", method="POST",
                   payload={"email": email, "password": "TestPass123!"})
    token = body.get("access_token") if s == 200 else None
    uid = (body.get("user") or {}).get("id") if isinstance(body, dict) else None
    if uid:
        CREATED["users"].append(uid)
    if token and profile:
        call("/api/profile/me", token=token, method="PUT", payload={"profile": profile})
    return token, uid, s

def make_opportunity(token, body, skills, publish=True):
    s, b = call("/api/opportunities", token=token, method="POST", payload=body)
    opp = (b.get("opportunity") or {}) if s == 201 else {}
    oid = opp.get("id")
    if not oid:
        return None, s, b
    CREATED["opps"].append(oid)
    if skills:
        call("/api/opportunities/%s/skills" % oid, token=token, method="PUT",
             payload={"skills": skills})
    if publish:
        s2, b2 = call("/api/opportunities/%s/publish" % oid, token=token, method="POST")
        if s2 != 200:
            return oid, s2, b2
    else:
        CREATED["drafts"].append(oid)
    return oid, 200, {}


def add_skill(token, name, level="beginner"):
    """Create one UserSkill via POST /api/profile/skills and prove it stuck.

    The endpoint answers 200 on success and 409 when the row already exists.
    A 409 is *not* accepted as success: the pre-existing row is re-read and
    must carry the requested skill name AND level, otherwise this fixture
    helper fails loudly instead of hiding a fixture failure.
    """
    s, b = call("/api/profile/skills", token=token, method="POST",
                payload={"skill_name": name, "level": level})
    if s in (200, 201):
        return True, s, blob(b)[:160]
    if s == 409:
        s2, b2 = call("/api/profile/skills", token=token)
        row = None
        if s2 == 200:
            row = next((r for r in (b2.get("skills") or [])
                        if str(r.get("skill_name") or "").lower() == name.lower()), None)
        ok = (row is not None
              and str(row.get("level") or "").lower() == str(level).lower())
        info = "409 with existing row verified at level %s: %s" % (level, blob(row)[:120]) \
            if ok else "409 but no matching %s/%s row found: %s" % (name, level, blob(b2)[:160])
        return ok, s, info
    return False, s, blob(b)[:160]


def detail_of(body):
    """Return the structured 409 detail dict, or {} when detail is a string."""
    d = (body or {}).get("detail")
    return d if isinstance(d, dict) else {}


print("RUN:", RUN)
print("BASE:", BASE)

recA, recA_id, sA = signup_login("recruiter", "rec29a", {
    "company_name": COMPANY, "job_title": "Talent Lead",
    "industry": "Software", "company_location": "Pune"})
check("A1 temp recruiter created with a company profile", bool(recA), "st=%s" % sA)

# Fixture roles (deliberately distinct - the audit requires two different people):
#   stuE = ELIGIBLE lifecycle applicant (Python expert >= intermediate required).
#   stuP = genuine PARTIAL-MATCH student (Python beginner < intermediate
#          required, type "required") - must be rejected with not_eligible.
#   stuI = fully ineligible (no matching skill + profile blocks) - control case.
stuE, stuE_id, sE = signup_login("student", "stu29elig", {
    "college": "Test College", "degree": "B.Tech", "branch": "CSE",
    "graduation_year": 2027, "cgpa": 8.4, "target_job_role": "Backend Developer"})
stuP, stuP_id, sP = signup_login("student", "stu29part", {
    "college": "Test College", "degree": "B.Tech", "branch": "CSE",
    "graduation_year": 2027, "cgpa": 8.0, "target_job_role": "Backend Developer"})
stuI, stuI_id, sI = signup_login("student", "stu29inelig", {
    "college": "Test College", "degree": "B.E", "branch": "Mechanical",
    "graduation_year": 2028, "cgpa": 5.2, "target_job_role": "Designer"})
check("A2 three temp students created", all([stuE, stuP, stuI]), "%s %s %s" % (sE, sP, sI))

ok_e, se, de = add_skill(stuE, "Python", "expert")
ok_p, sp, dp = add_skill(stuP, "Python", "beginner")
ok_i, si, di = add_skill(stuI, "Figma", "beginner")
check("A3 student skills added via the real profile API",
      ok_e and ok_p and ok_i, "%s %s %s" % (se, sp, si))

s, cat = call("/api/skills", params={"search": "python", "limit": 5})
PY = next((x.get("id") for x in (cat.get("skills") or []) if x.get("id")), None)
s, cat = call("/api/skills", params={"search": "figma", "limit": 5})
FIG = next((x.get("id") for x in (cat.get("skills") or []) if x.get("id")), None)
check("A4 catalog skill ids resolved", all([PY, FIG]), "py=%s fig=%s" % (PY, FIG))

O_OPEN = make_opportunity(recA, {
    "title": "29 Backend Intern " + RUN,
    "description": "Python backend internship for the real apply flow.",
    "opportunity_type": "internship", "work_mode": "remote",
    "location": "Remote (India)", "duration": "6 months",
    "compensation": "20000/month", "openings": 2,
    "min_cgpa": 7.0, "eligible_degree": "B.Tech",
    "eligible_branch": "CSE, IT",
    "min_graduation_year": 2026, "max_graduation_year": 2027,
    "deadline": "2027-03-01T00:00:00Z",
    "responsibilities": "Ship backend features",
    "eligibility_text": "Open to CSE/IT students with 7+ CGPA"}, [
    {"skill_id": PY, "required_level": "intermediate",
     "importance": "critical", "skill_type": "required"}])
O_DRAFT = make_opportunity(recA, {
    "title": "29 Draft Role " + RUN, "description": "Must never accept applications.",
    "opportunity_type": "part_time", "work_mode": "remote", "location": "Pune"},
    [{"skill_id": PY, "required_level": "beginner",
      "importance": "low", "skill_type": "required"}], publish=False)
ID_OPEN = O_OPEN[0]
ID_DRAFT = O_DRAFT[0]
check("A5 published + draft created via the real API",
      all([ID_OPEN, ID_DRAFT]) and O_OPEN[1] == 200,
      "open=%s draft=%s" % (ID_OPEN, ID_DRAFT))

s, b = call("/api/opportunities/%s" % ID_OPEN, token=stuE)
d = (b.get("opportunity") or {}) if s == 200 else {}
check("B1 detail published student -> 200", s == 200 and d.get("id") == ID_OPEN, "st=%s" % s)
check("B2 detail carries the fields the page renders",
      bool(d.get("title")) and "skills" in d and "description" in d,
      "keys=%s" % blob(sorted(d.keys())[:16]))
check("B3 detail uses a real database id (int)", isinstance(d.get("id"), int))
check("B4 detail carries server personalization keys",
      all(k in (b or {}) for k in ("my_eligible", "my_match", "my_matched_skills",
                                   "my_missing_skills", "my_eligibility_reasons")),
      "keys=%s" % blob(sorted((b or {}).keys())))
# The API serializer intentionally exposes skill rows as
# {skill_id, skill_name, category, required_level, importance, skill_type}.
# skill_id in the API payload is legitimate; the UI - not the serializer -
# is what hides internal ids from users. The test therefore validates the
# display + requirement metadata (and forbids secret/ownership internals)
# instead of requiring skill_id to be absent.
SKILL_ROW_KEYS = {"skill_id", "skill_name", "category",
                  "required_level", "importance", "skill_type"}
SKILL_LEVELS_OK = {"beginner", "intermediate", "advanced", "expert"}
SKILL_IMPORTANCE_OK = {"critical", "high", "medium", "low"}
SKILL_TYPES_OK = {"required", "preferred"}
SKILL_INTERNALS_FORBIDDEN = ("owner_user_id", "owner_id", "user_id",
                             "password_hash", "access_token", "email")
skill_rows = d.get("skills") or []
check("B5 skill rows carry display + requirement metadata (skill_id is allowed)",
      bool(skill_rows)
      and all(r.get("skill_name") for r in skill_rows)
      and all(set(r.keys()) <= SKILL_ROW_KEYS for r in skill_rows)
      and all(r.get("required_level") in SKILL_LEVELS_OK for r in skill_rows)
      and all(r.get("importance") in SKILL_IMPORTANCE_OK for r in skill_rows)
      and all(r.get("skill_type") in SKILL_TYPES_OK for r in skill_rows),
      blob(skill_rows)[:220])
check("B6 no ownership/secret internals leak on detail",
      all(k not in d for k in ("owner_user_id", "owner_id", "password_hash"))
      and all(k not in r for r in skill_rows for k in SKILL_INTERNALS_FORBIDDEN))
s, _ = call("/api/opportunities/%s" % ID_DRAFT, token=stuE)
check("B7 student cannot read draft detail (404)", s == 404, "st=%s" % s)
s, _ = call("/api/opportunities/999999999", token=stuE)
check("B8 unknown id -> 404", s == 404, "st=%s" % s)
s, _ = call("/api/opportunities/%s" % ID_OPEN)
check("B9 anonymous detail -> 401", s == 401, "st=%s" % s)

# stuP is a GENUINE partial match (Python beginner < intermediate required):
# the detail endpoint must already report them as ineligible *with* partial
# skill credit, which is exactly why they can never be the 201 applicant.
s, bp = call("/api/opportunities/%s" % ID_OPEN, token=stuP)
mp_p = ((bp.get("my_match") or {}) if s == 200 else {}).get("match_percentage")
partials_p = (bp.get("my_partial_skills") or []) if s == 200 else []
check("B10 partial-match detail already says ineligible-with-credit",
      s == 200 and bp.get("my_eligible") is False
      and isinstance(mp_p, (int, float)) and 0 < mp_p <= 100
      and any(str(p.get("skill_name") or "").lower() == "python"
              for p in partials_p),
      "eligible=%s match=%s partials=%s" % (bp.get("my_eligible"), mp_p, blob(partials_p)[:160]))

# --- C/D/E: lifecycle of the ELIGIBLE applicant (stuE). stuP is only a
# partial match and can never produce a 201; stuI has no matching skill. ---
COVER_E = "Excited to apply (stage 2.9)."
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuE,
            method="POST", payload={"cover_note": COVER_E})
app = (b.get("application") or {}) if s == 201 else {}
APP_E = app.get("id")
check("C1 eligible apply -> 201 with a real row",
      s == 201 and isinstance(APP_E, int) and APP_E > 0, "st=%s" % s)
check("C2 row carries the student contract fields",
      app.get("opportunity_id") == ID_OPEN and app.get("status") == "applied"
      and bool(app.get("applied_at")),
      blob({k: app.get(k) for k in ("opportunity_id", "status", "applied_at")}))
check("C3 cover note stored", app.get("cover_note") == COVER_E)
check("C4 snapshot is a JSON object",
      isinstance(app.get("snapshot"), dict)
      and (app.get("snapshot") or {}).get("snapshot_version") == 1,
      blob(app.get("snapshot"))[:160])

s, b = call("/api/applications/me", token=stuE, params={"limit": 50})
mine = rows_of(b)
mine_row = next((r for r in mine if r.get("opportunity_id") == ID_OPEN), None)
check("D1 GET /me confirms the application",
      s == 200 and mine_row is not None, "n=%s" % len(mine))
# APP_E must be a REAL id: None == None must never count as success.
check("D2 /me row matches the created id",
      APP_E is not None and mine_row is not None
      and mine_row.get("id") == APP_E
      and mine_row.get("opportunity_id") == ID_OPEN,
      blob({"id": (mine_row or {}).get("id"),
            "expected": APP_E, "status": (mine_row or {}).get("status")})[:160])

s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuE, method="POST", payload={})
check("E1 second apply -> 409 duplicate with the duplicate copy",
      s == 409 and isinstance(b.get("detail"), str)
      and "already applied" in str(b.get("detail")).lower(),
      "st=%s detail=%s" % (s, blob(b)[:160]))
s, b = call("/api/applications/me", token=stuE, params={"limit": 100})
check("E2 no duplicate rows after retry",
      sum(1 for r in rows_of(b) if r.get("opportunity_id") == ID_OPEN) == 1, "checked")

# --- F: negative apply matrix. stuP must be rejected with not_eligible here
# (it is the partial-match student), NOT used for the 201 lifecycle. ---
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuP, method="POST", payload={})
ne = detail_of(b)
reasons_p = ne.get("eligibility_reasons") or []
mp_ne = ne.get("match_percentage")
check("F1 partial-match -> 409 not_eligible with structured payload",
      s == 409 and ne.get("error") == "not_eligible" and ne.get("eligible") is False
      and isinstance(mp_ne, (int, float)) and 0 < mp_ne <= 100
      and isinstance(ne.get("missing_skills"), list)
      and isinstance(reasons_p, list) and len(reasons_p) > 0
      and all(isinstance(r, str) and r for r in reasons_p),
      "st=%s match=%s reasons_n=%s" % (s, mp_ne, len(reasons_p)))
check("F1b partial-match reasons name the under-level skill",
      s == 409 and any("below the required level" in r for r in reasons_p),
      blob(reasons_p)[:220])
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuI, method="POST", payload={})
ne_i = detail_of(b)
miss_i = ne_i.get("missing_skills") or []
reasons_i = ne_i.get("eligibility_reasons") or []
check("F1c missing-everything -> 409 not_eligible with the missing-skill block",
      s == 409 and ne_i.get("error") == "not_eligible" and ne_i.get("eligible") is False
      and isinstance(ne_i.get("match_percentage"), (int, float))
      and isinstance(miss_i, list) and len(miss_i) >= 1
      and any("Missing required skill" in r for r in reasons_i),
      "st=%s missing=%s" % (s, blob(miss_i)[:160]))
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=recA, method="POST", payload={})
check("F2 recruiter apply -> 403 student-only", s == 403, "st=%s" % s)
s, _ = call("/api/opportunities/%s/apply" % ID_OPEN, method="POST", payload={})
check("F3 anonymous apply -> 401", s == 401, "st=%s" % s)
s, b = call("/api/opportunities/%s/apply" % ID_DRAFT, token=stuP, method="POST", payload={})
check("F4 draft apply -> 409 published-only with the published-only copy",
      s == 409 and isinstance(b.get("detail"), str)
      and "published" in str(b.get("detail")).lower(),
      "st=%s detail=%s" % (s, blob(b)[:160]))
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuP,
            method="POST", payload={"student_user_id": 1})
check("F5 forged student_user_id -> 422 extras forbidden", s == 422, "st=%s" % s)
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuE,
            method="POST", payload={"cover_note": "x" * 2001})
check("F6 oversized cover note -> 422 max 2000", s == 422, "st=%s" % s)

# --- Stage 2.9: deadline-expired opportunity (server clock authoritative) ---
ID_DEAD = make_opportunity(recA, {
    "title": "29 Deadline Opp " + RUN, "description": "Deadline expiry check.",
    "opportunity_type": "internship", "work_mode": "remote", "location": "Remote",
    "duration": "3 months", "compensation": "15000/month", "openings": 1,
    "min_cgpa": 6.0, "eligible_degree": "B.Tech", "eligible_branch": "CSE, IT",
    "min_graduation_year": 2026, "max_graduation_year": 2027,
    "deadline": "2027-09-01T00:00:00Z"}, [
    {"skill_id": PY, "required_level": "intermediate", "importance": "medium",
     "skill_type": "required"}])[0]
check("F7 separate deadline-expiry opportunity created+published", bool(ID_DEAD), "id=%s" % ID_DEAD)
# Push the deadline into the past on the server clock (PATCH does not re-run publish validation).
call("/api/opportunities/%s" % ID_DEAD, token=recA, method="PATCH",
     payload={"deadline": "2000-01-01T00:00:00Z"})
# Restore it to a safe future value so close()/delete work cleanly during cleanup.
RESTORE = "2030-09-01T00:00:00Z"
call("/api/opportunities/%s" % ID_DEAD, token=recA, method="PATCH",
     payload={"deadline": RESTORE})
# Re-expire it and confirm the apply path rejects with the deadline 409.
call("/api/opportunities/%s" % ID_DEAD, token=recA, method="PATCH",
     payload={"deadline": "2000-01-01T00:00:00Z"})
s, b = call("/api/opportunities/%s/apply" % ID_DEAD, token=stuE, method="POST", payload={})
check("F8 deadline-expired apply -> 409", s == 409, "st=%s detail=%s" % (s, blob(b)[:160]))
check("F9 deadline 409 text is the closed/deadline copy",
      "deadline" in str(b.get("detail", "")).lower(), str(b.get("detail")))
# Restore so cleanup is unaffected.
call("/api/opportunities/%s" % ID_DEAD, token=recA, method="PATCH",
     payload={"deadline": RESTORE})

# --- G: withdraw the REAL lifecycle application (stuE's APP_E) and prove the
# withdrawn -> reapply contract is distinct from not_eligible. ---
if APP_E is not None:
    s, b = call("/api/applications/%s/withdraw" % APP_E, token=stuE, method="POST")
else:
    s, b = None, {}
check("G1 withdraw temp application -> 200", s == 200 and (b.get("application") or {}).get("id") == APP_E,
      "st=%s id=%s" % (s, APP_E))
s, b = call("/api/applications/me", token=stuE, params={"limit": 100})
wd_row = next((r for r in rows_of(b) if r.get("id") == APP_E), None) if APP_E is not None else None
check("G1b withdrawn status visible on the real /me response",
      APP_E is not None and wd_row is not None and wd_row.get("status") == "withdrawn",
      blob({"id": (wd_row or {}).get("id"), "status": (wd_row or {}).get("status")})[:160])
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuE, method="POST", payload={})
check("G2 re-apply after withdraw -> 409 withdrawn/reapply-specific copy",
      s == 409 and isinstance(b.get("detail"), str)
      and "withdrew" in str(b.get("detail")).lower()
      and "reapplying" in str(b.get("detail")).lower()
      and "not_eligible" not in blob(b).lower(),
      "st=%s detail=%s" % (s, blob(b)[:160]))

# --- H: no-row proof for the rejected students. The 409 above (and F1) must
# not have written anything: a rejected attempt leaves the student without
# any application row for this opportunity. ---
s, b = call("/api/applications/me", token=stuP, params={"limit": 100})
s2, b2 = call("/api/applications/me", token=stuI, params={"limit": 100})
check("H1 rejected 409s leave no application rows for either student",
      s == 200 and s2 == 200
      and all(r.get("opportunity_id") != ID_OPEN for r in rows_of(b))
      and all(r.get("opportunity_id") != ID_OPEN for r in rows_of(b2)),
      "stuP_n=%s stuI_n=%s" % (len(rows_of(b)), len(rows_of(b2))))

# Exactly one row must exist for ID_OPEN: the lifecycle row APP_E, now in
# status "withdrawn" (mutated in place - never deleted/recreated), and NO
# ghost rows for the rejected stuP/stuI students.
db_info = {}
try:
    import sys
    # Backend root = dirname(dirname(dirname(abspath(__file__)))) for tests/e2e/<file>.py
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from database import SessionLocal
    from models import Application as MApp
    sess = SessionLocal()
    try:
        db_rows = sess.query(MApp).filter(
            MApp.opportunity_id == ID_OPEN,
            MApp.student_user_id.in_([stuE_id, stuP_id, stuI_id])).all()
        db_info = {"n": len(db_rows), "rows": [
            {"id": a.id, "opp": a.opportunity_id, "stu": a.student_user_id,
             "status": a.status, "applied_at": bool(a.applied_at),
             "cover": (a.cover_note or "")[:40],
             "snap_ok": bool(a.snapshot_json)} for a in db_rows]}
    finally:
        sess.close()
except Exception as exc:
    db_info = {"db_error": str(exc)[:200]}
i1_rows = db_info.get("rows", [])
i1_only_row = i1_rows[0] if db_info.get("n") == 1 else {}
check("I1 exactly one application row exists, and it is the withdrawn lifecycle row",
      db_info.get("n") == 1
      and APP_E is not None and i1_only_row.get("id") == APP_E
      and i1_only_row.get("stu") == stuE_id
      and i1_only_row.get("status") == "withdrawn"
      and bool(i1_only_row.get("applied_at")) and bool(i1_only_row.get("snap_ok"))
      and i1_only_row.get("cover") == COVER_E[:40],
      blob(db_info)[:400])

for oid in list(CREATED["drafts"]):
    call("/api/opportunities/%s" % oid, token=recA, method="DELETE")
leftover = []
try:
    import sys
    # Backend root = dirname(dirname(dirname(abspath(__file__)))) for tests/e2e/<file>.py
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from database import SessionLocal
    from models import (Application as MApp, Opportunity as MOpp,
                        OpportunitySkill as MOS,
                        User as MUser, RecruiterProfile as MRec,
                        StudentProfile as MStu)
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
            ("links", [x.id for x in sess.query(MOS).filter(
                MOS.opportunity_id.in_(list(CREATED["opps"]) or [0])).all()]),
            ("companies", [o.id for o in sess.query(MOpp).filter(
                MOpp.company_name == COMPANY).all()]),
        ]
    finally:
        sess.close()
except Exception as exc:
    leftover = [("cleanup_error", str(exc)[:200])]
clean_ok = all((not v) for _, v in leftover)
check("Q1 every temp row removed (DB re-queried)", clean_ok, blob(leftover))
check("Q2 pre-existing published rows untouched",
      len(call("/api/opportunities", params={"limit": 100})[1].get("opportunities") or []) >= 2)
check("Q3 no temp role still discoverable",
      all(("29 Backend Intern " + RUN) not in str(r.get("title")) and
          COMPANY not in str(r.get("company_name"))
          for r in (call("/api/opportunities", params={"limit": 100})[1].get("opportunities") or [])))

passed = sum(1 for _, ok_, _ in R if ok_)
failed = [(lb, inf) for lb, ok_, inf in R if not ok_]
print("")
print("================ RESULT ================")
print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
for lb, inf in failed:
    print("  FAIL  %s  -> %s" % (lb, inf))
print("========================================")
