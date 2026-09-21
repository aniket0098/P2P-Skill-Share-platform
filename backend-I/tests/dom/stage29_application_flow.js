/* =====================================================================
   STAGE 2.9 — behavioural test suite (jsdom, temp tooling)

   Drives opportunity-details.html + .js against a call-recording stub API
   that mocks the STAGE 2.9 contracts:
     - GET  /api/opportunities/{id}        -> getOpportunity(id)
     - GET  /api/applications/me          -> getMyApplications({limit,offset})
     - POST /api/opportunities/{id}/apply -> applyToOpportunity(id, payload)

   No network, no writes to the database.
   ===================================================================== */
const fs = require("fs");
const { JSDOM } = require("jsdom");
const ROOT = "C:/project p2p/peer to peer skill share/";

let pass = 0, fail = 0;
const failures = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; failures.push(name); console.log("  FAIL  " + name + (extra ? "   -> " + extra : "")); }
}
function eq(got, want, name) { ok(got === want, name, "got " + JSON.stringify(got) + " want " + JSON.stringify(want)); }
function flush(ms) { return new Promise((r) => setTimeout(r, ms || 10)); }
function err(status, detail) {
  const e = new Error("HTTP " + status); e.status = status;
  if (detail !== undefined) e.detail = detail;
  return e;
}
function section(t) { console.log("\n=== " + t + " ==="); }
function $(a, b) {
  const isDoc = (x) => x && typeof x.getElementById === "function";
  const doc = isDoc(a) ? a : b;
  const id = isDoc(a) ? b : a;
  return doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null;
}
function countOf(calls, name) { return calls.filter((c) => c[0] === name).length; }
function click(win, el) { el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })); }
function setInput(win, el, v) {
  el.value = v;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}

function baseOpp() {
  return {
    id: 22, title: "Frontend Engineer", company_name: "Acme Corp",
    opportunity_type: "job", work_mode: "hybrid", status: "published",
    location: "Pune", description: "Build accessible UI components.",
    responsibilities: "Own the design system", duration: "6 months",
    compensation: "Rs 40k / month", openings: 2,
    deadline: "2030-04-01T00:00:00Z", start_date: "2027-01-01T00:00:00Z",
    min_cgpa: 7.5, eligible_degree: "B.Tech", eligible_branch: "CSE, IT",
    skills: [{ skill_id: 7, skill_name: "Python", required_level: "advanced",
      importance: "critical", skill_type: "required" }],
    my_eligible: true,
    my_match: { match_percentage: 82, skills: { matched: 1, partial: 0, missing: 0 } },
    my_matched_skills: [{ skill_name: "Python" }],
    my_missing_skills: [], my_partial_skills: [],
    my_eligibility_reasons: ["CGPA requirement met"],
        my_eligibility: { cgpa: { required: 7.5, actual: 8.0, passed: true },
                       degree: { required: ["B.Tech"], actual: "B.Tech", passed: true } }
  };
}

function detailsPage(opts) {
  opts = opts || {};
  const calls = [], consoleErrors = [], toasts = [];
  const html = fs.readFileSync(ROOT + "opportunity-details.html", "utf8");
  const js = fs.readFileSync(ROOT + "opportunity-details.js", "utf8");
  const opp = opts.opp === undefined ? baseOpp()
    : (typeof opts.opp === "function" ? opts.opp() : opts.opp);
  const meRows = opts.meRows === undefined ? [] : opts.meRows;
  const mePages = opts.mePages;
  let mePageIdx = -1;
  let applyCalls = 0;
  const api = {
    getUser: () => ({ id: 5, role: opts.role || "student", name: "Stu" }),
    getOpportunity: (id) => {
      calls.push(["detail", id]);
      if (opts.error) {
        const e = typeof opts.error === "function" ? opts.error() : opts.error;
        if (e) return Promise.reject(e);
      }
      return Promise.resolve(Object.assign({ opportunity: opp }, opts.extra || {}));
    },
    getMyApplications: (p) => {
      calls.push(["me", p]);
      if (opts.meError) {
        const e = typeof opts.meError === "function" ? opts.meError() : opts.meError;
        if (e) return Promise.reject(e);
      }
      if (mePages) {
        /* Page counter (the client walks by rows.length, not by page size). */
        mePageIdx = Math.min(mePageIdx + 1, mePages.length - 1);
        const page = mePages[mePageIdx] || [];
        return Promise.resolve({ applications: page, total: 60, limit: 50,
          offset: mePageIdx * 50, has_more: mePageIdx < mePages.length - 1 });
      }
      return Promise.resolve({ applications: meRows.slice(), total: meRows.length, limit: 50,
        offset: 0, has_more: false });
    },
    applyToOpportunity: (id, payload) => {
      calls.push(["apply", id, payload]);
      applyCalls++;
      if (opts.applyError) {
        const e = typeof opts.applyError === "function" ? opts.applyError() : opts.applyError;
        if (e) return Promise.reject(e);
      }
      if (opts.applySlow) {
        return new Promise((res) => setTimeout(() => res({
          application: { id: 900 + applyCalls, opportunity_id: id, status: "applied",
            cover_note: (payload && payload.cover_note) || null,
            applied_at: "2026-09-20T00:00:00Z" }
        }), 30));
      }
      return Promise.resolve({
        application: { id: 900 + applyCalls, opportunity_id: id, status: "applied",
          cover_note: (payload && payload.cover_note) || null,
          applied_at: "2026-09-20T00:00:00Z" }
      });
    }
  };
  const dom = new JSDOM(html, {
    url: "http://localhost/opportunity-details.html" + (opts.search === undefined ? "?id=22" : opts.search),
    runScripts: "outside-only",
    beforeParse(window) {
      window.SkillShareAPI = api;
      window.SkillShareAuth = {
        requireUser: () => opts.authError ? Promise.reject(opts.authError)
          : Promise.resolve({ id: 5, role: opts.role || "student", name: "Stu" }),
        getErrorMessage: (e) => (e && (e.detail || e.message)) || "Something went wrong."
      };
      window.portalToast = (m) => toasts.push(String(m));
      window.addEventListener("error", (e) => consoleErrors.push(String(e.message || e)));
      try { window.eval(js); } catch (e) { consoleErrors.push("eval: " + e.message); }
    }
  });
    return { dom, window: dom.window, doc: dom.window.document, calls, consoleErrors, toasts, api };
}

/* ==================== STAGE 2.9 DOM TESTS ==================== */
async function s_applyIdleState() {
  section("2.9 — apply panel idle state for an eligible student");
  const p = detailsPage({ opp: baseOpp() });
  await flush();
  const { doc, calls } = p;
  eq(countOf(calls, "detail"), 1, "one detail request on load");
  eq(countOf(calls, "me"), 1, "one application list request (already-applied check)");
  eq(countOf(calls, "apply"), 0, "no apply request on load");
  ok(!$("oppApplyWrap", doc).hidden, "apply panel visible for published + student");
  eq($("oppApplyBtn", doc).textContent, "Apply Now", "Apply button initial label");
  ok(!$("oppApplyBtn", doc).disabled, "Apply button enabled in idle state");
  ok(!$("oppCoverNoteWrap", doc).hidden, "cover note shown in idle state");
  p.dom.window.close();
}

async function s_applyFlow() {
  section("2.9 — Apply Now state machine + single POST");
  const p = detailsPage({ opp: baseOpp() });
  await flush();
  const { doc, calls, toasts } = p;
  eq($("oppApplyBtn", doc).textContent, "Apply Now", "label before click");
  click(p.window, $("oppApplyBtn", doc));
  await flush(20);
  eq(countOf(calls, "apply"), 1, "exactly one apply POST on click");
  eq(calls.filter((c) => c[0] === "apply")[0][1], 22, "apply POST targets the real id");
  eq(JSON.stringify(calls.filter((c) => c[0] === "apply")[0][2]), "{}", "cover_note omitted when textarea empty");
  eq($("oppApplyBtn", doc).textContent, "Applied", "button becomes Applied");
  ok($("oppApplyBtn", doc).disabled, "button disabled after success");
  ok(toasts.some((t) => /submitted successfully/i.test(t)), "success toast shown");
  ok(/Application submitted successfully/.test($("oppApplyMsg", doc).textContent), "inline confirmation shown");
  p.dom.window.close();
}

async function s_applyFlowWithCoverNote() {
  section("2.9 — cover note is sent when present");
  const p = detailsPage({ opp: baseOpp() });
  await flush();
  const { doc, calls } = p;
  setInput(p.window, $("oppCoverNote", doc), "Hi, I am a strong fit.");
  eq($("oppCoverCount", doc).textContent, "22 / 2000", "cover note counter updates");
  click(p.window, $("oppApplyBtn", doc));
  await flush(20);
  const ap = calls.find((c) => c[0] === "apply");
  ok(!!ap, "apply POST happened");
  eq(ap && ap[2] && ap[2].cover_note, "Hi, I am a strong fit.", "cover_note sent verbatim");
  p.dom.window.close();
}

async function s_duplicationGuard() {
  section("2.9 — rapid double click produces exactly one POST");
  const p = detailsPage({ opp: baseOpp(), applySlow: true });
  await flush();
  const { doc, calls } = p;
  click(p.window, $("oppApplyBtn", doc));
  click(p.window, $("oppApplyBtn", doc));
  click(p.window, $("oppApplyBtn", doc));
  await flush(40);
  eq(countOf(calls, "apply"), 1, "only one apply POST despite triple-click");
  p.dom.window.close();
}

async function s_alreadyApplied() {
  section("2.9 — refresh keeps Applied from GET /applications/me");
  const p = detailsPage({
    opp: baseOpp(),
    meRows: [{ id: 901, opportunity_id: 22, status: "applied", cover_note: null,
      applied_at: "2026-09-20T00:00:00Z" }]
  });
  await flush();
  const { doc, calls } = p;
  eq(countOf(calls, "detail"), 1, "one detail request");
  eq(countOf(calls, "me"), 1, "one application list request");
  eq(countOf(calls, "apply"), 0, "no apply POST on refresh");
  eq($("oppApplyBtn", doc).textContent, "Applied", "button shows Applied on refresh");
  ok($("oppApplyBtn", doc).disabled, "Applied button stays disabled on refresh");
    ok(/Status: Applied/.test($("oppApplyState", doc).textContent), "status row rendered");
  p.dom.window.close();
}

async function s_alreadyAppliedPaginated() {
  section("2.9 — already-applied found via pagination (not page 1)");
  const p = detailsPage({
    opp: baseOpp(),
    mePages: [
      [{ id: 900, opportunity_id: 99, status: "applied", applied_at: "2026-09-19T00:00:00Z" },
       { id: 901, opportunity_id: 88, status: "applied", applied_at: "2026-09-19T00:00:00Z" }],
      [{ id: 902, opportunity_id: 87, status: "applied", applied_at: "2026-09-19T00:00:00Z" },
       { id: 903, opportunity_id: 22, status: "applied", applied_at: "2026-09-20T00:00:00Z" }]
    ]
  });
  await flush(20);
  const { doc, calls } = p;
  const meCalls = calls.filter((c) => c[0] === "me");
  ok(meCalls.length >= 2, "walked at least 2 pages to find the application");
  eq(countOf(calls, "apply"), 0, "no apply POST when already applied");
  eq($("oppApplyBtn", doc).textContent, "Applied", "button Applied via paginated lookup");
  p.dom.window.close();
}

async function s_duplicate409() {
  section("2.9 — backend 409 duplicate surfaces Applied, no second POST");
  const p = detailsPage({
    opp: baseOpp(),
    applyError: err(409, "You have already applied to this opportunity")
  });
  await flush();
  const { doc, calls } = p;
  click(p.window, $("oppApplyBtn", doc));
  await flush(20);
  eq(countOf(calls, "apply"), 1, "single apply attempt");
  ok(/already applied/.test($("oppApplyMsg", doc).textContent), "friendly duplicate message");
  eq($("oppApplyBtn", doc).textContent, "Applied", "UI becomes Applied on duplicate 409");
  p.dom.window.close();
}

async function s_deadline409() {
  section("2.9 — deadline-passed 409 shows closed copy");
  const p = detailsPage({
    opp: baseOpp(),
    applyError: err(409, "Application deadline has passed")
  });
  await flush();
  const { doc, calls } = p;
  click(p.window, $("oppApplyBtn", doc));
  await flush(20);
  eq(countOf(calls, "apply"), 1, "single apply attempt");
  ok(/Applications for this opportunity are closed/.test($("oppApplyMsg", doc).textContent), "deadline-closed copy");
  p.dom.window.close();
}

async function s_ineligible409() {
  section("2.9 — structured not-eligible 409 shows server reasons, Apply disabled");
  const e = err(409, {
    error: "not_eligible", message: "You are not eligible for this opportunity",
    eligible: false, match_percentage: 40,
    missing_skills: [{ skill_name: "Docker", required_level: "intermediate", importance: "high", skill_type: "required" }],
    eligibility: { cgpa: { required: 7.5, actual: 5.2, passed: false } },
    eligibility_reasons: ["CGPA 5.2 is below the minimum 7.5"],
    disclaimer: "Skill match is a platform indicator."
  });
  const p = detailsPage({ opp: baseOpp(), applyError: e });
  await flush();
  const { doc, calls } = p;
  click(p.window, $("oppApplyBtn", doc));
  await flush(20);
  eq(countOf(calls, "apply"), 1, "single apply attempt");
  ok($("oppApplyBtn", doc).disabled, "Apply disabled after not-eligible");
  ok(/Not currently eligible/.test($("oppApplyState", doc).textContent), "not-eligible status row shown");
  ok(/CGPA 5\.2 is below the minimum 7\.5/.test($("oppApplyMsg", doc).textContent), "server's own reason shown");
  ok(/Docker/.test($("oppMatchLists", doc).textContent), "missing skill surfaced from server payload");
  p.dom.window.close();
}

async function s_ineligibleInitial() {
  section("2.9 — pre-baked not-eligible shows Apply disabled before any click");
  const p = detailsPage({
    opp: Object.assign(baseOpp(), {
      my_eligible: false,
      my_match: { match_percentage: 40 },
      my_missing_skills: [{ skill_name: "Docker", required_level: "intermediate", importance: "high", skill_type: "required" }],
      my_eligibility_reasons: ["CGPA 5.2 is below the minimum 7.5"]
    })
  });
  await flush();
  const { doc, calls } = p;
  eq(countOf(calls, "apply"), 0, "no apply POST before click");
  ok($("oppApplyBtn", doc).disabled, "Apply disabled from start (ineligible)");
    ok(/Not currently eligible/.test($("oppMatchBadges", doc).textContent), "not-eligible badge shown");
  ok(/Docker/.test($("oppMatchLists", doc).textContent), "server missing skills rendered");
  p.dom.window.close();
}

async function s_nonStudentNoApply() {
  section("2.9 — recruiter sees no apply controls");
  const p = detailsPage({ role: "recruiter", opp: Object.assign(baseOpp(), { status: "draft" }) });
  await flush();
  const { doc, calls } = p;
  eq(countOf(calls, "detail"), 1, "one detail request");
  eq(countOf(calls, "me"), 0, "no application lookup for recruiter");
  eq(countOf(calls, "apply"), 0, "no apply for recruiter");
  ok($("oppApplyWrap", doc).hidden, "apply panel hidden from recruiter");
  p.dom.window.close();
}

async function s_closedOpportunity() {
  section("2.9 — closed opportunity shows no apply panel");
  const p = detailsPage({
    opp: Object.assign(baseOpp(), { status: "closed", deadline: "2030-04-01T00:00:00Z" })
  });
  await flush(20);
  const { doc, calls } = p;
    eq(countOf(calls, "me"), 0, "no lookup for a non-published opportunity");
  ok($("oppApplyWrap", doc).hidden, "apply panel hidden for a closed opportunity");
  p.dom.window.close();
}

async function s_deadlinePassedLocal() {
  section("2.9 — past deadline closes Apply locally too");
  const p = detailsPage({ opp: Object.assign(baseOpp(), { deadline: "2000-01-01T00:00:00Z" }) });
  await flush(20);
  const { doc, calls } = p;
  eq(countOf(calls, "apply"), 0, "no apply POST before click");
  ok($("oppApplyBtn", doc).disabled, "Apply disabled when deadline passed");
  ok(/Applications for this opportunity are closed/.test($("oppApplyMsg", doc).textContent), "deadline-closed copy");
  p.dom.window.close();
}

async function s_422ReEnables() {
  section("2.9 — 422 re-enables the button (client-correctable)");
  const p = detailsPage({
    opp: baseOpp(),
    applyError: err(422, "cover_note must be at most 2000 characters")
  });
  await flush();
  const { doc, calls } = p;
  click(p.window, $("oppApplyBtn", doc));
  await flush(20);
  eq(countOf(calls, "apply"), 1, "single apply attempt");
  ok(!$("oppApplyBtn", doc).disabled, "button re-enabled after 422");
  eq($("oppApplyBtn", doc).textContent, "Apply Now", "label reset to Apply Now");
  p.dom.window.close();
}

async function s_safeErrorCopy() {
  section("2.9 — 401 / 403 / 500 map to safe copy, no internals");
  const cases = [
    { e: err(401), label: "401 session-expired copy" },
    { e: err(403), label: "403 permission copy" },
    { e: err(500, '{"traceback": "sqlalchemy.exc.OperationalError: boom"}'), label: "500 hides internals" }
  ];
  for (const c of cases) {
    const p = detailsPage({ opp: baseOpp(), applyError: c.e });
    await flush();
    click(p.window, $("oppApplyBtn", p.doc));
    await flush(20);
    const txt = $("oppApplyMsg", p.doc).textContent;
        ok(!/traceback|sqlalchemy|\{|\}/.test(txt), c.label + " (no internals)");
    ok(txt.length > 0, c.label + " (non-empty)");
    p.dom.window.close();
  }
}

async function s_personalizationRenders() {
  section("2.9 — server match + eligibility render in the match panel");
  const p = detailsPage({ opp: baseOpp() });
  await flush();
  const { doc } = p;
  ok(!$("oppMatchWrap", doc).hidden, "match panel shown");
  ok(/82/.test($("oppMatchPct", doc).textContent), "match percentage rendered");
  ok(/Eligible/.test($("oppMatchBadges", doc).textContent), "eligible badge");
  p.dom.window.close();
}

async function s_noDoubleRequestOnRetry() {
  section("2.9 — retry re-runs detail; no duplicated listeners");
  let n = 0;
  const p = detailsPage({ error: () => (++n === 1 ? err(500) : null) });
  await flush();
  click(p.window, $("oppRetry", p.doc));
  await flush(20);
  eq(countOf(p.calls, "detail"), 2, "retry issues exactly one extra detail request");
  p.dom.window.close();
}

async function s_noInternalsInBody() {
  section("2.9 — detail body never exposes undefined/null/NaN or raw ids");
  const p = detailsPage({ opp: baseOpp() });
  await flush();
  const { doc } = p;
  const bodyText = doc.body.textContent;
  ok(!/undefined/.test(bodyText), "no 'undefined' in rendered output");
  ok(!/null/.test(bodyText), "no 'null' in rendered output");
  ok(!/NaN/.test(bodyText), "no 'NaN' in rendered output");
  ok(!/skill_id/.test(bodyText), "no 'skill_id' label leaked");
  p.dom.window.close();
}

/* ==================== RUNNER ==================== */
async function main() {
  console.log("STAGE 2.9 — jsdom behavioural suite");
  const tests = [
    s_applyIdleState, s_applyFlow, s_applyFlowWithCoverNote, s_duplicationGuard,
    s_alreadyApplied, s_alreadyAppliedPaginated, s_duplicate409, s_deadline409,
    s_ineligible409, s_ineligibleInitial, s_nonStudentNoApply, s_closedOpportunity,
    s_deadlinePassedLocal, s_422ReEnables, s_safeErrorCopy, s_personalizationRenders,
    s_noDoubleRequestOnRetry, s_noInternalsInBody
  ];
  for (const t of tests) {
    try { await t(); }
    catch (e) {
      fail++; failures.push(t.name + " threw");
      console.log("  FAIL  " + t.name + " threw -> " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : String(e)));
    }
  }
  console.log("\n================ SUMMARY ================");
  console.log("PASS: " + pass + "   FAIL: " + fail);
  if (failures.length) console.log("Failures: " + failures.join(" ; "));
  process.exitCode = fail ? 1 : 0;
}
main().catch((e) => { console.error("suite crashed", e); process.exitCode = 2; });







