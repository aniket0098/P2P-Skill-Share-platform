"""STAGE 9.3 - recruiter applicant review workflow (end-to-end).

Covers the recruiter-side applicant experience the Stage 9.3 UI depends on,
using ONLY the existing Stage 2.5B endpoints (no backend changes):

  GET   /api/opportunities/{id}/applications   (owner recruiter only)
  PATCH /api/applications/{id}/status          (owner recruiter only)
  GET   /api/applications/me                   (student view)

Coverage (A-O): auth, ownership, student apply, applicant list, serializer
safety, forward transitions, rejection (+ required reason), invalid/duplicate
transitions, non-owner recruiter 403s, student 403, anonymous 401, unknown
application 404, duplicate submissions, recruiter note semantics, rejection
reason storage, and the student's resulting status view.

Disposable timestamped accounts/rows only; captured-id cleanup under
try/finally. Local by default; refuses remote unless TEST_ALLOW_REMOTE=1 and
TEST_CONFIRM=yes-i-know (same banner convention as stages 25B-30).
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
    print("This suite creates and deletes real fixtures on the target.")
    print("To run against a remote target on purpose, set BOTH:")
    print("    TEST_ALLOW_REMOTE=1")
    print("    TEST_CONFIRM=yes-i-know")
    raise SystemExit(2)

RUN = "s31" + str(int(time.time()))[-7:]
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
               "name": "Stage31 " + tag.title(), "role": role}
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


def mk_draft(token, title):
    payload = {"title": title + " " + RUN,
               "description": "Stage 9.3 applicant review regression draft. " + RUN,
               "opportunity_type": "internship", "work_mode": "remote",
               "location": "Remote", "duration": "3 months",
               "openings": 3,
               "min_graduation_year": 2025, "max_graduation_year": 2028,
               "eligible_degree": "B.Tech", "eligible_branch": "CSE"}
    s, b = call("/api/opportunities", token=token, method="POST", payload=payload)
    oid = (b.get("opportunity") or {}).get("id") if s == 201 else None
    if oid:
        CREATED["opps"].append(oid)
    return s, b, oid


def attach_first_skill(token, oid):
    s, sk = call("/api/skills/catalog?q=&limit=3", token=token)
    first = (sk.get("skills") or [{}])[0]
    if not first.get("id"):
        return False, None
    s, _ = call("/api/opportunities/%s/skills" % oid, token=token, method="PUT",
                payload={"skills": [{"skill_id": first["id"],
                                     "required_level": "beginner",
                                     "importance": "low",
                                     "skill_type": "required"}]})
    return s == 200, first.get("name")


def add_skill(token, name, level="expert"):
    """Student skill write via POST /api/profile/skills (stage28/29 recipe)."""
    s, b = call("/api/profile/skills", token=token, method="POST",
                payload={"skill_name": name, "level": level})
    return s in (200, 201)


def patch_status(token, app_id, status, note=None, reason=None, extra=None):
    payload = {"status": status}
    if note is not None:
        payload["recruiter_note"] = note
    if reason is not None:
        payload["rejection_reason"] = reason
    if extra:
        payload.update(extra)
    return call("/api/applications/%s/status" % app_id, token=token,
                method="PATCH", payload=payload)

print("RUN:", RUN)
recA = recB = stu1 = stu2 = stu3 = None
PUB = APP1 = APP2 = APP3 = None
E1 = E2 = E3 = ""
try:
    # ---------------- A. recruiter authentication ----------------
    recA, _, sA, E1 = signup_login("recruiter", "rec31a",
        {"company_name": "ReviewCo 31", "job_title": "Hiring",
         "industry": "Software", "company_location": "Remote"})
    recB, _, sB, E2 = signup_login("recruiter", "rec31b",
        {"company_name": "ReviewCo 31", "job_title": "Hiring",
         "industry": "Software"})
    stu1, _, s1, E3 = signup_login("student", "stu31a",
        {"college": "Test College", "degree": "B.Tech", "branch": "CSE",
         "graduation_year": 2027, "cgpa": 8.4, "top_skills": ["Python"]})
    stu2, _, s2, _ = signup_login("student", "stu31b",
        {"college": "Test College", "degree": "B.Tech", "branch": "CSE",
         "graduation_year": 2027, "cgpa": 8.1, "top_skills": ["Python"]})
    stu3, _, s3, _ = signup_login("student", "stu31c",
        {"college": "Test College", "degree": "B.Tech", "branch": "CSE",
         "graduation_year": 2027, "cgpa": 7.9, "top_skills": ["Python"]})
    check("A users created (recruiterA/recruiterB/students)",
          all([recA, recB, stu1, stu2, stu3]),
          "%s %s %s %s %s" % (sA, sB, s1, s2, s3))
    if not all([recA, recB, stu1, stu2, stu3]):
        raise SystemExit(0)

    # ---------------- B. recruiter owns opportunity ----------------
    s, _, PUB = mk_draft(recA, "31 REVIEW FIX")
    check("B opportunity created (201)", s == 201 and bool(PUB), "st=%s" % s)
    ok_skill, SKNAME = attach_first_skill(recA, PUB)
    check("B required skill attached", ok_skill, SKNAME or "no catalog skill")
    s, _ = call("/api/opportunities/%s/publish" % PUB, token=recA, method="POST")
    check("B opportunity published", s == 200, "st=%s" % s)

    # ---------------- C. students apply ----------------
    if SKNAME:
        check("C student skills added", all([add_skill(stu1, SKNAME),
                                             add_skill(stu2, SKNAME),
                                             add_skill(stu3, SKNAME)]), SKNAME)
    s, b = call("/api/opportunities/%s/apply" % PUB, token=stu1, method="POST",
                payload={"cover_note": "Stage 9.3 review one"})
    APP1 = (b.get("application") or {}).get("id") if s == 201 else None
    if APP1:
        CREATED["applications"].append(APP1)
    check("C student1 applied (201)", s == 201 and bool(APP1), "st=%s %s" % (s, blob(b)[:200]))
    s, b = call("/api/opportunities/%s/apply" % PUB, token=stu2, method="POST",
                payload={"cover_note": "Stage 9.3 review two"})
    APP2 = (b.get("application") or {}).get("id") if s == 201 else None
    if APP2:
        CREATED["applications"].append(APP2)
    check("C student2 applied (201)", s == 201 and bool(APP2), "st=%s" % s)
    s, b = call("/api/opportunities/%s/apply" % PUB, token=stu3, method="POST",
                payload={"cover_note": "Stage 9.3 review three"})
    APP3 = (b.get("application") or {}).get("id") if s == 201 else None
    if APP3:
        CREATED["applications"].append(APP3)
    check("C student3 applied (201)", s == 201 and bool(APP3), "st=%s" % s)
    # ---------------- D. recruiter sees applicants ----------------
    s, b = call("/api/opportunities/%s/applications" % PUB, token=recA)
    rows = b.get("items") or []
    ids = [(r.get("application") or {}).get("id") for r in rows]
    check("D owner lists applicants (200, all three)",
          s == 200 and all(a in ids for a in (APP1, APP2, APP3)),
          "st=%s n=%s ids=%s" % (s, len(rows), ids))
    app1row = next((r for r in rows if (r.get("application") or {}).get("id") == APP1), {})
    check("D applicant carries name/status/applied_at",
          bool(((app1row.get("student") or {}).get("name"))
               and (app1row.get("application") or {}).get("status") == "applied"
               and (app1row.get("application") or {}).get("applied_at")),
          blob(app1row)[:220])
    check("D pagination envelope present",
          all(k in b for k in ("total", "limit", "offset", "has_more")),
          blob({k: b.get(k) for k in ("total", "limit", "offset", "has_more")}))
    s, b = call("/api/opportunities/%s/applications" % PUB, token=recA,
                params={"status": "applied"})
    check("D status filter returns the 3 applied rows",
          s == 200 and len(b.get("items") or []) == 3,
          "st=%s n=%s" % (s, len(b.get("items") or [])))
    s, b = call("/api/opportunities/%s/applications" % PUB, token=recA,
                params={"status": "selected"})
    check("D selected filter empty before transitions",
          s == 200 and not (b.get("items") or []), "st=%s" % s)

    # ---------------- E. applicant serializer is safe ----------------
    s, b = call("/api/opportunities/%s/applications" % PUB, token=recA, params={"limit": 100})
    raw = blob(b).lower()
    check("E no password/token/secret in applicant payload",
          all(x not in raw for x in ("password_hash", "password", "bearer", "eyJ", "secret")), "")
    check("E no student email leaked",
          all(x.lower() not in raw for x in (E1, E2)), "")
    app1row = next((r for r in (b.get("items") or [])
                    if (r.get("application") or {}).get("id") == APP1), {})
    snap = (app1row.get("application") or {}).get("snapshot") or {}
    check("E apply-time snapshot present (v1, eligibility, server student name)",
          snap.get("snapshot_version") == 1
          and isinstance(snap.get("eligibility"), dict)
          and (snap.get("student") or {}).get("name") == "Stage31 Stu31A",
          blob(snap)[:200])
    prof = (app1row.get("student") or {}).get("profile") or {}
    check("E current profile fields exposed to owner",
          prof.get("college") == "Test College" and prof.get("cgpa") == 8.4,
          blob(prof)[:160])
    check("E email/phone never serialized",
          not any(k in (app1row.get("student") or {}) for k in ("email", "phone")),
          blob(app1row.get("student"))[:160])

    # ---------------- authorization ----------------
    s, _ = call("/api/opportunities/%s/applications" % PUB)
    check("SEC anonymous list 401", s == 401, "st=%s" % s)
    s, _ = call("/api/applications/%s/status" % (APP1 or 0), method="PATCH",
                payload={"status": "reviewing"})
    check("SEC anonymous patch 401", s == 401, "st=%s" % s)
    s, _ = call("/api/opportunities/%s/applications" % PUB, token=recB)
    check("I non-owner recruiter list 403", s == 403, "st=%s" % s)
    s, _ = call("/api/opportunities/999999999/applications", token=recA)
    check("SEC unknown opportunity list 404", s == 404, "st=%s" % s)
    s, _ = call("/api/applications/999999999/status", token=recA, method="PATCH",
                payload={"status": "reviewing"})
    check("SEC unknown application patch 404", s == 404, "st=%s" % s)
    s, _ = patch_status(stu1, APP1, "reviewing")
    check("K student cannot update application (403)", s == 403, "st=%s" % s)
    s, _ = patch_status(recB, APP1, "reviewing")
    check("J non-owner recruiter cannot update (403)", s == 403, "st=%s" % s)
    s, _ = patch_status(recA, APP1, "banana")
    check("SEC invalid status vocabulary 422", s == 422, "st=%s" % s)
    s, _ = call("/api/applications/%s/status" % APP1, token=recA, method="PATCH",
                payload={"status": "reviewing", "student_user_id": 42})
    check("SEC forged extra field rejected 422", s == 422, "st=%s" % s)
    # ---------------- F. forward transitions ----------------
    s, b = patch_status(recA, APP1, "reviewing")
    check("F applied -> reviewing (200)",
          s == 200 and (b.get("application") or {}).get("status") == "reviewing",
          "st=%s %s" % (s, blob(b)[:160]))
    s, b = patch_status(recA, APP1, "shortlisted")
    check("F reviewing -> shortlisted (200)",
          s == 200 and (b.get("application") or {}).get("status") == "shortlisted",
          "st=%s" % s)
    s, b = patch_status(recA, APP1, "interview")
    check("F shortlisted -> interview (200)",
          s == 200 and (b.get("application") or {}).get("status") == "interview",
          "st=%s" % s)
    s, b = patch_status(recA, APP1, "selected")
    app1 = b.get("application") or {}
    check("F interview -> selected (200, reviewed_by stamped)",
          s == 200 and app1.get("status") == "selected"
          and app1.get("status_changed_at") and app1.get("reviewed_by_user_id"),
          "st=%s %s" % (s, blob(app1)[:200]))

    # ---------------- H/L. invalid + duplicate transitions ----------------
    s, b = patch_status(recA, APP1, "rejected", reason="Too late")
    check("H selected -> rejected 409 (terminal)",
          s == 409, "st=%s %s" % (s, blob(b)[:140]))
    s, b = patch_status(recA, APP1, "reviewing")
    check("H selected -> reviewing 409", s == 409, "st=%s" % s)
    s, b = patch_status(recA, APP1, "withdrawn")
    check("H recruiter -> withdrawn 409 (student-only move)", s == 409, "st=%s" % s)

    # APP3: note semantics + duplicate submission + invalid jump
    s, b = patch_status(recA, APP3, "reviewing", note="Strong signals")
    check("M applied -> reviewing with note (200, note stored)",
          s == 200 and (b.get("application") or {}).get("recruiter_note") == "Strong signals",
          "st=%s %s" % (s, blob(b)[:160]))
    s, b = patch_status(recA, APP3, "reviewing")
    check("L duplicate same-status submission 409",
          s == 409, "st=%s %s" % (s, blob(b)[:140]))
    s, b = patch_status(recA, APP3, "shortlisted")
    check("M omitted note preserved across transition",
          s == 200 and (b.get("application") or {}).get("recruiter_note") == "Strong signals",
          "st=%s %s" % (s, blob(b)[:160]))
    s, b = patch_status(recA, APP3, "interview", note="Technical depth confirmed")
    check("M changed note overwrites",
          s == 200 and (b.get("application") or {}).get("recruiter_note") == "Technical depth confirmed",
          "st=%s %s" % (s, blob(b)[:160]))
    s, b = patch_status(recA, APP3, "applied")
    check("H interview -> applied 409 (no backward edge)", s == 409, "st=%s" % s)

    # ---------------- G/N. rejection path ----------------
    s, b = patch_status(recA, APP2, "rejected")
    check("N rejection without reason 422 (backend requires it)",
          s == 422, "st=%s %s" % (s, blob(b)[:160]))
    s, b = patch_status(recA, APP2, "rejected", reason="Applied too late")
    app2 = b.get("application") or {}
    check("G applied -> rejected (200, reason stored)",
          s == 200 and app2.get("status") == "rejected"
          and app2.get("rejection_reason") == "Applied too late",
          "st=%s %s" % (s, blob(app2)[:200]))
    s, b = patch_status(recA, APP2, "reviewing")
    check("H rejected -> reviewing 409 (terminal)", s == 409, "st=%s" % s)

    # ---------------- O. student sees the resulting status ----------------
    s, b = call("/api/applications/me", token=stu1, params={"status": "selected"})
    mine = b.get("applications") or []
    check("O student1 sees final status selected",
          s == 200 and any(a.get("id") == APP1 for a in mine), "st=%s n=%s" % (s, len(mine)))
    s, b = call("/api/applications/me", token=stu2, params={"status": "rejected"})
    mine = b.get("applications") or []
    row2 = next((a for a in mine if a.get("id") == APP2), {})
    check("O student2 sees rejected with reason",
          s == 200 and row2.get("status") == "rejected", "st=%s n=%s" % (s, len(mine)))
    s, b = call("/api/applications/me", token=stu3, params={"status": "interview"})
    mine = b.get("applications") or []
    check("O student3 sees interview stage",
          s == 200 and any(a.get("id") == APP3 for a in mine), "st=%s n=%s" % (s, len(mine)))
    s, b = call("/api/opportunities/%s/applications" % PUB, token=recA,
                params={"search": "Stu31A"})
    rows = b.get("items") or []
    check("D name search finds student1 only",
          s == 200 and len(rows) == 1
          and (rows[0].get("application") or {}).get("id") == APP1,
          "st=%s n=%s" % (s, len(rows)))
finally:
    # Captured-id cleanup. Published/archived opportunities cannot be
    # hard-deleted by design (draft-only DELETE protects application
    # history), so those DELETE calls are expected to 409 — same known
    # cleanup limitation as Stage 30; only drafts are actually removed.
    if recA:
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
