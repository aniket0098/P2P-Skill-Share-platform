/* =====================================================================
   STAGE 9.3 — recruiter applicant review (jsdom behavioural suite)
   Drives jobs.html + jobs.js against a call-recording stub API that
   mocks the REAL Stage 2.5B endpoints:
     GET   /api/opportunities/{id}/applications   -> { items, total, ... }
     PATCH /api/applications/{id}/status          -> _serialize_applicant
   No network, no database writes, no fabricated production ids.
   Run:  node tests/dom/stage31_recruiter_applicants.js   (from backend-I/)
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
function flush(ms) { return new Promise((r) => setTimeout(r, ms || 8)); }
function err(status, detail) { const e = new Error("HTTP " + status); e.status = status; if (detail) e.detail = detail; return e; }
function section(t) { console.log("\n=== " + t + " ==="); }

/* ---------------- fixtures (shape mirrors _serialize_applicant) -------- */
function appFixture(id, status, extraApp, extraStudent) {
  return {
    application: Object.assign({
      id: id, opportunity_id: 22, status: status,
      cover_note: "Keen frontend builder, 3 shipped projects.",
      applied_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-12T09:00:00Z",
      status_changed_at: null, reviewed_by_user_id: null,
      recruiter_note: null, rejection_reason: null,
      snapshot: {
        snapshot_version: 1, captured_at: "2026-09-10T09:00:00Z",
        opportunity: { opportunity_id: 22, title: "Frontend Engineer" },
        student: { name: "A. Sharma", degree: "B.Tech", branch: "CSE", graduation_year: 2026, cgpa: 8.4, target_job_role: "Frontend developer", skill_count: 5 },
        eligibility: {
          eligible: true, match_percentage: 78.4,
          matched_skills: [], partial_skills: [],
          missing_skills: [{ skill_name: "Testing", skill_id: 9 }],
          eligibility_reasons: []
        }
      }
    }, extraApp || {}),
    opportunity: { id: 22, title: "Frontend Engineer", company_name: "Acme Corp", opportunity_type: "job", work_mode: "hybrid", location: "Pune", status: "published", deadline: null },
    student: Object.assign({
      user_id: 5, name: "A. Sharma", public_id: "stu_ab12cd", avatar_url: null,
      profile: {
        college: "PICT Pune", degree: "B.Tech", branch: "Computer Science",
        graduation_year: 2026, cgpa: 8.4, target_job_role: "Frontend developer",
        preferred_industry: "Product", top_skills: ["React", "JavaScript", "CSS"]
      }
    }, extraStudent || {})
  };
}
function rowsFixture() {
  return [
    { id: 11, title: "Backend Intern", company_name: "Acme Corp", opportunity_type: "internship", work_mode: "remote", status: "draft", location: "Remote", openings: 3, deadline: "2026-03-01T00:00:00Z", skills: [{ skill_name: "Python" }] },
    { id: 22, title: "Frontend Engineer", company_name: "Acme Corp", opportunity_type: "job", work_mode: "hybrid", status: "published", location: "Pune", openings: 1, deadline: null, skills: [{ skill_name: "React" }] },
    { id: 33, title: "Data Analyst", company_name: "Acme Corp", opportunity_type: "placement", work_mode: "onsite", status: "closed", location: "Delhi", openings: 5, deadline: null, skills: [] }
  ];
}
/* ---------------- page harness ---------------- */
function appPage(opts) {
  opts = opts || {};
  const calls = [];
  const toasts = [];
  const consoleErrors = [];
  let rows = rowsFixture();
  let listCalls = 0;
  const html = fs.readFileSync(ROOT + "jobs.html", "utf8");
  const js = fs.readFileSync(ROOT + "jobs.js", "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/jobs.html",
    runScripts: "outside-only",
    beforeParse(window) {
      window.SkillShareAPI = {
        getUser: () => ({ id: 1, role: "recruiter", name: "Rec" }),
        getMyRoleProfile: () => Promise.resolve({ profile: { company_name: "Acme Corp", company_location: "Pune" } }),
        getMyOpportunities: () => Promise.resolve({ opportunities: rows.map((r) => Object.assign({}, r)) }),
        getOpportunity: (id) => {
          const r = rows.find((x) => Number(x.id) === Number(id));
          return r ? Promise.resolve({ opportunity: Object.assign({ description: "d" }, r) }) : Promise.reject(err(404, "Opportunity not found"));
        },
        /* Stage 9.3 — applicant list (owner recruiter only). */
        getOpportunityApplications: (id, params) => {
          listCalls += 1;
          calls.push(["list", id, params]);
          if (opts.listResponses) return opts.listResponses(listCalls);
          if (opts.listError) return Promise.reject(opts.listError);
          const items = opts.items === undefined
            ? [appFixture(501, "applied"), appFixture(502, "reviewing")]
            : opts.items;
          return Promise.resolve({
            items: items.map((x) => JSON.parse(JSON.stringify(x))),
            total: items.length, limit: params && params.limit,
            offset: params && params.offset, has_more: false
          });
        },
        /* Stage 9.3 — status transition. Responds with the updated row
           exactly like PATCH /api/applications/{id}/status does. */
        updateApplicationStatus: (id, payload) => {
          calls.push(["patch", id, payload]);
          if (opts.patchError) return Promise.reject(opts.patchError);
          const base = [appFixture(501, "applied"), appFixture(502, "reviewing")]
            .concat(opts.items || [])
            .find((x) => Number(x.application.id) === Number(id)) || appFixture(Number(id), "applied");
          const app = Object.assign({}, base.application, { status: payload.status });
          if (payload.rejection_reason) app.rejection_reason = payload.rejection_reason;
          if (payload.recruiter_note) app.recruiter_note = payload.recruiter_note;
          app.status_changed_at = "2026-09-13T10:00:00Z";
          return Promise.resolve({ application: app, opportunity: base.opportunity, student: base.student });
        }
      };
      window.SkillShareAuth = {
        requireUser: () => Promise.resolve({ id: 1, role: "recruiter", name: "Rec" }),
        getErrorMessage: (e) => (e && (e.detail || e.message)) || "Something went wrong."
      };
      window.portalToast = (m) => toasts.push(String(m));
      window.addEventListener("error", (e) => consoleErrors.push(String(e.message || e)));
    }
  });
  const win = dom.window;
  win.eval(js);
  return { dom, win, doc: win.document, calls, toasts, consoleErrors };
}
function $(id, doc) { return doc.getElementById(id); }
function click(win, el) { el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })); }
function setValue(win, el, v) { el.value = v; el.dispatchEvent(new win.Event("change", { bubbles: true })); }
function type(win, el, v) { el.value = v; el.dispatchEvent(new win.Event("input", { bubbles: true })); }
function appCards(doc) { return Array.from(doc.querySelectorAll("#appList .jobs-applicant")); }
function openApplicantsFor(doc, win, id) {
  click(win, doc.querySelector('article[data-id="' + id + '"] [data-act="applicants"]'));
}
/* ---------------- tests ---------------- */
async function t_openAndRender() {
  section("APPLICANTS — open panel, real list request, rows rendered");
  const p = appPage();
  await flush();
  const { win, doc, calls } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  ok(!$("applicantsPanel", doc).hidden, "applicants panel becomes visible");
  eq($("appOppTitle", doc).textContent, "Frontend Engineer", "panel header uses the real opportunity title");
  eq(calls.filter((c) => c[0] === "list").length, 1, "exactly one list request");
  const listCall = calls.find((c) => c[0] === "list");
  eq(listCall[1], 22, "list targets the real opportunity id");
  eq(listCall[2].limit, 20, "list uses the bounded page limit");
  eq(appCards(doc).length, 2, "both real applicants rendered");
  ok(appCards(doc)[0].textContent.includes("A. Sharma"), "applicant name rendered");
  ok(appCards(doc)[0].textContent.includes("Applied"), "applied date rendered");
  ok(/Applied/.test(appCards(doc)[0].textContent) && /Reviewing/.test(appCards(doc)[1].textContent), "status badges from the server rows");
  eq(appCards(doc)[0].getAttribute("data-app-id"), "501", "row carries the real application id");
  eq(p.consoleErrors.length, 0, "no console errors");
  p.win.close();
}

async function t_emptyStates() {
  section("APPLICANTS — empty + filter-empty states");
  const p = appPage({ items: [] });
  await flush();
  const { win, doc } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  ok(!$("appListEmpty", doc).hidden, "empty state shown with no applications");
  ok($("appListEmpty", doc).textContent.includes("No applications yet"), "professional empty copy");
  eq(appCards(doc).length, 0, "no fake applicant rows");
  setValue(win, $("appStatusFilter", doc), "applied");
  await flush();
  ok(!$("appFilterEmpty", doc).hidden, "filter-empty state for a filtered zero result");
  p.win.close();
}

async function t_errorAndRetry() {
  section("APPLICANTS — load error explained, retry recovers");
  let n = 0;
  const p = appPage({
    listResponses: () => {
      n += 1;
      return n === 1 ? Promise.reject(err(403, "Only the owner can manage this opportunity")) : Promise.resolve({ items: [appFixture(501, "applied")], total: 1, has_more: false });
    }
  });
  await flush();
  const { win, doc } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  ok(!$("appListError", doc).hidden, "error state shown");
  ok(/permission/i.test($("appListErrorMsg", doc).textContent), "403 shown as friendly permission copy without internals");
  click(win, $("appRetry", doc));
  await flush();
  ok(!$("appList", doc).hidden && appCards(doc).length === 1, "retry recovers to real data");
  eq(p.consoleErrors.length, 0, "no unhandled errors");
  p.win.close();
}
async function t_reviewRender() {
  section("REVIEW — serializer fields only, snapshot vs current, safety");
  const p = appPage();
  await flush();
  const { win, doc } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  click(win, appCards(doc)[0].querySelector("[data-app-review]"));
  await flush();
  ok(!$("appReview", doc).hidden, "review modal opens");
  ok($("appReviewTitle", doc).textContent.includes("A. Sharma"), "title uses the real student name");
  ok(!$("appFactCollege", doc).hidden && $("appFactCollege", doc).textContent.includes("PICT Pune"), "college from the current profile");
  ok(!$("appFactEdu", doc).hidden && $("appFactEdu", doc).textContent.includes("Computer Science"), "branch/degree from the current profile");
  ok(!$("appFactCgpa", doc).hidden && $("appFactCgpa", doc).textContent.includes("8.4"), "CGPA rendered");
  ok(!$("appFactRole", doc).hidden, "target role rendered");
  ok(!$("appFactSkills", doc).hidden && $("appFactSkills", doc).textContent.includes("React"), "skills rendered as tags");
  ok(!$("appFactCover", doc).hidden && $("appFactCover", doc).textContent.includes("Keen frontend"), "cover note rendered");
  ok(!$("appSnapApplied", doc).hidden && $("appSnapApplied", doc).textContent.includes("Met all published requirements"), "snapshot eligibility rendered as historical");
  ok(!$("appSnapMatch", doc).hidden && $("appSnapMatch", doc).textContent.includes("78%"), "snapshot match rendered (rounded, server value)");
  ok(!$("appSnapMissing", doc).hidden && $("appSnapMissing", doc).textContent.includes("Testing"), "snapshot missing skills rendered");
  const text = $("appReview", doc).textContent;
  ok(!/password|Bearer |eyJ/i.test(text), "no secrets/tokens in the review UI");
  ok(text.indexOf("snapshot_version") === -1, "no raw JSON dump");
  ok($("appFactReject", doc).hidden, "rejection reason hidden for a live application");
  eq(p.consoleErrors.length, 0, "no console errors");
  p.win.close();
}

async function t_sparseFieldsHidden() {
  section("REVIEW — absent fields hidden, never faked");
  const sparse = appFixture(503, "applied", { snapshot: null }, null);
  sparse.student.profile = { college: null, degree: null, branch: null, graduation_year: null, cgpa: null, target_job_role: null, preferred_industry: null, top_skills: null };
  const p = appPage({ items: [sparse] });
  await flush();
  const { win, doc } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  click(win, appCards(doc)[0].querySelector("[data-app-review]"));
  await flush();
  ok($("appFactCollege", doc).hidden, "missing college hidden");
  ok($("appFactCgpa", doc).hidden, "missing CGPA hidden");
  ok($("appFactSkills", doc).hidden, "missing skills hidden");
  ok(!$("appSnapEmpty", doc).hidden, "'snapshot not available' shown when snapshot is null");
  ok($("appSnapWrap", doc).hidden, "no invented snapshot numbers");
  p.win.close();
}

async function t_transitionOptions() {
  section("TRANSITIONS — select mirrors the server state machine");
  const p = appPage();
  await flush();
  const { win, doc } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  function openReviewOf(i) {
    click(win, appCards(doc)[i].querySelector("[data-app-review]"));
    return Array.from($("appStatusSelect", doc).options).map((o) => o.value);
  }
  eq(openReviewOf(0).join(","), "reviewing,rejected", "applied -> reviewing|rejected only");
  eq(openReviewOf(1).join(","), "shortlisted,rejected", "reviewing -> shortlisted|rejected only");
  const p2 = appPage({ items: [appFixture(504, "rejected", { rejection_reason: "No openings left" })] });
  await flush();
  openApplicantsFor(p2.doc, p2.win, 22);
  await flush();
  click(p2.win, appCards(p2.doc)[0].querySelector("[data-app-review]"));
  await flush();
  const opts2 = Array.from($("appStatusSelect", p2.doc).options).map((o) => o.value);
  eq(opts2.join(","), "", "terminal rejected offers no transitions");
  ok($("appStatusSelect", p2.doc).disabled, "transition select disabled on a terminal status");
  ok(!$("appFactReject", p2.doc).hidden && $("appFactReject", p2.doc).textContent.includes("No openings left"), "stored rejection reason displayed");
  p.win.close();
  p2.win.close();
}
async function t_rejectRequiresReason() {
  section("REJECT — reason required locally before any request");
  const p = appPage();
  await flush();
  const { win, doc, calls } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  click(win, appCards(doc)[0].querySelector("[data-app-review]"));
  await flush();
  ok(!$("appReasonWrap", doc).hidden, "rejection reason field revealed for a rejectable application");
  setValue(win, $("appStatusSelect", doc), "rejected");
  click(win, $("appSaveStatus", doc));
  await flush();
  eq(calls.filter((c) => c[0] === "patch").length, 0, "no PATCH without a reason");
  ok(!$("appReviewMsg", doc).hidden && $("appReviewMsg", doc).textContent.includes("rejection reason is required"), "local explanation shown");
  type(win, $("appReasonInput", doc), "Skills gap in required stack");
  click(win, $("appSaveStatus", doc));
  await flush();
  const patch = calls.find((c) => c[0] === "patch");
  ok(patch, "PATCH sent once the reason exists");
  eq(patch[1], 501, "PATCH targets the real application id");
  eq(patch[2].status, "rejected", "payload moves to rejected");
  eq(patch[2].rejection_reason, "Skills gap in required stack", "payload carries the reason");
  ok($("appReview", doc).textContent.includes("Rejected"), "badge reflects the server response");
  ok(p.toasts.some((t) => /Rejected/.test(t)), "success toast uses the server status");
  eq(p.consoleErrors.length, 0, "no console errors");
  p.win.close();
}

async function t_noteSemantics() {
  section("NOTE — omitted when untouched, sent only when changed");
  const withNote = appFixture(505, "applied", { recruiter_note: "Looks promising" });
  const p = appPage({ items: [withNote] });
  await flush();
  const { win, doc, calls } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  click(win, appCards(doc)[0].querySelector("[data-app-review]"));
  await flush();
  eq($("appNoteInput", doc).value, "Looks promising", "existing note prefilled");
  setValue(win, $("appStatusSelect", doc), "reviewing");
  click(win, $("appSaveStatus", doc));
  await flush();
  const patch = calls.find((c) => c[0] === "patch");
  ok(!("recruiter_note" in patch[2]), "untouched note is NOT re-sent (server preserves it)");
  type(win, $("appNoteInput", doc), "Strong React portfolio");
  click(win, $("appSaveStatus", doc));
  await flush();
  const patches = calls.filter((c) => c[0] === "patch");
  eq(patches.length, 2, "second save issues its own PATCH");
  eq(patches[1][2].recruiter_note, "Strong React portfolio", "changed note is sent");
  p.win.close();
}
async function t_conflict409() {
  section("CONCURRENCY — 409 refreshes from the server, no fake success");
  const fresh = appFixture(501, "reviewing");
  const p = appPage({
    patchError: err(409, "Application status changed; reload and retry"),
    listResponses: (n) => n <= 1
      ? Promise.resolve({ items: [appFixture(501, "applied")], total: 1, has_more: false })
      : Promise.resolve({ items: [fresh], total: 1, has_more: false })
  });
  await flush();
  const { win, doc, calls } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  click(win, appCards(doc)[0].querySelector("[data-app-review]"));
  await flush();
  setValue(win, $("appStatusSelect", doc), "reviewing");
  click(win, $("appSaveStatus", doc));
  await flush(20);
  ok(calls.filter((c) => c[0] === "list").length >= 2, "list refetched after the 409");
  ok($("appReviewStatusBadge", doc).textContent.includes("Reviewing"), "review re-rendered from the server row");
  ok($("appReviewMsg", doc).textContent.includes("updated elsewhere"), "conflict explained, never faked as success");
  ok(!$("appSaveStatus", doc).disabled, "controls restored after refresh");
  ok(!p.toasts.some((t) => /moved to Reviewing/.test(t)), "no success toast for the failed move");
  p.win.close();
}

async function t_doubleSubmitGuard() {
  section("CONCURRENCY — double click sends exactly one PATCH");
  const p = appPage();
  const origUpdate = p.win.SkillShareAPI.updateApplicationStatus;
  let release;
  const gate = new Promise((res) => { release = res; });
  p.win.SkillShareAPI.updateApplicationStatus = (id, payload) => { origUpdate(id, payload); return gate; };
  await flush();
  const { win, doc, calls } = p;
  openApplicantsFor(doc, win, 22);
  await flush();
  click(win, appCards(doc)[0].querySelector("[data-app-review]"));
  await flush();
  setValue(win, $("appStatusSelect", doc), "reviewing");
  click(win, $("appSaveStatus", doc));
  click(win, $("appSaveStatus", doc));
  click(win, $("appSaveStatus", doc));
  await flush();
  eq(calls.filter((c) => c[0] === "patch").length, 1, "busy guard blocks duplicate submissions");
  ok($("appSaveStatus", doc).disabled, "save button disabled while pending");
  release(true);
  await flush(20);
  ok(!$("appSaveStatus", doc).disabled, "controls restored after completion");
  p.win.close();
}

async function t_paginationAndDraft() {
  section("PAGINATION/NAV — server params honored; drafts expose no applicants");
  const many = [];
  for (let i = 600; i < 622; i++) many.push(appFixture(i, "applied"));
  const pages = [many.slice(0, 20), many.slice(20)];
  let n = 0;
  const p = appPage({
    listResponses: () => {
      n += 1;
      const items = pages[n - 1] || [];
      return Promise.resolve({ items, total: 22, has_more: n < 2 });
    }
  });
  await flush();
  const { win, doc, calls } = p;
  ok(!doc.querySelector('article[data-id="11"] [data-act="applicants"]'), "draft card has no Applicants entry");
  openApplicantsFor(doc, win, 22);
  await flush();
  eq(appCards(doc).length, 20, "first page rendered");
  ok(!$("appLoadMoreWrap", doc).hidden, "load-more offered while has_more");
  click(win, $("appLoadMore", doc));
  await flush();
  const second = calls.filter((c) => c[0] === "list")[1];
  eq(second[2].offset, 20, "load-more resumes at the server offset");
  eq(appCards(doc).length, 22, "pages concatenated without duplicates");
  ok($("appLoadMoreWrap", doc).hidden, "load-more hidden when has_more is false");
  p.win.close();
}

async function main() {
  console.log("STAGE 9.3 — recruiter applicant review (jsdom)");
  const tests = [
    t_openAndRender, t_emptyStates, t_errorAndRetry,
    t_reviewRender, t_sparseFieldsHidden, t_transitionOptions,
    t_rejectRequiresReason, t_noteSemantics, t_conflict409,
    t_doubleSubmitGuard, t_paginationAndDraft
  ];
  for (const t of tests) {
    try { await t(); }
    catch (e) { fail++; failures.push(t.name + " threw"); console.log("  FAIL  " + t.name + " threw -> " + e.stack.split("\n").slice(0, 3).join(" | ")); }
  }
  console.log("\n================ SUMMARY ================");
  console.log("PASS: " + pass + "   FAIL: " + fail);
  if (failures.length) console.log("Failures: " + failures.join(" ; "));
  process.exit(fail ? 1 : 0);
}
main();
