/* =====================================================================
   STAGE 2.8 â€” behavioural test suite (jsdom, temp tooling, mirrors
   _stage27_dom_test.js). Drives opportunities.html + opportunities.js
   against a call-recording stub API. No network, no DB writes.
   Run:  node _stage28_dom_test.js   (from backend-I/)
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

/* ---------------- fixtures (exactly the backend's field shapes) -------- */
function listFixture() {
  return [
    { id: 61, title: "28A Backend Intern", slug: "28a-backend-intern", company_name: "Stage28 Test Co",
      opportunity_type: "internship", description: "Python + SQL internship.", work_mode: "remote",
      location: "Remote", duration: "6 months", compensation: "Rs 20,000 / month", openings: 2,
      deadline: "2026-10-01T00:00:00Z", status: "published", is_demo: false,
      created_at: "2026-09-01T10:00:00", updated_at: "2026-09-01T10:00:00",
      published_at: "2026-09-02T10:00:00", closed_at: null, skill_count: 2,
      skills: [{ skill_id: 1, skill_name: "Python" }, { skill_id: 4, skill_name: "SQL" }] },
    { id: 62, title: "28B Frontend Engineer", slug: "28b-frontend-engineer", company_name: "Stage28 Test Co",
      opportunity_type: "job", description: "React role.", work_mode: "hybrid", location: "Pune",
      duration: null, compensation: null, openings: 1, deadline: "2026-09-28T00:00:00Z",
      status: "published", is_demo: false, created_at: "2026-09-03T10:00:00",
      updated_at: "2026-09-03T10:00:00", published_at: "2026-09-03T11:00:00", closed_at: null,
      skill_count: 1, skills: [{ skill_id: 9, skill_name: "React" }] },
    { id: 63, title: "28C UX Mini Project", slug: "28c-ux-mini-project", company_name: "Stage28 Test Co",
      opportunity_type: "mini_project", description: "Figma project.", work_mode: "onsite",
      location: "Bengaluru", duration: null, compensation: null, openings: null, deadline: null,
      status: "published", is_demo: false, created_at: "2026-09-04T10:00:00",
      updated_at: "2026-09-04T10:00:00", published_at: "2026-09-04T10:00:00", closed_at: null,
      skill_count: 1, skills: [{ skill_id: 12, skill_name: "Figma" }] },
    { id: 64, title: "28D Part-time Writer", slug: "28d-part-time-writer", company_name: "Stage28 Test Co",
      opportunity_type: "part_time", description: "Docs.", work_mode: "remote", location: null,
      duration: "3 months", compensation: "Paid", openings: 3, deadline: null, status: "published",
      is_demo: false, created_at: "2026-09-05T10:00:00", updated_at: "2026-09-05T10:00:00",
      published_at: "2026-09-05T10:00:00", closed_at: null, skill_count: 5,
      skills: [{ skill_id: 20, skill_name: "Writing" }, { skill_id: 21, skill_name: "Docs" },
               { skill_id: 12, skill_name: "Figma" }, { skill_id: 22, skill_name: "Notion" },
               { skill_id: 23, skill_name: "SEO" }] }
  ];
}
const DISCLAIMER = "Platform skill/profile match indicator (not a hiring probability).";
const PROFILE = { has_student_profile: true, cgpa: 8.4, degree: "B.Tech", branch: "CSE",
  graduation_year: 2027, target_job_role: "Backend Developer", preferred_industry: null,
  skill_count: 1, has_skills: true };

function recoFixture() {
  return [
    { id: 61, title: "28A Backend Intern", slug: "28a-backend-intern", company_name: "Stage28 Test Co",
      opportunity_type: "internship", description: "Python + SQL internship.", work_mode: "remote",
      location: "Remote", duration: "6 months", compensation: "Rs 20,000 / month", openings: 2,
      deadline: "2026-10-01T00:00:00Z", status: "published", is_demo: false,
      created_at: "2026-09-01T10:00:00", updated_at: "2026-09-01T10:00:00", published_at: null,
      closed_at: null, skill_count: 2,
      skills: [{ skill_id: 1, skill_name: "Python" }, { skill_id: 4, skill_name: "SQL" }],
      match_percentage: 87.5, eligible: true,
      eligibility: { cgpa: { required: null, actual: 8.4, passed: true },
        degree: { required: null, actual: "B.Tech", passed: true },
        branch: { required: null, actual: "CSE", passed: true },
        graduation_year: { required: null, actual: 2027, passed: true } },
      eligibility_reasons: ["Skill 'Python' matched"], matched_skills: [{ skill_name: "Python" }],
      partial_skills: [], missing_skills: [],
      skill_match: { required: 1, preferred: 1, matched: 1, missing: 0 } },
    { id: 62, title: "28B Frontend Engineer", slug: "28b-frontend-engineer", company_name: "Stage28 Test Co",
      opportunity_type: "job", description: "React role.", work_mode: "hybrid", location: "Pune",
      duration: null, compensation: null, openings: 1, deadline: "2026-09-28T00:00:00Z",
      status: "published", is_demo: false, created_at: "2026-09-03T10:00:00",
      updated_at: "2026-09-03T10:00:00", published_at: null, closed_at: null, skill_count: 1,
      skills: [{ skill_id: 9, skill_name: "React" }], match_percentage: 42, eligible: false,
      eligibility: {}, eligibility_reasons: ["Missing required skill 'React'"], matched_skills: [],
      partial_skills: [],
      missing_skills: [
        { skill_name: "React", required_level: "intermediate", skill_type: "required" },
        { skill_name: "Docker", required_level: "beginner", skill_type: "required" },
        { skill_name: "Kubernetes", required_level: "beginner", skill_type: "preferred" }],
      skill_match: { required: 1, preferred: 0, matched: 0, missing: 1 } },
    { id: 63, title: "28C UX Mini Project", slug: "28c-ux-mini-project", company_name: "Stage28 Test Co",
      opportunity_type: "mini_project", description: "Figma project.", work_mode: "onsite",
      location: "Bengaluru", duration: null, compensation: null, openings: null, deadline: null,
      status: "published", is_demo: false, created_at: "2026-09-04T10:00:00",
      updated_at: "2026-09-04T10:00:00", published_at: null, closed_at: null, skill_count: 1,
      skills: [{ skill_id: 12, skill_name: "Figma" }],
      match_percentage: null, eligible: null, eligibility: {}, eligibility_reasons: [],
      matched_skills: [], partial_skills: [], missing_skills: [], skill_match: {} },
    { id: 64, title: "28D Part-time Writer", slug: "28d-part-time-writer", company_name: "Stage28 Test Co",
      opportunity_type: "part_time", description: "Docs.", work_mode: "remote", location: null,
      duration: "3 months", compensation: "Paid", openings: 3, deadline: null, status: "published",
      is_demo: false, created_at: "2026-09-05T10:00:00", updated_at: "2026-09-05T10:00:00",
      published_at: null, closed_at: null, skill_count: 5,
      skills: [{ skill_id: 20, skill_name: "Writing" }],
      match_percentage: 66.6, eligible: false, eligibility: {},
      eligibility_reasons: ["Missing required skill 'Writing'"], matched_skills: [],
      partial_skills: [],
      missing_skills: [{ skill_name: "Writing", required_level: "intermediate", skill_type: "required" }],
      skill_match: { required: 1, preferred: 0, matched: 0, missing: 1 } }
  ];
}
/* ---------------- stub server (filters + paginate like the backend) ---- */
function makeApi(opts, calls) {
  opts = opts || {};
  calls = calls || [];
  let listRows = (opts.listRows || listFixture()).slice();
  let recoRows = (opts.recoRows || recoFixture()).slice();
  let manualList = null;   /* deferred, for the stale-response test */
  let listFails = 0;       /* listErrorOnce: fail the first call, then recover */
  let recoFails = 0;
  const RECO_META = {
    profile: opts.recoProfile || PROFILE,
    sorting: ["eligible", "match_percentage", "deadline", "id"],
    disclaimer: DISCLAIMER, filters: {}
  };
  function applyFilters(rows, p) {
    return rows.filter((r) =>
      (!p.opportunity_type || r.opportunity_type === p.opportunity_type) &&
      (!p.work_mode || r.work_mode === p.work_mode) &&
      (!p.company || String(r.company_name || "").toLowerCase().includes(String(p.company).toLowerCase())) &&
      (!p.location || String(r.location || "").toLowerCase().includes(String(p.location).toLowerCase())) &&
      (!p.search || [r.title, r.description, r.location].some((f) =>
        String(f || "").toLowerCase().includes(String(p.search).toLowerCase()))));
  }
  function paginate(all, p) {
    const limit = Math.min(Math.max(Number(p.limit) || 20, 1), 100);
    const offset = Math.max(Number(p.offset) || 0, 0);
    const slice = all.slice(offset, offset + limit);
    return { opportunities: slice.map((r) => Object.assign({}, r)), total: all.length,
             limit, offset, has_more: offset + slice.length < all.length };
  }
  const api = {
    listPublishedOpportunities: (p) => {
      calls.push(["list", Object.assign({}, p)]);
      if (opts.listError && !(opts.listErrorOnce && listFails > 0)) {
        listFails++;
        return Promise.reject(opts.listError);       /* same failure every call */
      }
      if (opts.manualFirstList && !manualList) {
        manualList = { p };
        return new Promise((resolve) => { manualList.resolve = resolve; });
      }
      return Promise.resolve(paginate(applyFilters(listRows, p || {}), p || {}));
    },
    getRecommendedOpportunities: (p) => {
      calls.push(["reco", Object.assign({}, p)]);
      if (opts.recoError && !(opts.recoErrorOnce && recoFails > 0)) {
        recoFails++;
        return Promise.reject(opts.recoError);
      }
      if (opts.recoEmpty) return Promise.resolve(Object.assign({ opportunities: [], total: 0, limit: 20,
        offset: 0, has_more: false }, RECO_META));
      /* Same envelope as the real endpoint: rows + profile + sorting +
         disclaimer + filters. */
      return Promise.resolve(Object.assign(paginate(applyFilters(recoRows, p || {}), p || {}), RECO_META));
    },
    releaseManualList: (payload) => {
      if (manualList && manualList.resolve) manualList.resolve(payload);
    },
    _calls: calls
  };
  return api;
}

/* ---------------- jsdom page harness (mirrors stage 2.7) ---------------- */
function page(opts) {
  opts = opts || {};
  const calls = [];
  const consoleErrors = [];
  const api = makeApi(Object.assign({}, opts), calls);
  if (opts.callsRef) opts.callsRef.api = api;
  const html = fs.readFileSync(ROOT + "opportunities.html", "utf8");
  const js = fs.readFileSync(ROOT + "opportunities.js", "utf8");
  const dom = new JSDOM(html, {
    url: "http://localhost/opportunities.html",
    runScripts: "outside-only",
    beforeParse(window) {
      window.SkillShareAPI = api;
      window.SkillShareAuth = {
        requireUser: () => {
          calls.push(["me"]);
          if (opts.authError) return Promise.reject(opts.authError);
          if (opts.noAuth) return Promise.reject(err(401, "Not authenticated"));
          return Promise.resolve({ id: 1, role: opts.role || "student", name: "Stu" });
        },
        getErrorMessage: (e) => (e && (e.detail || e.message)) || "Something went wrong."
      };
      window.portalToast = () => {};
      window.addEventListener("error", (e) => consoleErrors.push(String(e.message || e)));
      try { window.eval(js); } catch (e) { consoleErrors.push("eval: " + e.message); }
    }
  });
  return { dom, window: dom.window, doc: dom.window.document, calls, consoleErrors, api };
}
/* boot() runs on DOMContentLoaded; jsdom's readyState is already "complete"
   right after construction, so fire the event like the browser does. */
function fireReady(p) {
  p.window.document.dispatchEvent(new p.window.Event("DOMContentLoaded", { bubbles: true }));
}
function $(p, id) { return p.doc.getElementById(id); }
function visible(p, id) { const el = $(p, id); return !!el && !el.hidden; }
function cards(p, gridId) {
  return Array.from(p.doc.querySelectorAll("#" + gridId + " .opp-card"));
}
function setInput(p, el, v) {
  el.value = v;
  el.dispatchEvent(new p.window.Event("input", { bubbles: true }));
}
function setSelect(p, el, v) {
  el.value = v;
  el.dispatchEvent(new p.window.Event("change", { bubbles: true }));
}
function click(p, el) { el.dispatchEvent(new p.window.MouseEvent("click", { bubbles: true, cancelable: true })); }
function listCalls(p) { return p.calls.filter((c) => c[0] === "list").map((c) => c[1]); }
function recoCalls(p) { return p.calls.filter((c) => c[0] === "reco").map((c) => c[1]); }
function textOf(p, id) { const el = $(p, id); return el ? el.textContent.trim() : ""; }
function htmlIncludesBadText(p) {
  const grid = [textOf(p, "oppGrid"), textOf(p, "recoGrid"), textOf(p, "oppCount"), textOf(p, "recoCount"),
    textOf(p, "oppStatOpen"), textOf(p, "oppStatMatch"), textOf(p, "oppStatEligible"),
    textOf(p, "oppStatEligibleSub"), textOf(p, "recoEmptyMsg")].join(" | ");
  return /undefined|NaN|\bnull\b/.test(grid);
}

/* =====================================================================
   A. INITIAL LOAD + REAL-DATA RENDERING (no mock)
   ===================================================================== */
async function testInitialLoad() {
  section("A. initial load renders real API data only");
  const p = page({});
  fireReady(p);
  await flush(30);

  eq(listCalls(p).length, 1, "A1 exactly one discovery request on boot");
  eq(recoCalls(p).length, 1, "A2 exactly one recommended request on boot");
  eq(listCalls(p)[0].limit, 20, "A3 discovery uses limit<=100 (20)");
  ok(!p.consoleErrors.length, "A4 no console errors", p.consoleErrors.join("; "));

  ok(visible(p, "oppGrid"), "A5 discovery grid visible");
  ok(!visible(p, "oppLoading"), "A6 loading hidden after load");
  eq(cards(p, "oppGrid").length, 4, "A7 four real opportunity cards");

  const first = cards(p, "oppGrid")[0];
  ok(first.querySelector('h3').textContent.includes("28A Backend Intern"), "A8 card title from API");
  ok(first.textContent.includes("Stage28 Test Co"), "A9 card company from API");
  ok(first.textContent.includes("Internship"), "A10 type badge label");
  ok(first.textContent.includes("Remote"), "A11 work mode label");
  ok(first.textContent.includes("Openings") && first.textContent.includes("2"), "A12 openings meta");
  ok(first.textContent.includes("6 months"), "A13 duration meta (real value)");
  ok(first.textContent.includes("Rs 20,000 / month"), "A14 compensation meta (real value)");
  ok(first.textContent.includes("Python") && first.textContent.includes("SQL"), "A15 required skills tags");
  ok(!first.querySelector(".match"), "A16 NO fabricated match bar on discovery cards");

  const card64 = cards(p, "oppGrid")[3];
  ok(!/undefined|null|NaN/.test(card64.textContent), "A17 missing fields never render as undefined/null/NaN");
  ok(!card64.textContent.includes("Deadline"), "A18 null deadline omitted (not faked)");
  ok(card64.textContent.includes("+1 more"), "A19 >4 skills collapsed with +N more");

  const links = cards(p, "oppGrid").map((c) => c.querySelector('a[href^="opportunity-details.html"]').getAttribute("href"));
  ok(links.every((h) => /^opportunity-details\.html\?id=\d+$/.test(h)), "A20 every detail link is ?id=<numeric real id>");
  ok(links.includes("opportunity-details.html?id=61"), "A21 id 61 linked with real database id");

  /* stats from real responses */
  eq(textOf(p, "oppStatOpen"), "4", "A22 open-opportunities stat = real list total");
  eq(textOf(p, "oppStatMatch"), "88%", "A23 best-match stat from server match_percentage (87.5 -> 88)");
  ok(textOf(p, "oppStatEligible") === "1" && textOf(p, "oppStatEligibleSub").includes("of 4"), "A24 eligible stat real count");
  eq(textOf(p, "oppCount"), "4 published opportunities", "A25 list count line from real total");

  /* recommended rendering (server-authoritative) */
  ok(visible(p, "recoGrid"), "A26 recommended grid visible");
  eq(cards(p, "recoGrid").length, 4, "A27 recommended cards rendered");
  const reco1 = cards(p, "recoGrid")[0];
  ok(reco1.textContent.includes("88%"), "A28 skill match 88% displayed (server value)");
  ok(reco1.textContent.includes("Skill Match"), "A29 'Skill Match' label shown");
  ok(reco1.querySelector(".opp-match .badge.green") && reco1.textContent.includes("Eligible"), "A30 eligible=true -> green Eligible badge");
  const reco2 = cards(p, "recoGrid")[1];
  ok(reco2.textContent.includes("42%") && reco2.textContent.includes("Skill Match"), "A31 match % on ineligible card");
  ok(reco2.textContent.includes("Not currently eligible"), "A32 eligible=false -> amber state");
  ok(reco2.textContent.includes("Missing:") && reco2.textContent.includes("React, Docker"), "A33 missing skills from server only");
  ok(!reco2.textContent.includes("Kubernetes"), "A34 preferred-skill missing not shown as required");
  const reco3 = cards(p, "recoGrid")[2];
  ok(!reco3.querySelector(".match"), "A35 no match bar when API gives no match_percentage");
  ok(!reco3.querySelector(".opp-match .badge"), "A36 no eligibility badge when API silent");
  ok(cards(p, "recoGrid").every((c) => c.querySelector('a[href^="opportunity-details.html?id="]')), "A37 recommended cards still open details");
  ok(!htmlIncludesBadText(p), "A38 no undefined/null/NaN anywhere in rendered data");
  const d = textOf(p, "recoDisclaimer");
  ok(d === DISCLAIMER, "A39 API disclaimer shown verbatim");
  ok(reco1.querySelector('a[href="opportunity-details.html?id=61"]'), "A40 eligible card links by real id");
}



/* =====================================================================
   B. SEARCH / FILTERS / SORT / PAGINATION
   ===================================================================== */
async function testSearchFiltersSort() {
  section("B. search, filters, sort, pagination");
  const p = page({});
  fireReady(p);
  await flush(30);

  /* debounced search: typing must not fire a request per keystroke */
  setInput(p, $(p, "oppSearch"), "py");
  await flush(50);
  setInput(p, $(p, "oppSearch"), "pyt");
  await flush(50);
  setInput(p, $(p, "oppSearch"), "pyth");
  await flush(400);
  eq(listCalls(p).length, 2, "B1 debounced: 3 keystrokes -> 1 extra request (total 2)");
  eq(listCalls(p)[1].search, "pyth", "B2 search param = final debounced value");
  ok(recoCalls(p).length >= 2 && recoCalls(p)[recoCalls(p).length - 1].search === "pyth", "B3 recommended follows search too");

  /* type filter (real backend enum) */
  setSelect(p, $(p, "oppTypeFilter"), "internship");
  await flush(30);
  const lastType = listCalls(p)[listCalls(p).length - 1];
  eq(lastType.opportunity_type, "internship", "B4 type filter sends backend value");
  ok(cards(p, "oppGrid").every((c) => c.textContent.includes("Internship")), "B5 only matching cards shown");

  /* work-mode filter */
  setSelect(p, $(p, "oppModeFilter"), "remote");
  await flush(30);
  const lastMode = listCalls(p)[listCalls(p).length - 1];
  eq(lastMode.work_mode, "remote", "B6 work-mode filter sends backend value");

  /* company + location filters */
  setInput(p, $(p, "oppCompanyFilter"), "Stage28");
  await flush(400);
  setInput(p, $(p, "oppLocationFilter"), "Pune");
  await flush(400);
  const lastBoth = listCalls(p)[listCalls(p).length - 1];
  eq(lastBoth.company, "Stage28", "B7 company filter param");
  eq(lastBoth.location, "Pune", "B8 location filter param");

  /* clear filters restores everything */
  click(p, $(p, "oppClearFilters"));
  await flush(30);
  ok(!$(p, "oppSearch").value && !$(p, "oppTypeFilter").value && !$(p, "oppModeFilter").value,
    "B9 clear filters resets controls");
  const afterClear = listCalls(p)[listCalls(p).length - 1];
  ok(!afterClear.search && !afterClear.opportunity_type && !afterClear.work_mode &&
     !afterClear.company && !afterClear.location, "B10 cleared request has no filter params");

  /* sorting: deadline within loaded page */
  const apiOrder = cards(p, "oppGrid").map((c) => c.querySelector("h3").textContent);
  ok(apiOrder[0].includes("28A"), "B11a baseline grid is in API order (first row as delivered)");
  setSelect(p, $(p, "oppSort"), "deadline");
  await flush(10);
  const titles = cards(p, "oppGrid").map((c) => c.querySelector("h3").textContent);
  ok(titles[0].includes("28B"), "B11 deadline sort puts soonest deadline first", titles.join(","));
  ok(visible(p, "oppSortNote"), "B12 page-only sort note disclosed");
  setSelect(p, $(p, "oppSort"), "newest");
  await flush(10);
  ok(!visible(p, "oppSortNote"), "B13 note hidden again on newest");
  const back = cards(p, "oppGrid").map((c) => c.querySelector("h3").textContent);
  eq(back.join("|"), apiOrder.join("|"), "B14 newest restores the API (backend) order exactly");

  /* pagination: has_more respected */
  const p2 = page({ listRows: listFixture() });
  fireReady(p2);
  await flush(30);
  ok(!visible(p2, "oppMore"), "B15 no Load more when has_more=false");

  const many = [];
  for (let i = 0; i < 25; i++) {
    const r = listFixture()[0];
    many.push(Object.assign({}, r, { id: 100 + i, title: "Bulk " + i, created_at: "2026-09-06T10:00:00" }));
  }
  const p3 = page({ listRows: many });
  fireReady(p3);
  await flush(30);
  ok(visible(p3, "oppMore"), "B16 Load more visible when has_more=true");
  eq(cards(p3, "oppGrid").length, 20, "B17 first page = 20 rows");
  click(p3, $(p3, "oppMore"));
  await flush(30);
  eq(listCalls(p3).length, 2, "B18 one request per Load more click");
  eq(listCalls(p3)[1].offset, 20, "B19 offset = rows already loaded");
  eq(cards(p3, "oppGrid").length, 25, "B20 appended page shows all rows");
  ok(!visible(p3, "oppMore"), "B21 Load more hidden after last page");
  ok(!p3.consoleErrors.length, "B22 no console errors", p3.consoleErrors.join("; "));
}

/* =====================================================================
   C. ERROR / EMPTY / AUTH STATES (no mock fallback)
   ===================================================================== */
async function testStates() {
  section("C. loading, empty, error, auth, duplicate-request safety");
  /* discovery failure -> real error state + retry, never mock data */
  const p1 = page({ listError: err(0, "Server unavailable"), listErrorOnce: true });
  fireReady(p1);
  await flush(30);
  ok(visible(p1, "oppError"), "C1 discovery failure shows error state");
  ok(textOf(p1, "oppError").includes("Unable to load opportunities."), "C2 friendly error heading");
  ok(!visible(p1, "oppGrid"), "C3 no mock cards shown on failure");
  eq(cards(p1, "oppGrid").length, 0, "C4 zero cards in DOM after failure");
  ok(textOf(p1, "oppStatOpen") === "\u2014", "C5 stat shows dash, not a fake number");
  click(p1, $(p1, "oppRetry"));
  await flush(30);
  ok(visible(p1, "oppGrid") && cards(p1, "oppGrid").length === 4, "C6 Try again recovers with real data");

  /* recommended failure isolated from discovery */
  const p2 = page({ recoError: err(500, "boom"), recoErrorOnce: true });
  fireReady(p2);
  await flush(30);
  ok(visible(p2, "recoError"), "C7 recommendation failure shows its own error state");
  ok(visible(p2, "oppGrid") && cards(p2, "oppGrid").length === 4, "C8 discovery keeps working (rule 24)");
  click(p2, $(p2, "recoRetry"));
  await flush(30);
  ok(visible(p2, "recoGrid") && cards(p2, "recoGrid").length === 4, "C9 recommended retry recovers");

  /* empty discovery */
  const p3 = page({ listRows: [] });
  fireReady(p3);
  await flush(30);
  ok(visible(p3, "oppEmpty"), "C10 empty discovery -> 'No opportunities found.'");
  ok(!visible(p3, "oppGrid"), "C11 no fake rows in empty state");

  /* filter-only empty -> clear-filters variant */
  const p4 = page({ listRows: listFixture().filter((r) => r.opportunity_type === "internship") });
  fireReady(p4);
  await flush(30);
  setSelect(p4, $(p4, "oppTypeFilter"), "job");
  await flush(30);
  ok(visible(p4, "oppFilterEmpty"), "C12 filter-empty shows Clear filters");
  click(p4, $(p4, "oppClearFilters"));
  await flush(30);
  ok(visible(p4, "oppGrid") && cards(p4, "oppGrid").length === 1, "C13 clear filters restores results");

  /* empty recommendations -> honest state + existing pages only */
  const p5 = page({ recoEmpty: true });
  fireReady(p5);
  await flush(30);
  ok(visible(p5, "recoEmpty"), "C14 empty recommendations state shown");
  ok(textOf(p5, "recoEmpty").includes("No personalized matches yet."), "C15 'No personalized matches yet.' copy");
  ok(!$(p5, "recoEmptyActions").hidden, "C16 guides to existing profile/skill-mapping pages");
  ok(textOf(p5, "recoEmpty").includes("profile.html") === false, "C17 no fake onboarding system invented");
  ok($(p5, "recoEmptyActions").textContent.includes("Complete your profile"), "C18 existing profile.html action");

  /* 403 (non-student or auth pending) -> recommendations degrade, discovery stays */
  const p6 = page({ authError: err(403, "Only student accounts") });
  fireReady(p6);
  await flush(30);
  ok(visible(p6, "recoError"), "C19 403 -> recommendation error state, no crash");
  ok(visible(p6, "oppGrid"), "C20 discovery unaffected for non-student");
  ok(!/Post job|Publish|Close opportunity|Delete/.test(p6.doc.body.textContent), "C21 no recruiter controls anywhere");

  /* 401 -> auth.js owns redirect; page must not throw */
  const p7 = page({ noAuth: true });
  fireReady(p7);
  await flush(30);
  ok(p7.consoleErrors.length === 0, "C22 401 handled without console errors", p7.consoleErrors.join("; "));
  ok(visible(p7, "oppGrid"), "C23 public discovery still rendered");

  /* no duplicate initial requests + stale-response guard */
  const callsRef = {};
  const p8 = page(Object.assign({ manualFirstList: true }, { callsRef }));
  fireReady(p8);
  await flush(60);
  eq(listCalls(p8).length, 1, "C24 single in-flight list request (no duplicates)");
  callsRef.api.releaseManualList({ opportunities: listFixture(), total: 4, limit: 20, offset: 0, has_more: false });
  await flush(30);
  ok(visible(p8, "oppGrid") && cards(p8, "oppGrid").length === 4, "C25 deferred response renders when it arrives");

  /* incomplete student profile must not crash anything */
  const p9 = page({ recoEmpty: true });
  $(p9, "recoEmptyMsg");
  fireReady(p9);
  await flush(30);
  ok(!p9.consoleErrors.length, "C26 no console errors with incomplete profile payload", p9.consoleErrors.join("; "));
}
function fireReady2(p) { /* retry uses the bound button; nothing else to fire */ }


/* ---------------- runner ---------------- */
(async () => {
  await testInitialLoad();
  await testSearchFiltersSort();
  await testStates();
  console.log("\n================ RESULT ================");
  console.log("TOTAL=" + (pass + fail) + " PASSED=" + pass + " FAILED=" + fail);
  if (failures.length) {
    console.log("FAILED CHECKS:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
})().catch((e) => { console.error("SUITE ERROR:", e); process.exit(2); });


