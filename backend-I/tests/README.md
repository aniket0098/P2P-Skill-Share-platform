# Regression tests — Stages 2.5B–2.9 (Opportunities / Applications)

Permanent home for the Stage 2.5B–2.9 verification suites. Moved here during
Stage 2.10 cleanup from the old root-level `_stage*` / `_s*` scratch files.
Production code is NOT covered here; these suites exercise the live backend
and the built frontend pages.

## Layout

- `e2e/` — live HTTP suites (stdlib `urllib` only, disposable timestamped
  accounts via real `/signup`+`/login`, `TEST_BASE` env var, default
  `http://127.0.0.1:8000`; never run against production without the
  cleanup caveats below):
  - `stage25b_recruiter_authorization.py` — owner list/patch 200,
    same-company non-owner 403, cross-company 403, student 403, 401/404s,
    pagination/isolation, status transitions + 422/409 guards,
    duplicate/withdraw/re-apply 409s.
  - `stage26_opportunity_crud.py` — recruiter-only create, skill attach,
    publish gating, draft invisibility, owner-only PATCH/DELETE + hijack
    403s, close lifecycle.
  - `stage27_recruiter_opportunities.py` — Jobs/Opportunities API contracts
    used by `jobs.js` / `opportunity-details.js`, ownership + lifecycle
    rules the UI depends on.
  - `stage28_student_discovery.py` — published-only discovery,
    `/me/recommended` eligibility + match, detail navigation target.
  - `stage29_application_flow.py` — student apply flow: personalization
    keys, draft/unknown 404s, recruiter-apply 403, forged-id 422,
    deadline/draft/duplicate 409s, withdraw + re-apply 409, eligible
    apply → 201 with snapshot, DB row verification, self-cleanup proof.
- `dom/` — jsdom behaviour suites (stub API, no network, no DB; run with
  plain `node tests/dom/<file>.js` from `backend-I/`, needs the repo-root
  `node_modules` with `jsdom`):
  - `stage27_recruiter_opportunities.js` — jobs + opportunity-details page
    behaviour.
  - `stage28_student_discovery.js` — opportunities page behaviour.
  - `stage29_application_flow.js` — Apply-panel states of
    opportunity-details (the only frontend-behaviour coverage of Apply).

Still root-level (kept, review later): `_stage28_browser_test.py`
(Playwright real-browser discovery checks; needs Chromium + frontend on
`:5500`) and `_stage27_idcheck.js` (one-off JS↔HTML id cross-check).

## How to run

```powershell
cd backend-I
$env:TEST_BASE = "http://127.0.0.1:8000"   # default if unset
.\.venv\Scripts\python.exe tests\e2e\stage29_application_flow.py
node tests\dom\stage29_application_flow.js
```

Run E2E suites only against a LOCAL backend; self-cleaning suites delete
only rows they created (captured ids / run-tagged emails).

## Known limitations (future test-hardening, NOT fixed here)

1. Stage 2.9 stale expectations (deliberately unchanged in Stage 2.10):
   production and local both return **409 `not_eligible`** (match 50% +
   reasons) where the fixture expects a partial-match student to apply
   with 201, plus one extra `skill_id` key in detail skills. Result on
   production E2E: 28/38, byte-identical to two stored local runs —
   fixture-stale, not defects.
2. Stage 2.5B suite implements **NO cleanup** (header claims it does):
   do NOT run it against production unless cleanup is added first. Its
   admin-token checks also mint tokens with the LOCAL `SECRET_KEY`, so
   they only pass when the target shares the same secret (production
   returns 401 instead of 403 for those two checks).
3. `backend-I\test_part2_security.py` contains a hardcoded Neon
   DATABASE_URL (line ~13): credential rotation is a separate security
   task — do not touch that file here.
