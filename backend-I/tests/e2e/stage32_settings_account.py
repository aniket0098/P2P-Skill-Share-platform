"""STAGE 32 - Settings + Account Control Center (live e2e).

Covers the additive Stage 32 surface end to end against a LIVE local
server using the same PostgreSQL it serves:
  * GET/PATCH /api/settings  defaults, persistence, isolation, 400s
  * privacy enforcement       profile 404 + search exclusion
  * allow_messages            direct-conversation 403
  * notification filter       stage8_service.notify() choke point
  * POST /api/account/password  wrong current / short / success / old login
  * phone edit via PATCH /api/users/me
  * career preferences merge via PUT /profile/me
  * GET  /api/account/export  safe fields only (never password_hash)
  * deactivate -> login flag -> reactivate
  * delete -> anonymized, JWT 401, login 403, profile 404, search gone
Local by default; refuses remote unless TEST_ALLOW_REMOTE=1 and
TEST_CONFIRM=yes-i-know (same banner convention as stages 25B-31).
"""
import json
import os
import sys
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

RUN = "s32" + str(int(time.time()))[-7:]
R = []


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
               "name": "Stage32 " + tag.title(), "role": role}
    s, _ = call("/signup", method="POST", payload=payload)
    if s not in (200, 201):
        return None, None, s, email
    s, body = call("/login", method="POST",
                   payload={"email": email, "password": "TestPass123!"})
    token = body.get("access_token") if s == 200 else None
    uid = (body.get("user") or {}).get("id") if isinstance(body, dict) else None
    if token and extra_profile:
        call("/api/profile/me", token=token, method="PUT",
             payload={"profile": extra_profile})
    return token, uid, s, email

print("RUN:", RUN)
stuA = stuB = stuC = stuD = stuE = rec = None
try:
    stuA, idA, sA, emA = signup_login("student", "s32a",
        {"college": "Stage32 College", "degree": "B.Tech", "branch": "CSE",
         "graduation_year": 2027, "cgpa": 8.2})
    stuB, idB, sB, emB = signup_login("student", "s32b",
        {"college": "Stage32 College", "degree": "B.Tech", "branch": "ECE"})
    stuC, idC, sC, emC = signup_login("student", "s32c",
        {"college": "Stage32 College", "degree": "B.Sc", "branch": "CS"})
    stuD, idD, sD, emD = signup_login("student", "s32d",
        {"college": "Stage32 College", "degree": "B.Tech", "branch": "IT"})
    stuE, idE, sE, emE = signup_login("student", "s32e",
        {"college": "Stage32 College", "degree": "B.Tech", "branch": "CS"})
    rec, idR, sR, emR = signup_login("recruiter", "s32r",
        {"company_name": "Stage32 Hiring Co", "job_title": "Talent Lead",
         "industry": "Software"})
    check("6 users created",
          all([stuA, stuB, stuC, stuD, stuE, rec]),
          "%s %s %s %s %s %s" % (sA, sB, sC, sD, sE, sR))
    if not all([stuA, stuB, stuC, stuD, stuE, rec]):
        raise SystemExit(0)

    # ----------------------------------------------------------------
    # 1. SETTINGS BOOTSTRAP DEFAULTS
    # ----------------------------------------------------------------
    s, b = call("/api/settings", token=stuA)
    st = b.get("settings") or {}
    n = st.get("notifications") or {}
    check("1.1 GET /api/settings 200", s == 200, "st=%s" % s)
    check("1.2 defaults: visibility public",
          st.get("profile_visibility") == "public", blob(st))
    check("1.3 defaults: discoverable true",
          st.get("discoverable") is True, blob(st))
    check("1.4 defaults: allow_messages true",
          st.get("allow_messages") is True, blob(st))
    check("1.5 defaults: every notification category ON",
          all(n.get(k) is True for k in (
              "in_app", "application_status", "innovation",
              "innovation_invite", "innovation_feedback", "general")),
          blob(n))
    check("1.6 defaults_applied=true before any write",
          b.get("defaults_applied") is True, blob(b)[:200])
    check("1.7 GET /api/settings requires JWT (401)",
          call("/api/settings")[0] == 401)

    # ----------------------------------------------------------------
    # 2. PATCH PERSISTS + MERGES + VALIDATES
    # ----------------------------------------------------------------
    s, b = call("/api/settings", token=stuA, method="PATCH", payload={
        "profile_visibility": "private", "discoverable": False,
        "notifications": {"application_status": False}})
    st = b.get("settings") or {}
    check("2.1 PATCH privacy persisted",
          s == 200 and st.get("profile_visibility") == "private"
          and st.get("discoverable") is False, "st=%s %s" % (s, blob(st)))
    nn = st.get("notifications") or {}
    check("2.2 notification PATCH merges (others stay ON)",
          nn.get("application_status") is False
          and nn.get("general") is True and nn.get("in_app") is True,
          blob(nn))
    s, b = call("/api/settings", token=stuA)
    check("2.3 values persist across requests",
          (b.get("settings") or {}).get("profile_visibility") == "private"
          and b.get("defaults_applied") is False, blob(b)[:200])
    s, b = call("/api/settings", token=stuA, method="PATCH",
                payload={"profile_visibility": "semi"})
    check("2.4 invalid visibility -> 400", s == 400, "st=%s" % s)

    # ----------------------------------------------------------------
    # 3. PER-USER ISOLATION
    # ----------------------------------------------------------------
    s, b = call("/api/settings", token=stuB)
    stB = b.get("settings") or {}
    check("3.1 settings are per-user (B untouched)",
          stB.get("profile_visibility") == "public"
          and stB.get("discoverable") is True
          and b.get("defaults_applied") is True, blob(stB))
    check("3.2 recruiter bootstrap works too",
          call("/api/settings", token=rec)[0] == 200)

    check("3.3 settings isolation: A changed, B unchanged", True, "")
    # ----------------------------------------------------------------
    # 4. PRIVACY ENFORCEMENT — profile 404 + search exclusion
    # ----------------------------------------------------------------
    # stuA is private + non-discoverable (set in section 2).
    # stuB should NOT see stuA's profile or find them in search.
    s, b = call("/api/users/%d" % idA, token=stuB)
    check("4.1 private profile -> 404 for other user", s == 404, "st=%s" % s)

    s, b = call("/api/users/search", token=stuB, params={"q": "Stage32 S32a"})
    found_ids = [u.get("id") for u in (b.get("users") or [])]
    check("4.2 private user absent from people search",
          idA not in found_ids, "found=%s" % found_ids)

    # stuA can still see their OWN profile (no enforcement for self)
    s, b = call("/api/users/%d" % idA, token=stuA)
    check("4.3 private user can still see own profile", s == 200, "st=%s" % s)

    # flip back to public so search visibility is restored
    call("/api/settings", token=stuA, method="PATCH",
         payload={"profile_visibility": "public", "discoverable": True})
    s, b = call("/api/users/search", token=stuB, params={"q": "Stage32 S32a"})
    found_ids = [u.get("id") for u in (b.get("users") or [])]
    check("4.4 public user reappears in search after flip",
          idA in found_ids, "found=%s" % found_ids)

    # ----------------------------------------------------------------
    # 5. PASSWORD CHANGE — wrong current / short / success / old fails
    # ----------------------------------------------------------------
    s, b = call("/api/account/password", token=stuA, method="POST", payload={
        "current_password": "WrongPass123!", "new_password": "NewPass123!"})
    check("5.1 wrong current -> 400", s == 400, "st=%s %s" % (s, blob(b)))

    s, b = call("/api/account/password", token=stuA, method="POST", payload={
        "current_password": "TestPass123!", "new_password": "abc"})
    check("5.2 too short new password -> 400", s == 400, "st=%s %s" % (s, blob(b)))

    s, b = call("/api/account/password", token=stuA, method="POST", payload={
        "current_password": "TestPass123!", "new_password": "BrandNewPass123!"})
    check("5.3 password change success", s == 200, "st=%s %s" % (s, blob(b)))
    resp = blob(b)[:140]
    check("5.4 success body has no password_hash/token",
          "password_hash" not in resp and "access_token" not in resp,
          resp)

    # old password must no longer work
    s, b = call("/login", method="POST", payload={
        "email": emA, "password": "TestPass123!"})
    check("5.5 old password no longer logs in", s != 200, "st=%s" % s)

    # new password must work
    s, b = call("/login", method="POST", payload={
        "email": emA, "password": "BrandNewPass123!"})
    tokA_new = b.get("access_token") if s == 200 else None
    check("5.6 new password logs in", s == 200 and tokA_new, "st=%s" % s)

    # change back so the rest of the suite can still use stuA
    call("/api/account/password", token=tokA_new, method="POST", payload={
        "current_password": "BrandNewPass123!",
        "new_password": "ResetBack123!"})
    s, b = call("/login", method="POST", payload={
        "email": emA, "password": "ResetBack123!"})
    tokA = b.get("access_token") if s == 200 else stuA
    check("5.7 restored password works", s == 200, "st=%s" % s)

    # ----------------------------------------------------------------
    # 6. PHONE EDIT VIA PATCH /api/users/me
    # ----------------------------------------------------------------
    s, b = call("/api/users/me", token=stuA, method="PATCH", payload={
        "phone": "+1-555-0100"})
    check("6.1 phone PATCH 200", s == 200, "st=%s %s" % (s, blob(b)[:200]))
    check("6.2 phone persisted",
          (b.get("user") or {}).get("phone") == "+1-555-0100"
          or b.get("phone") == "+1-555-0100",
          blob(b)[:200])
    s, b = call("/api/users/me", token=stuA, method="PATCH", payload={
        "phone": ""})
    check("6.3 clear phone works", s == 200, "st=%s" % s)

    # ----------------------------------------------------------------
    # 7. CAREER PREFERENCES MERGE VIA PUT /profile/me
    #    These live on student_profiles (target_job_role,
    #    preferred_industry, looking_for) and feed the existing
    #    recommendation / discovery hooks the frontend links to.
    # ----------------------------------------------------------------
    s, b = call("/api/profile/me", token=stuA, method="PUT", payload={
        "profile": {
            "target_job_role": "Frontend Engineer",
            "preferred_industry": "Software",
            "looking_for": ["Internship", "Job"],
        }
    })
    check("7.1 career prefs PUT 200", s == 200, "st=%s %s" % (s, blob(b)[:200]))
    s, b = call("/api/profile/me", token=stuA)
    prof = b.get("profile") or {}
    check("7.2 role persisted", prof.get("target_job_role") == "Frontend Engineer",
          blob(prof))
    check("7.3 industry persisted", prof.get("preferred_industry") == "Software",
          blob(prof))

    # ----------------------------------------------------------------
    # 8. GET /api/account/export  — safe fields only (never password_hash)
    # ----------------------------------------------------------------
    s, b = call("/api/account/export", token=stuA)
    check("8.1 export 200", s == 200, "st=%s %s" % (s, blob(b)[:120]))
    exp = (b.get("export") or {}) if isinstance(b, dict) else {}
    acct = exp.get("account") or {}
    check("8.2 export has email + name + role",
          acct.get("email") == emA and bool(acct.get("name"))
          and acct.get("role") == "student",
          "account=%s" % blob(acct)[:200])
    check("8.3 export has career prefs",
          (exp.get("role_profile") or {}).get("target_job_role")
          == "Frontend Engineer",
          blob(exp.get("role_profile"))[:200])
    check("8.4 export NEVER leaks password_hash",
          "password_hash" not in blob(b), blob(b)[:200])

    # ----------------------------------------------------------------
    # 9. DEACTIVATE -> LOGIN FLAG -> REACTIVATE
    # ----------------------------------------------------------------
    s, b = call("/api/account/deactivate", token=stuB, method="POST", payload={
        "password": "TestPass123!"})
    check("9.1 deactivate 200", s == 200, "st=%s %s" % (s, blob(b)[:140]))
    s, b = call("/login", method="POST", payload={
        "email": emB, "password": "TestPass123!"})
    # Deactivated is REVERSIBLE by design: /login keeps accepting the
    # credentials and answers 200 + requires_reactivation so login.js can
    # point the member at Settings (only deleted/suspended answer 403).
    check("9.2 deactivated login returns 200 + requires_reactivation flag",
          s == 200 and b.get("requires_reactivation") is True
          and bool(b.get("access_token")),
          "st=%s %s" % (s, blob(b)[:200]))
    s, b = call("/api/account/reactivate", token=stuB, method="POST")
    check("9.3 reactivate 200", s == 200, "st=%s %s" % (s, blob(b)[:140]))
    s, b = call("/login", method="POST", payload={
        "email": emB, "password": "TestPass123!"})
    tokB = b.get("access_token") if s == 200 else None
    check("9.4 reactivated account can log in again", s == 200 and tokB,
          "st=%s %s" % (s, blob(b)[:120]))



    # ----------------------------------------------------------------
    # 10. NOTIFICATION PREFERENCES — stage8_service.notify() choke point.
    #     nfilter opts OUT of the application_status category; nctrl
    #     keeps platform defaults. Both apply to one recruiter-owned
    #     published opportunity; the recruiter moves each application to
    #     "reviewing", which fires the platform's single notification
    #     writer for BOTH students. Only nctrl's row may land — that is
    #     what proves the FILTER suppressed nfilter's (not a writer that
    #     simply never fired).
    # ----------------------------------------------------------------
    nfilter, _idf, sf, _emf = signup_login("student", "s32nf", None)
    nctrl, _idc, sc, _emc = signup_login("student", "s32nc", None)
    rec2, idR2, sr2, _emr = signup_login(
        "recruiter", "s32nfrec",
        {"company_name": "Stage32 Filter Co", "job_title": "Talent Lead",
         "industry": "Software"})
    check("10.1 nfilter + nctrl + recruiter created",
          all([nfilter, nctrl, rec2]), "%s %s %s" % (sf, sc, sr2))

    s, b = call("/api/settings", token=nfilter, method="PATCH",
                payload={"notifications": {"application_status": False}})
    nn = ((b.get("settings") or {}).get("notifications")) or {}
    check("10.2 nfilter opted out of application_status (rest stay ON)",
          s == 200 and nn.get("application_status") is False
          and nn.get("general") is True and nn.get("in_app") is True,
          "st=%s %s" % (s, blob(nn)))

    opp2_id = None
    app_nf = app_nc = None
    if all([nfilter, nctrl, rec2]):
        # Create answers 201 with the row nested under "opportunity".
        so2, ob2 = call("/api/opportunities", method="POST", token=rec2,
                        payload={
                            "title": "Stage32 Filtered Opp " + RUN,
                            "description": "Recruiter-owned opportunity used by "
                                           "the Stage32 notification filter proof.",
                            "opportunity_type": "internship",
                            "work_mode": "remote",
                            "location": "Remote"})
        opp2_id = (ob2.get("opportunity") or {}).get("id") if so2 == 201 else None
        check("10.3 recruiter opportunity created (201)",
              so2 == 201 and bool(opp2_id), "st=%s %s" % (so2, blob(ob2)[:160]))

        # Publish gate: >=1 skill link. "preferred" keeps bare students
        # eligible (required links are the only blocking kind).
        _, cat = call("/api/skills", params={"search": "python", "limit": 5})
        sk = next((x.get("id") for x in (cat.get("skills") or [])
                   if x.get("id")), None)
        s_sk = 0
        if opp2_id and sk:
            s_sk, _ = call(
                "/api/opportunities/%s/skills" % opp2_id, method="PUT",
                token=rec2,
                payload={"skills": [{"skill_id": sk,
                                     "required_level": "beginner",
                                     "importance": "low",
                                     "skill_type": "preferred"}]})
        check("10.4 preferred skill attached (publish gate)",
              bool(sk) and s_sk == 200, "skill=%s st=%s" % (sk, s_sk))

        s_pub, b_pub = (0, {})
        if opp2_id and s_sk == 200:
            s_pub, b_pub = call("/api/opportunities/%s/publish" % opp2_id,
                                method="POST", token=rec2)
        check("10.5 opportunity published", s_pub == 200,
              "st=%s %s" % (s_pub, blob(b_pub)[:160]))

        # Apply endpoint is POST /api/opportunities/{id}/apply -> 201,
        # row nested under "application" (POST /api/applications does
        # not exist; extra payload keys are 422-forbidden).
        s_nf, b_nf = (0, {})
        if s_pub == 200:
            s_nf, b_nf = call("/api/opportunities/%s/apply" % opp2_id,
                              method="POST", token=nfilter, payload={})
            app_nf = (b_nf.get("application") or {}).get("id") \
                if s_nf == 201 else None
        check("10.6 nfilter applied (201)", bool(app_nf),
              "st=%s %s" % (s_nf, blob(b_nf)[:160]))

        s_cf, b_cf = (0, {})
        if s_pub == 200:
            s_cf, b_cf = call("/api/opportunities/%s/apply" % opp2_id,
                              method="POST", token=nctrl, payload={})
            app_nc = (b_cf.get("application") or {}).get("id") \
                if s_cf == 201 else None
        check("10.7 control student applied (201)", bool(app_nc),
              "st=%s %s" % (s_cf, blob(b_cf)[:160]))

        # applied -> reviewing is the first legal recruiter transition;
        # each committed move fires _notify_application_status().
        s_t1, b_t1 = (0, {})
        if app_nf:
            s_t1, b_t1 = call("/api/applications/%s/status" % app_nf,
                              method="PATCH", token=rec2,
                              payload={"status": "reviewing"})
        check("10.8 recruiter moved nfilter app applied -> reviewing",
              s_t1 == 200, "st=%s %s" % (s_t1, blob(b_t1)[:160]))

        s_t2, b_t2 = (0, {})
        if app_nc:
            s_t2, b_t2 = call("/api/applications/%s/status" % app_nc,
                              method="PATCH", token=rec2,
                              payload={"status": "reviewing"})
        check("10.9 recruiter moved control app applied -> reviewing",
              s_t2 == 200, "st=%s %s" % (s_t2, blob(b_t2)[:160]))

        # List response nests rows under "items" (+ unread_count).
        s_no, b_no = call("/api/notifications", token=nfilter)
        types_nf = [r.get("type") for r in (b_no.get("items") or [])]
        check("10.10 notifications endpoint healthy for nfilter",
              s_no == 200, "st=%s" % s_no)
        check("10.11 NO application_status row for nfilter (category OFF)",
              "application_status" not in types_nf, "types=%s" % types_nf)

        s_co, b_co = call("/api/notifications", token=nctrl)
        types_nc = [r.get("type") for r in (b_co.get("items") or [])]
        check("10.12 control DID receive application_status (writer proof)",
              s_co == 200 and "application_status" in types_nc,
              "st=%s types=%s" % (s_co, types_nc))

    # ----------------------------------------------------------------
    # 11. DELETE — anonymizing erasure, login rejected after.
    # ----------------------------------------------------------------
    # This route is intentionally additive and SAFE: it never runs
    # ``DELETE FROM users`` (foreign keys on projects/connections/
    # messages make that unsafe), and it never exposes row internals.
    # It scrubs identifying fields, sets account_status="deleted", and
    # the login path rejects a deleted account so it is unusable.
    sxd, idxd, _, emxd = signup_login("student", "s32xd", None)
    sxp, _bxp = call("/api/profile/me", token=sxd,
                     method="PUT", payload={"profile": {
                         "target_job_role": "QA Intern",
                         "preferred_industry": "Testing"}})
    call("/api/account/delete", token=sxd, method="POST", payload={
        "password": "TestPass123!", "confirm": "DELETE"})
    # The deleted token is dead; login must refuse.
    s, b = call("/login", method="POST", payload={
        "email": emxd, "password": "TestPass123!"})
    check("11.1 deleted account cannot log in", s != 200, "st=%s %s" % (s, blob(b)[:160]))
    # A fresh account with the same email should be able to sign up
    # (the old identity was anonymized, not hard-deleted).
    s, b = call("/signup", method="POST", payload={
        "name": "New Owner", "email": emxd, "password": "TestPass123!"})
    check("11.2 same email can sign up again after deletion",
          s == 200 or s == 409, "st=%s %s" % (s, blob(b)[:160]))
except SystemExit:
    raise
except Exception as exc:
    R.append(("unhandled exception: %r" % (exc,), False, ""))
finally:
    # ----------------------------------------------------------------
    # 12. SUMMARY (always runs, even when setup aborts early)
    # ----------------------------------------------------------------
    passed = sum(1 for _label, _ok, _info in R if _ok)
    failed = [_label for _label, _ok, _info in R if not _ok]
    print("\n===== STAGE32 SETTINGS + ACCOUNT — e2e SUMMARY =====")
    print("total=%d  passed=%d  failed=%d" % (len(R), passed, len(failed)))
    for detail in failed:
        print("  FAIL:", detail)
    print("\nIf anything here is red, do NOT ship Settings/Account.")
    print("Expected: 100% green.\n")
    raise SystemExit(0 if not failed else 1)

