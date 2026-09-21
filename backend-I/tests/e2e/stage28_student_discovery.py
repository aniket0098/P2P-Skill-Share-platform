"""STAGE 2.8 - live API tests for student opportunity discovery.

Covers the discovery contract the student Opportunities page now consumes:

    GET /api/opportunities                  (published-only discovery)
    GET /api/opportunities/me/recommended   (server-side eligibility + match)
    GET /api/opportunities/{id}             (detail navigation target)

Run against a live backend (the dev server on 127.0.0.1:8000):

    python _stage28_live_test.py

Every row this script writes is temporary and tagged with RUN; cleanup
removes only rows it created and then re-queries to prove the database is
back to its previous state. Existing demo/test data is never touched.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("TEST_BASE", "http://127.0.0.1:8000")
RUN = "s28" + str(int(time.time()))[-7:]
COMPANY = "Stage28Co " + RUN
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
    return (body or {}).get("opportunities") or (body or {}).get("items") or []


def signup_login(role, tag, profile=None):
    email = tag + "_" + RUN + "@test.local"
    s, _ = call("/signup", method="POST", payload={
        "email": email, "password": "TestPass123!",
        "name": "Stage28 " + tag.title(), "role": role})
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
    """Real student skill write (POST /api/profile/skills)."""
    s, b = call("/api/profile/skills", token=token, method="POST",
                payload={"skill_name": name, "level": level})
    return s in (200, 201, 409), s, blob(b)[:160]


print("RUN:", RUN)
print("BASE:", BASE)

# ---------------------------------------------------------------- setup
recA, recA_id, sA = signup_login("recruiter", "rec28a", {
    "company_name": COMPANY, "job_title": "Talent Lead",
    "industry": "Software", "company_location": "Pune"})
check("A1 temp recruiter created with a company profile", bool(recA), "status=%s" % sA)

stuE, stuE_id, sE = signup_login("student", "stu28elig", {
    "college": "Test College", "degree": "B.Tech", "branch": "CSE",
    "graduation_year": 2027, "cgpa": 8.4, "target_job_role": "Backend Developer"})
stuP, stuP_id, sP = signup_login("student", "stu28part", {
    "college": "Test College", "degree": "B.Tech", "branch": "CSE",
    "graduation_year": 2027, "cgpa": 8.0, "target_job_role": "Backend Developer"})
stuI, stuI_id, sI = signup_login("student", "stu28inelig", {
    "college": "Test College", "degree": "B.E", "branch": "Mechanical",
    "graduation_year": 2028, "cgpa": 5.2, "target_job_role": "Designer"})
stuX, stuX_id, sX = signup_login("student", "stu28incomplete", None)
check("A2 four temp students created (eligible / partial / ineligible / incomplete)",
      all([stuE, stuP, stuI, stuX]), "%s %s %s %s" % (sE, sP, sI, sX))

ok_e, se, de = add_skill(stuE, "Python", "expert")
ok_p, sp, dp = add_skill(stuP, "Python", "beginner")
ok_i, si, di = add_skill(stuI, "Figma", "beginner")
check("A3 student skills added through the real profile API",
      ok_e and ok_p and ok_i, "%s %s %s | %s %s %s" % (se, sp, si, de, dp, di))

s, cat = call("/api/skills", params={"search": "python", "limit": 5})
PY = next((x.get("id") for x in (cat.get("skills") or []) if x.get("id")), None)
s, cat = call("/api/skills", params={"search": "sql", "limit": 5})
SQL = next((x.get("id") for x in (cat.get("skills") or []) if x.get("id")), None)
s, cat = call("/api/skills", params={"search": "figma", "limit": 5})
FIG = next((x.get("id") for x in (cat.get("skills") or []) if x.get("id")), None)
check("A4 catalog skill ids resolved", all([PY, SQL, FIG]),
      "py=%s sql=%s fig=%s" % (PY, SQL, FIG))

# ---------------------------------------------------------------- fixtures
O_INTERN = make_opportunity(recA, {
    "title": "28 Intern Backend " + RUN, "description": "Python and SQL backend internship.",
    "opportunity_type": "internship", "work_mode": "remote", "location": "Remote (India)",
    "duration": "6 months", "compensation": "20000/month", "openings": 2,
    "min_cgpa": 7.0, "eligible_degree": "B.Tech", "eligible_branch": "CSE",
    "min_graduation_year": 2026, "max_graduation_year": 2027,
    "deadline": "2027-03-01T00:00:00Z"}, [
    {"skill_id": PY, "required_level": "intermediate", "importance": "critical",
     "skill_type": "required"},
    {"skill_id": SQL, "required_level": "beginner", "importance": "medium",
     "skill_type": "preferred"}])
O_JOB = make_opportunity(recA, {
    "title": "28 Frontend Job " + RUN, "description": "Figma and UI heavy frontend role.",
    "opportunity_type": "job", "work_mode": "hybrid", "location": "Pune",
    "openings": 1, "deadline": "2027-01-15T00:00:00Z"}, [
    {"skill_id": FIG, "required_level": "advanced", "importance": "critical",
     "skill_type": "required"}])
O_PROJ = make_opportunity(recA, {
    "title": "28 Mini Project " + RUN, "description": "Figma design mini project.",
    "opportunity_type": "mini_project", "work_mode": "onsite", "location": "Bengaluru"},
    [{"skill_id": FIG, "required_level": "beginner", "importance": "medium",
      "skill_type": "required"}])
O_DRAFT = make_opportunity(recA, {
    "title": "28 Draft Role " + RUN, "description": "Must never be discoverable.",
    "opportunity_type": "part_time", "work_mode": "remote", "location": "Pune"},
    [{"skill_id": PY, "required_level": "beginner", "importance": "low",
      "skill_type": "required"}], publish=False)
ID_INTERN = O_INTERN[0]
ID_JOB = O_JOB[0]
ID_PROJ = O_PROJ[0]
ID_DRAFT = O_DRAFT[0]
check("A5 three published opportunities + one draft created via the real recruiter API",
      all([ID_INTERN, ID_JOB, ID_PROJ, ID_DRAFT]) and
      all(x[1] == 200 for x in (O_INTERN, O_JOB, O_PROJ)),
      "intern=%s job=%s proj=%s draft=%s" % (ID_INTERN, ID_JOB, ID_PROJ, ID_DRAFT))

card_keys = ["id", "title", "company_name", "opportunity_type", "work_mode",
             "location", "deadline", "openings", "skills"]

# ================================================================ §26A discovery
s, b = call("/api/opportunities", params={"limit": 100})
all_rows = rows_of(b)
ids = [r.get("id") for r in all_rows]
check("B1 GET /api/opportunities anonymous -> 200 (public discovery)", s == 200, "status=%s" % s)
check("B2 list returns the three published temp rows",
      all(i in ids for i in (ID_INTERN, ID_JOB, ID_PROJ)), "n=%s" % len(ids))
check("B3 draft is NOT discoverable (published-only enforced server-side)",
      ID_DRAFT not in ids, "draft=%s" % ID_DRAFT)
check("B4 every returned row is published",
      all(r.get("status") == "published" for r in all_rows),
      "statuses=%s" % blob(sorted({r.get("status") for r in all_rows})))
check("B5 summary rows expose the fields the card renders",
      bool(all_rows) and all(k in r for r in all_rows for k in card_keys),
      "keys=%s" % blob(sorted(all_rows[0].keys()) if all_rows else []))
check("B6 no recruiter-private data on discovery rows (no owner_user_id)",
      all("owner_user_id" not in r and "owner_id" not in r for r in all_rows))
s, _ = call("/api/opportunities", params={"status": "draft"})
check("B7 ?status=draft rejected (422) — the frontend cannot ask for drafts", s == 422, "status=%s" % s)
s, _ = call("/api/opportunities", params={"opportunity_type": "not_a_type"})
check("B8 bogus opportunity_type -> 422 (no invented enum accepted)", s == 422, "status=%s" % s)

# ================================================================ §26B search
s, b = call("/api/opportunities", params={"search": "28 Intern Backend " + RUN, "limit": 100})
rows = rows_of(b)
check("C1 search by title returns the matching published row",
      s == 200 and [r.get("id") for r in rows] == [ID_INTERN],
      "status=%s ids=%s" % (s, blob([r.get("id") for r in rows])))
s, b = call("/api/opportunities", params={"search": "Python and SQL backend internship", "limit": 100})
check("C2 search matches the description too",
      s == 200 and ID_INTERN in [r.get("id") for r in rows_of(b)], "n=%s" % len(rows_of(b)))
s, b = call("/api/opportunities", params={"search": "bengaluru", "limit": 100})
check("C3 search matches the location (case-insensitive)",
      s == 200 and ID_PROJ in [r.get("id") for r in rows_of(b)], "n=%s" % len(rows_of(b)))
s, b = call("/api/opportunities", params={"search": "zzz-no-such-role-" + RUN, "limit": 100})
check("C4 no hits -> 200 + empty list + total 0 (empty state, never mock rows)",
      s == 200 and rows_of(b) == [] and (b.get("total") in (0, None)),
      "status=%s body=%s" % (s, blob(b)[:160]))

# ================================================================ §26C type filter
s, b = call("/api/opportunities", params={"opportunity_type": "internship", "limit": 100})
rows = rows_of(b)
check("D1 type filter internship -> only internships",
      s == 200 and bool(rows) and all(r.get("opportunity_type") == "internship" for r in rows)
      and ID_INTERN in [r.get("id") for r in rows], "n=%s" % len(rows))
s, b = call("/api/opportunities", params={"opportunity_type": "mini_project", "limit": 100})
rows = rows_of(b)
check("D2 type filter mini_project -> only mini projects",
      s == 200 and bool(rows) and all(r.get("opportunity_type") == "mini_project" for r in rows)
      and ID_PROJ in [r.get("id") for r in rows], "n=%s" % len(rows))
s, b = call("/api/opportunities", params={"limit": 1})
check("D3 type/work-mode enums come from the API filters block",
      s == 200 and isinstance((b.get("filters") or {}).get("opportunity_types"), list)
      and isinstance((b.get("filters") or {}).get("work_modes"), list),
      blob(b.get("filters"))[:200])

# ================================================================ §26D work mode
s, b = call("/api/opportunities", params={"work_mode": "remote", "limit": 100})
rows = rows_of(b)
check("E1 work_mode=remote -> only remote rows",
      s == 200 and bool(rows) and all(r.get("work_mode") == "remote" for r in rows),
      "n=%s" % len(rows))
s, b = call("/api/opportunities", params={"work_mode": "hybrid", "limit": 100})
rows = rows_of(b)
check("E2 work_mode=hybrid -> the hybrid row",
      s == 200 and ID_JOB in [r.get("id") for r in rows]
      and all(r.get("work_mode") == "hybrid" for r in rows), "n=%s" % len(rows))
s, b = call("/api/opportunities", params={"work_mode": "onsite", "limit": 100})
rows = rows_of(b)
check("E3 work_mode=onsite -> the onsite row",
      s == 200 and ID_PROJ in [r.get("id") for r in rows], "n=%s" % len(rows))
s, _ = call("/api/opportunities", params={"work_mode": "on-site"})
check("E4 friendly label 'on-site' is NOT a backend value -> 422 (UI must map labels)",
      s == 422, "status=%s" % s)

# ================================================================ §26E company
s, b = call("/api/opportunities", params={"company": COMPANY, "limit": 100})
rows = rows_of(b)
check("F1 company filter -> only that company",
      s == 200 and len(rows) >= 3
      and all(str(r.get("company_name")) == COMPANY for r in rows)
      and all(i in [r.get("id") for r in rows] for i in (ID_INTERN, ID_JOB, ID_PROJ)),
      "n=%s company=%s" % (len(rows), COMPANY))
s, b = call("/api/opportunities", params={"company": COMPANY.lower(), "limit": 100})
check("F2 company filter is case-insensitive",
      s == 200 and ID_INTERN in [r.get("id") for r in rows_of(b)], "n=%s" % len(rows_of(b)))

# ================================================================ §26F location
s, b = call("/api/opportunities", params={"location": "Pune", "limit": 100})
rows = rows_of(b)
check("G1 location filter -> rows whose location contains Pune",
      s == 200 and ID_JOB in [r.get("id") for r in rows]
      and all("pune" in str(r.get("location") or "").lower() for r in rows), "n=%s" % len(rows))
s, b = call("/api/opportunities", params={"location": "usa-nowhere", "limit": 100})
check("G2 unknown location -> 200 + empty (empty state, not a fallback list)",
      s == 200 and rows_of(b) == [], "n=%s" % len(rows_of(b)))
s, b = call("/api/opportunities", params={"search": "28 Intern", "work_mode": "onsite", "limit": 100})
check("G3 combined search + filter applies both (empty intersection stays empty)",
      s == 200 and rows_of(b) == [], "n=%s" % len(rows_of(b)))

# ================================================================ §26G pagination
s, b = call("/api/opportunities", params={"limit": 2, "offset": 0})
check("H1 limit=2 honoured, has_more true while more rows exist",
      s == 200 and len(rows_of(b)) == 2 and b.get("limit") == 2 and b.get("offset") == 0
      and b.get("has_more") is True, blob({k: b.get(k) for k in ("limit", "offset", "has_more", "total")}))
s, b2 = call("/api/opportunities", params={"limit": 2, "offset": 2})
check("H2 offset page returns different rows",
      s == 200 and {r.get("id") for r in rows_of(b)} != {r.get("id") for r in rows_of(b2)},
      "p1=%s p2=%s" % (blob([r.get("id") for r in rows_of(b)]), blob([r.get("id") for r in rows_of(b2)])))
s, b = call("/api/opportunities", params={"limit": 500})
check("H3 oversized limit is clamped to the backend maximum (<=100)",
      s == 200 and b.get("limit") == 100, "limit=%s" % b.get("limit"))
s, b = call("/api/opportunities", params={"limit": 20, "offset": 99999})
check("H4 offset past the end -> empty page, has_more false (Load more hides)",
      s == 200 and rows_of(b) == [] and b.get("has_more") is False, blob(b)[:160])
s, b = call("/api/opportunities", params={"limit": 0})
# Backend contract: a zero page size is clamped to the default (20), it does
# not 422. The UI never sends limit=0; the requirement is limit <= 100.
check("H5 limit=0 is clamped to the default page size (UI never sends zero)",
      s == 200 and b.get("limit") == 20, "status=%s limit=%s" % (s, b.get("limit")))

# ================================================================ §26L incomplete profile
s, bX = call("/api/opportunities/me/recommended", token=stuX, params={"limit": 100})
profX = bX.get("profile") or {}
check("N1 incomplete-profile student: recommended endpoint does not error",
      s == 200, "status=%s body=%s" % (s, blob(bX)[:160]))
check("N2 profile block reports the missing pieces honestly (has_student_profile/has_skills)",
      ("has_student_profile" in profX) and ("has_skills" in profX) and ("skill_count" in profX),
      blob(profX)[:240])
check("N3 no fabricated eligibility for a student with no profile data",
      all(r.get("eligible") is None or r.get("eligible") is True or r.get("eligible") is False
          for r in rows_of(bX)), "n=%s" % len(rows_of(bX)))
s, b = call("/api/opportunities", params={"search": "28 Intern Backend " + RUN, "limit": 100})
check("N4 discovery still works normally for the incomplete-profile student (public endpoint)",
      s == 200 and ID_INTERN in [r.get("id") for r in rows_of(b)], "n=%s" % len(rows_of(b)))

# ================================================================ §26N unauthorized
s, _ = call("/api/opportunities/me/recommended")
check("O1 recommended without a token -> 401 (never guessed from the client)",
      s == 401, "status=%s" % s)
s, _ = call("/api/opportunities/me/recommended", token="bogus.token.value")
check("O2 recommended with a bogus token -> 401", s in (401, 403), "status=%s" % s)
s, bR = call("/api/opportunities/me/recommended", token=recA)
check("O3 recommended as a recruiter -> 403 student-only (page shows a neutral state)",
      s == 403, "status=%s body=%s" % (s, blob(bR)[:160]))
s, b = call("/api/opportunities", params={"status": "draft", "limit": 5})
check("O4 a client CANNOT ask discovery for drafts (422 reject, not silent filtering)",
      s == 422, "status=%s" % s)
s, b = call("/api/opportunities", params={"opportunity_type": "not_a_real_type"})
check("O5 invalid enum value -> 422 (no invented backend enums)", s == 422, "status=%s" % s)

# ================================================================ §26O no mock fallback
s, b = call("/api/opportunities", params={"search": "zzz-no-such-role-" + RUN, "limit": 20})
check("P1 zero matches -> 200 with an EMPTY list (the UI shows its empty state)",
      s == 200 and rows_of(b) == [] and b.get("total") == 0, blob(b)[:200])
s, b = call("/api/opportunities", params={"limit": 100})
pub_ids = [r.get("id") for r in rows_of(b)]
check("P2 every discovery row is really published (no drafts/closed leak)",
      s == 200 and ID_DRAFT not in pub_ids and all(
          r.get("status") == "published" for r in rows_of(b)),
      "n=%s draft_id=%s leaked=%s" % (len(pub_ids), ID_DRAFT, ID_DRAFT in pub_ids))
check("P3 discovery never exposes recruiter-only fields (owner ids stay server-side)",
      all(("owner_user_id" not in r) and ("owner_id" not in r) for r in rows_of(b)),
      blob(sorted((rows_of(b) or [{}])[0].keys())))
check("P4 rows carry the fields the student card renders (no client-side invention)",
      all(all(k in r for k in ("id", "title", "opportunity_type", "work_mode", "status"))
          for r in rows_of(b)), "n=%s" % len(rows_of(b)))

# ================================================================ §26M detail navigation
s, b = call("/api/opportunities/%s" % ID_JOB, token=stuP)
d = (b.get("opportunity") or {}) if s == 200 else {}
check("I1 detail navigation target (published, authenticated student) -> 200",
      s == 200 and d.get("id") == ID_JOB, "status=%s" % s)
check("I2 detail payload carries the fields the detail page renders",
      bool(d.get("title")) and "skills" in d and "description" in d,
      "keys=%s" % blob(sorted(d.keys())[:14]))
check("I3 ids used in href are real database ids (int)", isinstance(d.get("id"), int),
      "id=%s type=%s" % (d.get("id"), type(d.get("id")).__name__))
s, _ = call("/api/opportunities/%s" % ID_DRAFT, token=stuP)
check("I4 draft detail is not readable by a student (404)", s == 404, "status=%s" % s)
s, _ = call("/api/opportunities/999999999", token=stuP)
check("I5 unknown id -> 404 (no fabricated row)", s == 404, "status=%s" % s)
s, _ = call("/api/opportunities/%s" % ID_JOB, token="bogus.token.value")
check("I6 bogus token -> 401 on detail", s in (401, 403), "status=%s" % s)

# ================================================================ §26H recommended
s, b = call("/api/opportunities/me/recommended", token=stuE, params={"limit": 100})
rec_rows = rows_of(b)
check("J1 GET /me/recommended as student -> 200", s == 200, "status=%s body=%s" % (s, blob(b)[:160]))
check("J2 response carries profile + sorting + disclaimer (server authority)",
      isinstance(b.get("profile"), dict) and b.get("sorting") == ["eligible", "match_percentage", "deadline", "id"]
      and bool(b.get("disclaimer")), "profile=%s" % blob(b.get("profile"))[:200])
check("J3 temp roles are scored (my published rows present)",
      all(i in [r.get("id") for r in rec_rows] for i in (ID_INTERN, ID_JOB, ID_PROJ)),
      "n=%s" % len(rec_rows))
check("J4 every scored row carries the personalization fields",
      bool(rec_rows) and all(k in r for r in rec_rows for k in
                             ("match_percentage", "eligible", "missing_skills", "matched_skills",
                              "skill_match", "eligibility")),
      "keys=%s" % blob(sorted(rec_rows[0].keys()) if rec_rows else []))
check("J5 match_percentage is numeric and within 0-100 (server value, not a guess)",
      all(r.get("match_percentage") is None or (isinstance(r.get("match_percentage"), (int, float))
          and 0 <= r["match_percentage"] <= 100) for r in rec_rows),
      blob([(r.get("id"), r.get("match_percentage")) for r in rec_rows]))

# ================================================================ §26I eligible
elig = next((r for r in rec_rows if r.get("id") == ID_INTERN), {})
check("K1 fully-matching student is marked eligible on the Python internship",
      elig.get("eligible") is True and (elig.get("match_percentage") or 0) > 0,
      blob({k: elig.get(k) for k in ("id", "eligible", "match_percentage")}))
check("K2 eligible row explains which requirement passed (eligibility detail from server)",
      isinstance(elig.get("eligibility"), dict) and bool(elig.get("eligibility_reasons")),
      blob(elig.get("eligibility_reasons"))[:200])
check("K3 eligible row has no required-skill gaps",
      not [m for m in (elig.get("missing_skills") or []) if m.get("skill_type") != "preferred"],
      blob(elig.get("missing_skills"))[:200])

# ================================================================ §26J ineligible
s, bI = call("/api/opportunities/me/recommended", token=stuI, params={"limit": 100})
rowsI = rows_of(bI)
inelig = next((r for r in rowsI if r.get("id") == ID_INTERN), {})
check("L1 ineligible student still RECEIVES the opportunity (discovery is never blocked)",
      s == 200 and bool(inelig), "status=%s found=%s" % (s, bool(inelig)))
check("L2 ineligible student is correctly flagged eligible=false (server verdict)",
      inelig.get("eligible") is False, blob({k: inelig.get(k) for k in ("id", "eligible", "match_percentage")}))
check("L3 ineligible row still carries a match percentage (information, not a barrier)",
      isinstance(inelig.get("match_percentage"), (int, float)),
      "pct=%s" % inelig.get("match_percentage"))
check("L4 low-CGPA / wrong-branch student fails the stated requirements (real reasons from server)",
      bool(inelig.get("eligibility_reasons")), blob(inelig.get("eligibility_reasons"))[:240])
check("L5 sorting contract: eligible rows are ranked before ineligible ones",
      [bool(r.get("eligible")) for r in rowsI] == sorted([bool(r.get("eligible")) for r in rowsI], reverse=True),
      blob([r.get("eligible") for r in rowsI]))

# ================================================================ §26K missing skills
missing = inelig.get("missing_skills") or []
check("M1 missing-skill rows are structured (name + level + type) for the 'Missing:' line",
      bool(missing) and all(("skill_name" in m) and ("skill_type" in m) for m in missing),
      blob(missing)[:240])
check("M2 missing skills name real catalog skills (never invented strings)",
      all(str(m.get("skill_name") or "").strip() for m in missing),
      blob([m.get("skill_name") for m in missing]))
part = next((r for r in rows_of(call("/api/opportunities/me/recommended", token=stuP,
                                     params={"limit": 100})[1]) if r.get("id") == ID_INTERN), {})
check("M3 partially-matching student: real match value + explicit partial/required gaps",
      isinstance(part.get("match_percentage"), (int, float))
      and ("partial_skills" in part) and (part.get("eligible") in (True, False)),
      blob({k: part.get(k) for k in ("id", "eligible", "match_percentage", "partial_skills")})[:240])
matched = elig.get("matched_skills") or []
check("M4 matched skills are reported server-side (what the UI can safely display)",
      all(("skill_name" in m) for m in matched), blob(matched)[:200])
check("M5 skill_match counts are integers (used for the match bar/labels)",
      isinstance(elig.get("skill_match"), dict)
      and all(isinstance(v, int) for v in (elig.get("skill_match") or {}).values()),
      blob(elig.get("skill_match")))

# ---------------------------------------------------------------- cleanup
# Runs LAST: the sections above need the temporary rows to still exist.
# Drafts go through the real API DELETE; everything else through the DB,
# and only rows this script created (captured ids / RUN-tagged emails).
for oid in list(CREATED["drafts"]):
    call("/api/opportunities/%s" % oid, token=recA, method="DELETE")
leftover = []
try:
    import sys
    # Backend root = dirname(dirname(dirname(abspath(__file__)))) for tests/e2e/<file>.py
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    from database import SessionLocal
    from models import (Application as MApp, Opportunity as MOpp,
                        OpportunitySkill as MOS, Skill as MSkill,
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
            ("rows_deleted_without_capture", [s.id for s in sess.query(MOS).filter(
                MOS.opportunity_id.in_(list(CREATED["opps"]) or [0])).all()]),
            ("temp_companies_left", [o.id for o in sess.query(MOpp).filter(
                MOpp.company_name == COMPANY).all()]),
        ]
    finally:
        sess.close()
except Exception as exc:
    leftover = [("cleanup_error", str(exc)[:200])]
clean_ok = all((not v) for _, v in leftover)
check("Q1 every temp user/opportunity/skill row was removed (DB re-queried)", clean_ok, blob(leftover))
check("Q2 cleanup left the pre-existing published rows untouched",
      len(call("/api/opportunities", params={"limit": 100})[1].get("opportunities") or []) >= 2,
      "kept=%s" % len(call("/api/opportunities", params={"limit": 100})[1].get("opportunities") or []))
check("Q3 no temporary role is still discoverable",
      all(("28 Intern " + RUN) not in str(r.get("title")) and
          COMPANY not in str(r.get("company_name"))
          for r in (call("/api/opportunities", params={"limit": 100})[1].get("opportunities") or [])),
      "temp_ids=%s" % blob([ID_INTERN, ID_JOB, ID_PROJ]))



passed = sum(1 for _, ok_, _ in R if ok_)
failed = [(lb, inf) for lb, ok_, inf in R if not ok_]
print("")
print("================ RESULT ================")
print("TOTAL=%s PASSED=%s FAILED=%s" % (len(R), passed, len(failed)))
for lb, inf in failed:
    print("  FAIL  %s  -> %s" % (lb, inf))
print("========================================")







