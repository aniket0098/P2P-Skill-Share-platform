# STAGE 7 — INDUSTRY SANDBOX — FINAL REPORT

## 1. CODEBASE INSPECTION

**Files inspected (source of truth):**
- `backend-I/models.py` — all SQLAlchemy models (User, Skill, SkillEvidence, SkillHistory, UserSkill, Project, LearningRecord, industry models)
- `backend-I/database.py`, `backend-I/config.py` — engine/session/JWT config
- `backend-I/main.py` (~3230 lines) — auth (`/login`, `/signup`), profile, skills, projects, learning resources, admin-request flow; `register_stage6()` at 3220, `register_stage7()` at 3228
- `backend-I/auth.py` — JWT encode/decode, `get_current_user_model`
- `backend-I/stage5_service.py`, `backend-I/stage5_api.py` — skill mapping, readiness, role gaps
- `backend-I/stage6_service.py`, `backend-I/stage6_api.py` — `upsert_evidence()`, `record_history()`, project gallery, `/api/skills/evidence`, `/api/skills/growth`
- `peer to peer skill share/industry-sandbox.html/.css/.js` — pre-existing Sandbox page (route preserved)
- `peer to peer skill share/api-client.js`, `portal-shell.js`, `skill-mapping.js` — frontend API layer & shell

**Existing architecture reused:** static-HTML + vanilla-JS frontend served by FastAPI; JWT `Authorization: Bearer` header auth; `register_stageN(app, get_db, get_current_user_model)` additive-registration pattern; Stage 6 evidence upsert (idempotent by user+skill+source_type+source_id); Stage 5 mapping engine.

## 2. DATABASE

**Existing models reused (no duplicates created):** `Skill`, `SkillEvidence`, `SkillHistory`, `UserSkill`, `User`, `Project`.

**New models (in `models.py`, additive only):**
| Model | Table | Purpose |
|---|---|---|
| `SandboxChallenge` | sandbox_challenges | title, slug, description, business_context, expected_outcome, industry, domain, difficulty, estimated_time, status, company_name, evaluation_criteria(JSON), deadline, is_demo, created_by |
| `SandboxChallengeSkill` | sandbox_challenge_skills | FK challenge→Skill (reuses Stage 5 skill catalog; no second catalog) |
| `SandboxTask` | sandbox_tasks | challenge_id, title, description, task_type (TEXT_RESPONSE/CODE/GITHUB/URL/DESIGN/DOCUMENT/MIXED), instructions, order_index |
| `SandboxResource` | sandbox_resources | challenge_id, title, resource_type, url, description |
| `SandboxParticipant` | sandbox_participants | challenge_id, user_id, status, started_at, completed_at |
| `SandboxSubmission` | sandbox_submissions | challenge_id, user_id, content, github_url, demo_url, draft_data, status, attempt (multi-attempt-ready), submitted_at, updated_at |
| `SandboxEvaluation` | sandbox_evaluations | submission_id, overall_score, feedback, evaluation_type, evaluated_by |
| `SandboxEvaluationCriterion` | sandbox_evaluation_criteria | evaluation_id, name, score, max_score, comment (explainable scores) |

**Migration:** tables created by SQLAlchemy `create_all` (additive CREATE TABLE semantics) on first startup; seed via `seed_stage7.py` (idempotent — skips if challenges exist, upserts skills).

**Data preservation verified (live counts):** users=73, skills=31, user_skills=3, skill_evidence=8, projects=4, learning_records=6 — all pre-existing data intact. Sandbox tables: 4 challenges, 16 tasks, 4 resources, 4 participants, 3 submissions, 2 evaluations, 6 criteria, 15 challenge-skills.

## 3. SANDBOX MODULE

- **Catalog:** `GET /api/sandbox/challenges` with backend filtering (search/domain/difficulty/status/skill/limit) + filter options. 4 seeded challenges clearly marked `is_demo=true` ("DEMO" badge in UI).
- **Detail:** overview, business context, expected outcome, required skills (from Skill catalog), tasks, resources, evaluation criteria, deadline, participation status.
- **Participants:** idempotent join (`get_or_create_participant`); duplicate start returns same row with `already_joined: true`.
- **Workspace:** `GET /api/sandbox/workspace/{id}` returns challenge + tasks + resources + skills + submission; 3-pane UI (tasks / editor / resources+skills), task navigation, mobile stacking.
- **Submissions:** draft auto-save (3s debounce → "Saved HH:MM:SS") + explicit Save Draft; submit requires content or GitHub URL; duplicate submit → 400; attempt counter supports future re-attempts.
- **Evaluation:** mentor/faculty/admin only; overall score + per-criterion scores; no fabricated recruiter/industry claims; unevaluated state shows "Awaiting evaluation".

## 4–6. SKILL INTEGRATION / EVIDENCE / MAPPING

Evaluation → `create_sandbox_evidence()` (stage7_service.py):
- For **each required skill** of the challenge: `stage6.upsert_evidence(user_id, skill_id, source_type="sandbox", source_id=submission.id, score=overall, confidence=…)`. Idempotent → duplicate evaluation never duplicates evidence (verified: 4 created, re-eval still 4).
- Confidence labels (honest): `verified` only for mentor/faculty/industry evaluations; `project` for automated; score carried through; no "Expert" inflation.
- `record_history(event_type="sandbox_completed")` for the primary skill.
- Evidence text: `"Industry Sandbox — {challenge title} (score N/100)"`, extra JSON carries challenge_id/evaluation_id → fully traceable.
- Stage 5 untouched: evidence feeds existing recompute (`/api/skills/evidence`, `/api/skills/growth` verified live; `/api/skill-mapping/me` still 200).
- Recommendations: deterministic Stage 5-based matching (`recommend_challenges`) with explainable `reason`; no AI.

## 7. FRONTEND

- `industry-sandbox.html` (route preserved) + `industry-sandbox.js`: live stats (0 + empty states when no data), search/filters (backend-driven), recommended challenges, my challenges.
- `sandbox-challenge.html/.js` (new): full detail view, Start/Continue actions.
- `sandbox-workspace.html/.js` (new): tasks/workspace/resources layout, autosave, submit confirmation, locked state after submit.
- States: loading, empty, error, unavailable, unauthorized (no blank screens); navy/slate + cyan design system; responsive stacking.
- Files: `industry-sandbox.css` (created), `api-client.js` (+8 sandbox methods).

## 8. API (all registered via register_stage7 unless noted)

- `GET  /api/sandbox/challenges` (public; search, domain, difficulty, status, skill, limit)
- `GET  /api/sandbox/challenges/{id}` (JWT)
- `POST /api/sandbox/challenges/{id}/start` (JWT; idempotent)
- `GET  /api/sandbox/my-challenges` (JWT)
- `GET  /api/sandbox/my-challenges/{id}` (JWT)
- `GET  /api/sandbox/workspace/{id}` (JWT; must be joined)
- `PUT  /api/sandbox/workspace/{id}/draft` (JWT; own draft only)
- `POST /api/sandbox/workspace/{id}/submit` (JWT; own submission only)
- `GET  /api/sandbox/submissions/{id}` (JWT; owner or admin/mentor/faculty)
- `POST /api/sandbox/submissions/{id}/evaluate` (JWT; mentor/faculty/admin)
- `GET  /api/sandbox/dashboard` (JWT; real stats)
- `GET  /api/sandbox/recommendations` (JWT; deterministic)
- `POST /api/sandbox/admin/challenges` (JWT; admin only)

**Modified (bug fix):** `main.py` — moved `register_stage6(...)` above `GET /api/skills/{skill_id}` wildcard so Stage 6 endpoints `/api/skills/evidence` and `/api/skills/growth` are no longer shadowed (they previously returned 422). Verified `/api/skills/1` still works after reorder.

## 9. SECURITY

- Current user always from JWT (`get_current_user_model`); never from body/URL/query.
- Ownership enforced on workspace/draft/submit/submission-detail (403 for other users' records — tested).
- Evaluation restricted to mentor/faculty/admin (student self-evaluation → 403 — tested). Students cannot modify evidence (no such endpoint; evidence written server-side from evaluation only).
- Admin signup remains blocked by pre-existing `SignupRequest` validation (403 for anything outside student/recruiter/mentor); admin challenge creation under `/api/sandbox/admin/challenges` + `require_admin`.
- Challenge create/edit/delete **not** exposed to students.

## 10. TESTING

`backend-I/test_stage7_live.py` (39 checks) vs live server: **39/39 PASSED** — auth (logged-out/invalid/expired JWT → 401), catalog, search "API", domain/difficulty filters, detail fields, unknown id → 404, start + duplicate-start protection, second user isolation, workspace keys, draft save/persist-after-reload, cross-user view → 403, submit, duplicate-submit → 400, awaiting evaluation, self-eval → 403, mentor view, mentor evaluation (82.0), 3 criteria, 4 evidence rows, evidence upsert idempotency, student sees evaluation, dashboard stats (joined=1, completed=1), my-challenges, recommendations (2, explainable), evidence in skill passport (evidence=4, sandbox=4), Stage 5 mapping intact, Stage 6 growth intact, `/api/stats` members=73, industry domains, login rejects bad creds.

`test_stage5_live.py`: 13/14 — the single FAIL ("A no-skills map honest") is a **pre-existing idempotency flaw in that test** (it reuses fixed email `alpha_e2eprof@test.local` and itself adds a skill to that user every run, so the no-skills precondition cannot hold after the first run). Not a Stage 7 regression.

`/api/skills/1` after reorder: 200. All three sandbox JS files syntax-validated.

## 11. FILES CHANGED

**Backend:** `models.py` (+8 sandbox models), `stage7_api.py` (new), `stage7_service.py` (new), `main.py` (+register_stage7; register_stage6 moved above skills wildcard), `seed_stage7.py` (new), `test_stage7_live.py` (new), `STAGE7_REPORT.md` (this file).
**Frontend:** `industry-sandbox.js` (rewritten to live API), `industry-sandbox.css` (new), `sandbox-challenge.html` (new), `sandbox-challenge.js` (new), `sandbox-workspace.html` (new), `sandbox-workspace.js` (new), `api-client.js` (+8 methods).
**Untouched:** `login.html`, `signup.html`, `auth.py`, portal shell/navigation.

## 12. DATABASE SAFETY CONFIRMATION

- ✅ NO DATABASE RESET
- ✅ NO TABLE DELETION
- ✅ NO USER DELETION (users=73 preserved)
- ✅ NO PROJECT DELETION (projects=4 preserved)
- ✅ NO LEARNING DATA DELETION (learning_records=6 preserved)
- ✅ NO SKILL DATA DELETION (skills=31, user_skills=3, skill_evidence=8 preserved)
- ✅ NO AUTH ROUTE CHANGE
- ✅ NO login.html ROUTE CHANGE (file intact, still referenced by all sandbox pages)
- ✅ NO signup.html ROUTE CHANGE (file intact)
- ✅ NO NAVIGATION ROUTE BREAKING (Stage 5/6 regressions pass; portal shell untouched)

## 13. NEXT STAGE (ready, not implemented)

The evidence system (`source_type="sandbox"`) is the plug-in point for Stage 8+: AI Career Coach / CareerVerse can consume sandbox evidence + evaluation history; Recruiter Talent Search can query verified sandbox evidence; evaluation `evaluation_type` already supports recruiter/industry values for future authorized evaluators. Multi-attempt submissions already modeled via `attempt`. Task types CODE/FILE_UPLOAD/DESIGN modeled but Stage 7 implements TEXT_RESPONSE + GITHUB_URL submission paths.
