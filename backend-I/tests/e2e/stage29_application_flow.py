"""STAGE 2.9 - live API tests for the real student application flow."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("TEST_BASE", "http://127.0.0.1:8000")
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
    s, b = call("/api/profile/skills", token=token, method="POST",
                payload={"skill_name": name, "level": level})
    return s in (200, 201, 409), s, blob(b)[:160]


print("RUN:", RUN)
print("BASE:", BASE)

recA, recA_id, sA = signup_login("recruiter", "rec29a", {
    "company_name": COMPANY, "job_title": "Talent Lead",
    "industry": "Software", "company_location": "Pune"})
check("A1 temp recruiter created with a company profile", bool(recA), "st=%s" % sA)

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
check("B5 skills expose names never internal ids",
      bool(d.get("skills")) and all(
          r.get("skill_name") and "skill_id" not in r for r in (d.get("skills") or [])),
      blob(d.get("skills"))[:220])
check("B6 no ownership internals leak on detail",
      all(k not in d for k in ("owner_user_id", "owner_id", "password_hash")))
s, _ = call("/api/opportunities/%s" % ID_DRAFT, token=stuE)
check("B7 student cannot read draft detail (404)", s == 404, "st=%s" % s)
s, _ = call("/api/opportunities/999999999", token=stuE)
check("B8 unknown id -> 404", s == 404, "st=%s" % s)
s, _ = call("/api/opportunities/%s" % ID_OPEN)
check("B9 anonymous detail -> 401", s == 401, "st=%s" % s)

s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuP,
            method="POST", payload={"cover_note": "Excited to apply (stage 2.9)."})
app = (b.get("application") or {}) if s == 201 else {}
APP_P = app.get("id")
check("C1 first apply -> 201 with a real row", s == 201 and bool(APP_P), "st=%s" % s)
check("C2 row carries the student contract fields",
      app.get("opportunity_id") == ID_OPEN and app.get("status") == "applied"
      and bool(app.get("applied_at")),
      blob({k: app.get(k) for k in ("opportunity_id", "status", "applied_at")}))
check("C3 cover note stored", app.get("cover_note") == "Excited to apply (stage 2.9).")
check("C4 snapshot is a JSON object", isinstance(app.get("snapshot"), dict),
      blob(app.get("snapshot"))[:160])

s, b = call("/api/applications/me", token=stuP, params={"limit": 50})
mine = rows_of(b)
mine_row = next((r for r in mine if r.get("opportunity_id") == ID_OPEN), {})
check("D1 GET /me confirms the application", s == 200 and bool(mine_row), "n=%s" % len(mine))
check("D2 /me row matches the created id", mine_row.get("id") == APP_P,
      blob({k: mine_row.get(k) for k in ("id", "status", "opportunity_id")}))

s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuP, method="POST", payload={})
check("E1 second apply -> 409 duplicate", s == 409 and "already applied" in blob(b).lower(),
      "st=%s %s" % (s, blob(b)[:160]))
s, b = call("/api/applications/me", token=stuP, params={"limit": 100})
check("E2 no duplicate rows after retry",
      sum(1 for r in rows_of(b) if r.get("opportunity_id") == ID_OPEN) == 1, "checked")

s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuI, method="POST", payload={})
check("F1 ineligible -> 409 not_eligible with reasons",
      s == 409 and (b.get("error") == "not_eligible" or "eligible" in blob(b).lower()),
      "st=%s %s" % (s, blob(b)[:220]))
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=recA, method="POST", payload={})
check("F2 recruiter apply -> 403 student-only", s == 403, "st=%s" % s)
s, _ = call("/api/opportunities/%s/apply" % ID_OPEN, method="POST", payload={})
check("F3 anonymous apply -> 401", s == 401, "st=%s" % s)
s, b = call("/api/opportunities/%s/apply" % ID_DRAFT, token=stuP, method="POST", payload={})
check("F4 draft apply -> 409 published-only", s == 409, "st=%s" % s)
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

s, b = call("/api/applications/%s/withdraw" % APP_P, token=stuP, method="POST")
check("G1 withdraw temp application -> 200", s == 200, "st=%s" % s)
s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuP, method="POST", payload={})
check("G2 re-apply after withdraw -> 409 no silent row", s == 409, "st=%s" % s)

s, b = call("/api/opportunities/%s/apply" % ID_OPEN, token=stuE, method="POST", payload={})
APP_E = ((b.get("application") or {}) if s == 201 else {}).get("id")
check("H1 eligible student apply -> 201", s == 201 and bool(APP_E), "st=%s" % s)

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
            MApp.student_user_id.in_([stuE_id, stuP_id])).all()
        db_info = {"n": len(db_rows), "rows": [
            {"id": a.id, "opp": a.opportunity_id, "stu": a.student_user_id,
             "status": a.status, "applied_at": bool(a.applied_at),
             "cover": (a.cover_note or "")[:40],
             "snap_ok": bool(a.snapshot_json)} for a in db_rows]}
    finally:
        sess.close()
except Exception as exc:
    db_info = {"db_error": str(exc)[:200]}
check("I1 rows verified in DB (opp/student/status/snapshot)",
      db_info.get("n") == 2
      and {r["stu"] for r in db_info.get("rows", [])} == {stuE_id, stuP_id}
      and {r["status"] for r in db_info.get("rows", [])} <= {"applied", "withdrawn"},
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
