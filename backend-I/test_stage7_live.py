"""Stage 7 verification: additive checks only, no destructive actions.
Covers Phase 34 test matrix: catalog, search/filters, detail, start, duplicate
protection, workspace draft, submit, evaluation, security, evidence, Stage 5
integration and regression of existing routes.
"""
import json, time, urllib.request, urllib.parse
BASE = "http://127.0.0.1:8000"


def call(path, token=None, method="GET", payload=None, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload is not None else None
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)}


R = []
tok = tok2 = mentok = None


def check(label, ok, info=""):
    R.append((label, bool(ok), str(info)))


# ---------- 1. Logged-out / auth behavior ----------
s, b = call("/api/sandbox/challenges")
check("logged-out catalog readable", s == 200 and "challenges" in b, f"status={s}")
s, b = call("/api/sandbox/my-challenges")
check("logged-out my-challenges -> 401", s == 401, f"status={s}")
s, b = call("/api/sandbox/my-challenges", token="bad.token.value")
check("invalid JWT -> 401", s == 401, f"status={s}")
s, b = call("/api/sandbox/my-challenges", token="expired.jwt.sig")
check("expired/garbage JWT -> 401", s == 401, f"status={s}")

# ---------- 2. Ensure test users (unique per run -> deterministic) ----------
RUN = str(int(time.time()))[-7:]
stu_email = f"alpha_s7_{RUN}@test.local"
stu2_email = f"bravo_s7_{RUN}@test.local"
men_email = f"mentor_s7_{RUN}@test.local"
for email, role in ((stu_email, "student"), (stu2_email, "student"), (men_email, "mentor")):
    s2, b2 = call("/signup", method="POST", payload={
        "email": email, "password": "TestPass123!", "name": "Stage7 Tester", "role": role})
    s, b = call("/login", method="POST", payload={"email": email, "password": "TestPass123!"})
    if s == 200 and b.get("access_token"):
        if role == "student" and not tok:
            tok = b["access_token"]
        elif role == "student" and not tok2:
            tok2 = b["access_token"]
        elif role == "mentor" and not mentok:
            mentok = b["access_token"]
check("test users login", bool(tok and tok2 and mentok), f"A={bool(tok)} B={bool(tok2)} M={bool(mentok)}")
if tok:
    # Give user A one profile skill so Stage 5-driven recommendations have material.
    call("/api/profile/skills", token=tok, method="POST",
         payload={"skill_name": "Python", "level": "intermediate", "self_rating": 3})
challenge_id = None
if tok:
    # ---------- 3. Catalog / search / filters ----------
    s, b = call("/api/sandbox/challenges", params={"search": "API"})
    n_search = len(b.get("challenges", []))
    check("catalog search 'API'", s == 200, f"status={s} n={n_search}")
    s, b = call("/api/sandbox/challenges", params={"domain": "Software Development"})
    all_sd = all(c.get("domain") == "Software Development" for c in b.get("challenges", []))
    check("filter domain", s == 200 and all_sd, f"status={s}")
    s, b = call("/api/sandbox/challenges", params={"difficulty": "beginner"})
    all_beg = all(c.get("difficulty") == "beginner" for c in b.get("challenges", []))
    check("filter difficulty", s == 200 and all_beg, f"status={s}")
    s, b = call("/api/sandbox/challenges")
    challenges = b.get("challenges", [])
    check("challenge fields present", challenges and all(
        all(k in c for k in ("id", "title", "domain", "difficulty", "skills", "estimated_time", "status"))
        for c in challenges), f"n={len(challenges)}")
    if challenges:
        challenge_id = challenges[0]["id"]
        s, b = call(f"/api/sandbox/challenges/{challenge_id}", token=tok)
        d = b  # detail returns challenge fields at top level
        check("challenge detail", s == 200 and d.get("title"), f"status={s}")
        check("detail has tasks/resources/criteria/skills",
              all(k in d for k in ("tasks", "resources", "evaluation_criteria", "skills")),
              f"tasks={len(d.get('tasks', []))} res={len(d.get('resources', []))} skills={len(d.get('skills') or [])}")
        s, b = call("/api/sandbox/challenges/99999999", token=tok)
        check("unknown challenge -> 404", s == 404, f"status={s}")

    # ---------- 4. Start + duplicate protection ----------
    s, b = call(f"/api/sandbox/challenges/{challenge_id}/start", token=tok, method="POST")
    check("start challenge", s in (200, 201) and b.get("participant", {}).get("status") == "in_progress",
          f"status={s} status_p={b.get('participant', {}).get('status')}")
    s2, b2 = call(f"/api/sandbox/challenges/{challenge_id}/start", token=tok, method="POST")
    same = (s == s2) and (b.get("participant", {}).get("id") == b2.get("participant", {}).get("id"))
    check("duplicate start protection", s2 in (200, 201) and same, f"status={s2} same={same}")
    s, b = call(f"/api/sandbox/challenges/{challenge_id}/start", token=tok2, method="POST")
    check("second user start separate", s in (200, 201), f"status={s}")

    # ---------- 5. Workspace + draft ----------
    s, b = call(f"/api/sandbox/workspace/{challenge_id}", token=tok)
    check("open workspace", s == 200 and "submission" in b and "tasks" in b, f"status={s} keys={list(b.keys())[:6]}")
    sub_id = (b.get("submission") or {}).get("id")  # None until first save (by design)
    s, b = call(f"/api/sandbox/workspace/{challenge_id}/draft", token=tok, method="PUT",
                payload={"content": "REST inventory API design: PostgreSQL tables + FastAPI endpoints.",
                         "github_url": "https://github.com/alpha/inventory-api"})
    check("save draft", s == 200, f"status={s}")
    sub_id = ((b.get("submission") or {}).get("id")) or sub_id
    check("draft submission created on save", bool(sub_id), f"sub_id={sub_id}")
    s, b = call(f"/api/sandbox/workspace/{challenge_id}", token=tok)
    dsub = b.get("submission") or {}
    check("draft persists after reload", s == 200 and "inventory-api" in (dsub.get("github_url") or "")
          and dsub.get("status") == "draft",
          f"status={s} github={dsub.get('github_url')} status={dsub.get('status')}")
    s2, b2 = call(f"/api/sandbox/submissions/{sub_id}", token=tok2)
    check("User B cannot view User A submission", s2 == 403, f"status={s2}")

    # ---------- 6. Submit ----------
    s, b = call(f"/api/sandbox/workspace/{challenge_id}/submit", token=tok, method="POST", payload={})
    sub = b.get("submission", {})
    check("submit solution", s == 200 and sub.get("status") == "submitted", f"status={s} status={sub.get('status')}")
    s2, b2 = call(f"/api/sandbox/workspace/{challenge_id}/submit", token=tok, method="POST", payload={})
    check("duplicate submit protection", s2 == 400, f"status={s2}")
    s3, b3 = call(f"/api/sandbox/submissions/{sub_id}", token=tok)
    check("submission detail + awaiting evaluation",
          s3 == 200 and b3.get("status") == "submitted" and b3.get("evaluation") is None,
          f"status={s3} ev={b3.get('evaluation')}")

    # ---------- 7. Security on evaluation ----------
    s, b = call(f"/api/sandbox/submissions/{sub_id}/evaluate", token=tok, method="POST",
                payload={"overall_score": 99, "feedback": "self eval"})
    check("student cannot self-evaluate", s == 403, f"status={s}")
    s, b = call(f"/api/sandbox/submissions/{sub_id}", token=mentok)
    check("mentor may view submission", s == 200, f"status={s}")

    # ---------- 8. Evaluation + evidence ----------
    s, b = call(f"/api/sandbox/submissions/{sub_id}/evaluate", token=mentok, method="POST",
                payload={"overall_score": 82,
                         "feedback": "Solid schema, good REST design.",
                         "evaluation_type": "mentor",
                         "criteria": [{"name": "Technical correctness", "score": 82},
                                      {"name": "Problem solving", "score": 76},
                                      {"name": "Documentation", "score": 70}]})
    ev = b.get("evaluation", {})
    check("mentor evaluation", s == 200 and ev.get("overall_score") == 82, f"status={s} score={ev.get('overall_score')}")
    evc = ev.get("criteria", [])
    check("explainable criteria", len(evc) >= 3, f"n={len(evc)}")
    evidence_created = b.get("evidence_created", 0)
    check("evidence created for required skills", evidence_created > 0, f"n={evidence_created}")
    s2, b2 = call(f"/api/sandbox/submissions/{sub_id}/evaluate", token=mentok, method="POST",
                  payload={"overall_score": 82, "feedback": "re-eval", "evaluation_type": "mentor"})
    check("duplicate evidence prevented (upsert)", s2 == 200 and b2.get("evidence_created", 0) <= evidence_created,
          f"status={s2} created={b2.get('evidence_created')}")
    s3, b3 = call(f"/api/sandbox/submissions/{sub_id}", token=tok)
    check("student sees evaluation", s3 == 200 and (b3.get("evaluation") or {}).get("overall_score") == 82,
          f"status={s3} score={(b3.get('evaluation') or {}).get('overall_score')}")

    # ---------- 9. Dashboard / my-challenges / recommendations ----------
    s, b = call("/api/sandbox/dashboard", token=tok)
    d = b.get("stats", b)
    check("student dashboard real stats", s == 200 and all(k in d for k in ("joined", "in_progress", "completed")),
          f"status={s} joined={d.get('joined')} completed={d.get('completed')}")
    s, b = call("/api/sandbox/my-challenges", token=tok)
    mine = b.get("challenges", [])
    check("my-challenges lists joined", s == 200 and any(
        (c.get("challenge") or c).get("id") == challenge_id for c in mine), f"status={s} n={len(mine)}")
    s, b = call("/api/sandbox/recommendations", token=tok)
    recs = b.get("recommendations", [])
    check("recommendations deterministic+explainable", s == 200 and len(recs) >= 1 and all(
        ("reason" in r) for r in recs), f"status={s} n={len(recs)}")

    # ---------- 10. Stage 5/6 integration ----------
    s, b = call("/api/skills/evidence", token=tok)
    ev_rows = b.get("evidence", [])
    sandbox_rows = [e for e in ev_rows if e.get("source_type") == "sandbox"]
    check("sandbox evidence in skill passport", s == 200 and len(sandbox_rows) >= 1,
          f"status={s} evidence={len(ev_rows)} sandbox={len(sandbox_rows)}")
    s, b = call("/api/skill-mapping/me", token=tok)
    check("Stage 5 mapping still works", s == 200 and "readiness_score" in b, f"status={s}")
    s, b = call("/api/skills/growth", token=tok)
    check("Stage 6 growth works", s == 200, f"status={s}")

# ---------- 11. Regression of existing routes ----------
s, b = call("/api/stats")
check("regression /api/stats", s == 200 and "members" in b, f"status={s} members={b.get('members')}")
s, b = call("/api/industry/domains")
check("regression industry domains", s == 200 and len(b.get("domains", [])) >= 8, f"status={s}")
s, b = call("/login", method="POST", payload={"email": "wrong@x.test", "password": "nope1234"})
check("regression login rejects bad creds", s in (400, 401), f"status={s}")

print("=" * 72)
fail = 0
for label, ok, info in R:
    print(("[PASS] " if ok else "[FAIL] ") + label + " -- " + info)
    fail += 0 if ok else 1
print("=" * 72)
print(f"{len(R) - fail}/{len(R)} passed")

