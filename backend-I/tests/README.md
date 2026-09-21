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
    duplicate/withdraw/re-apply 409s; try/finally captured-id cleanup with
    fixture-scoped verification; env-token admin checks (SKIP when absent).
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
    apply → 201 with snapshot, DB row verification, self-cleanup proof;
    partial-match student asserts the structured 409 `not_eligible`
    payload while a separate eligible student runs the 201 lifecycle.
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

## Target safety (all five E2E suites)

Local is the default: `TEST_BASE` falls back to
`http://127.0.0.1:8000`, and `127.0.0.1` / `localhost` (plus `::1`,
`0.0.0.0`, `127.x.x.x`, `*.localhost`) all count as local. Every suite
prints its resolved target at startup:

```text
TEST TARGET: http://127.0.0.1:8000
TEST TARGET MODE: LOCAL
```

A non-local `TEST_BASE` **refuses to run** (exit code 2, before any
request is sent and before any fixture is created) unless the operator
explicitly opts in with **both** variables:

```powershell
$env:TEST_BASE = "https://example.com"
$env:TEST_ALLOW_REMOTE = "1"
$env:TEST_CONFIRM = "yes-i-know"
```

Remote runs then print `TEST TARGET MODE: REMOTE - EXPLICITLY
AUTHORIZED`. Destructive E2E tests should normally remain local because
they create and delete real rows on whatever target they are given;
tokens and credentials are never printed by the target-safety banner.

## Known limitations (Stage 2.11A P0 test-hardening applied; rest is future work)

1. Stage 2.9 stale expectations (corrected in Stage 2.11A - fixture-stale,
   never a defect): production correctly returns **409 `not_eligible`**
   (match 50% + reasons) for the partial-match student, while the old
   fixture expected that student to apply with 201. The suite is now
   separated into an explicit *ineligible* test (the genuinely
   partial-match student asserts the structured 409 `not_eligible`
   payload, including match percentage, missing-skill block and
   eligibility reasons) and an *eligible application lifecycle* test (a
   separate student that satisfies the required skill reaches 201 with
   the full row contract). Related: the API detail serializer
   legitimately includes `skill_id` in skill rows; the fixture validates
   the display + requirement metadata instead of requiring `skill_id` to
   be absent.
2. Stage 2.5B suite now implements **captured-id cleanup under
   try/finally** (fixture applications -> opportunity_skills ->
   opportunities -> profiles/user_skills -> users -> credit tables as the
   schema requires; verification re-queries the captured ids /
   run-tagged rows only, never global DB counts). Do NOT run it against
   production lightly: it still writes and deletes real rows on the
   target. Its admin checks run only when `TEST_ADMIN_TOKEN` is set in
   the environment and are recorded as **SKIP** (never PASS/FAIL)
   otherwise; no tokens are minted, forged, or printed, and no user ids
   are hard-coded.
3. `backend-I\test_part2_security.py` previously contained a hardcoded
   Neon DATABASE_URL (line ~13); that hardcoded credential has since been
   removed - the script now reads DATABASE_URL from the environment/.env.
4. Known security limitation (redacted): the repository history contains
   previously committed credential-bearing files. Rotation/remediation
   of those credentials is a separate security stage - no secret values
   are reproduced in this documentation or in any test file.
