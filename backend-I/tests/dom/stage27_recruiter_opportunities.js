/* =====================================================================
   STAGE 2.7 — behavioural test suite (jsdom, temp tooling)
   Drives jobs.html+jobs.js and opportunity-details.html+.js against a
   call-recording stub API. No network, no writes to the database.
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

/* ---------------- fixtures ---------------- */
function rowsFixture() {
  return [
    { id: 11, title: "Backend Intern", company_name: "Acme Corp", opportunity_type: "internship",
      work_mode: "remote", status: "draft", location: "Remote", openings: 3,
      deadline: "2026-03-01T00:00:00Z", skills: [{ skill_name: "Python" }, { skill_name: "SQL" }] },
    { id: 22, title: "Frontend Engineer", company_name: "Acme Corp", opportunity_type: "job",
      work_mode: "hybrid", status: "published", location: "Pune", openings: 1,
      deadline: null, skills: [{ skill_name: "React" }] },
    { id: 33, title: "Data Analyst", company_name: "Acme Corp", opportunity_type: "placement",
      work_mode: "onsite", status: "closed", location: "Delhi", openings: 5,
      deadline: null, skills: [] }
  ];
}
function detailOf(r) {
  const o = Object.assign({}, r);
  o.description = (r.title || "Role") + " description";
  o.responsibilities = "Ship features";
  o.eligibility_text = "Open to all branches";
  o.min_cgpa = 7;
  o.skills = r.id === 33 ? [] : [{ skill_id: 7, skill_name: "Python", required_level: "advanced",
    importance: "critical", skill_type: "required" }];
  return o;
}

/* ---------------- jobs page harness ---------------- */
function jobsPage(opts) {
  opts = opts || {};
  const calls = [];
  const toasts = [];
  const consoleErrors = [];
  let rows = opts.rows || rowsFixture();
  const html = fs.readFileSync(ROOT + "jobs.html", "utf8");
  const js = fs.readFileSync(ROOT + "jobs.js", "utf8");

  function statusOf(id) { const r = rows.find((x) => Number(x.id) === Number(id)); return r ? r.status : "draft"; }
  function setStatus(id, st) {
    rows = rows.map((r) => Number(r.id) === Number(id) ? Object.assign({}, r, { status: st }) : r);
  }
  const api = {
    getUser: () => ({ id: 1, role: opts.role || "recruiter", name: "Rec" }),
    getMyRoleProfile: () => opts.profileError
      ? Promise.reject(opts.profileError)
      : Promise.resolve({ profile: { company_name: opts.company === null ? "" : "Acme Corp", company_location: "Pune" } }),
    getMyOpportunities: (p) => {
      calls.push(["mine", p]);
      if (opts.mineError) return Promise.reject(opts.mineError);
      return Promise.resolve({ opportunities: rows.map((r) => Object.assign({}, r)) });
    },
    getOpportunity: (id) => {
      calls.push(["detail", id]);
      if (opts.detailError) return Promise.reject(opts.detailError);
      const r = rows.find((x) => Number(x.id) === Number(id));
      return r ? Promise.resolve({ opportunity: detailOf(r) }) : Promise.reject(err(404, "Opportunity not found"));
    },
    createOpportunity: (d) => {
      calls.push(["create", d]);
      if (opts.createError) return Promise.reject(opts.createError);
      rows = rows.concat([Object.assign({ id: 99, status: "draft", company_name: "Acme Corp", skills: [] }, d)]);
      return Promise.resolve({ opportunity: { id: 99, status: "draft" } });
    },
    updateOpportunity: (id, d) => {
      calls.push(["patch", id, d]);
      if (opts.patchError) return Promise.reject(opts.patchError);
      return Promise.resolve({ opportunity: Object.assign({ id: id, status: statusOf(id) }, d) });
    },
    replaceOpportunitySkills: (id, s) => {
      calls.push(["skills", id, s]);
      if (opts.skillsError) return Promise.reject(opts.skillsError);
      return Promise.resolve({ skills: s });
    },
    searchSkillCatalog: (q, lim) => {
      calls.push(["catalog", q, lim]);
      return Promise.resolve({ skills: [{ id: 7, name: "Python", category: "Languages" }] });
    },
    publishOpportunity: (id) => {
      calls.push(["publish", id]);
      if (opts.publishError) return Promise.reject(opts.publishError);
      setStatus(id, "published");
      return Promise.resolve({ opportunity: { id: id, status: "published" } });
    },
    closeOpportunity: (id) => {
      calls.push(["close", id]);
      if (opts.closeError) return Promise.reject(opts.closeError);
      setStatus(id, "closed");
      return Promise.resolve({ opportunity: { id: id, status: "closed" } });
    },
    /* Stage 9.2: owner archive (published|closed -> archived, terminal). */
    archiveOpportunity: (id) => {
      calls.push(["archive", id]);
      if (opts.archiveError) return Promise.reject(opts.archiveError);
      setStatus(id, "archived");
      return Promise.resolve({ opportunity: { id: id, status: "archived" } });
    },
    deleteOpportunity: (id) => {
      calls.push(["delete", id]);
      if (opts.deleteError) return Promise.reject(opts.deleteError);
      rows = rows.filter((r) => Number(r.id) !== Number(id));
      return Promise.resolve({ ok: true });
    }
  };

  const dom = new JSDOM(html, {
    url: "http://localhost/jobs.html",
    runScripts: "outside-only",
    beforeParse(window) {
      window.SkillShareAPI = api;
      window.SkillShareAuth = {
        requireUser: () => opts.authError ? Promise.reject(opts.authError)
          : Promise.resolve({ id: 1, role: opts.role || "recruiter", name: "Rec" }),
        getErrorMessage: (e) => (e && (e.detail || e.message)) || "Something went wrong."
      };
      window.portalToast = (m) => toasts.push(m);
      window.addEventListener("error", (e) => consoleErrors.push(String(e.message || e)));
      try { window.eval(js); } catch (e) { consoleErrors.push("eval: " + e.message); }
    }
  });
  return { dom, window: dom.window, doc: dom.window.document, calls, toasts, consoleErrors, api };
}
function cardEls(doc) { return Array.from(doc.querySelectorAll("#jobsRows .jobs-card")); }
/* Cards that are actually shown to the recruiter: renderList() leaves stale
   markup inside the (hidden) container when a filter matches nothing, so a
   raw DOM count would overcount. Visibility is what matters. */
function cardCount(p) {
  const host = $("jobsRows", p.doc);
  return host && !host.hidden ? cardEls(p.doc).length : 0;
}
function actionSet(card) {
  if (!card) return [];
  return Array.from(card.querySelectorAll("[data-act]")).map((b) => b.getAttribute("data-act")).sort();
}
function click(win, el) { el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })); }
function answer(win, doc, yes) { click(win, doc.getElementById(yes ? "jobsConfirmOk" : "jobsConfirmCancel")); }
function setInput(win, el, v) {
  el.value = v;
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
}
function $(a, b) {   /* tolerant: $(id, doc) or $(doc, id) */
  const isDoc = (x) => x && typeof x.getElementById === "function";
  const doc = isDoc(a) ? a : b;
  const id = isDoc(a) ? b : a;
  return doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null;
}
function countOf(calls, name) { return calls.filter((c) => c[0] === name).length; }
function firstOf(calls, name) { return calls.filter((c) => c[0] === name)[0]; }

/* ==================== JOBS PAGE TESTS ==================== */
async function t_bootAndRender() {
  section("JOBS — boot, real rows, count, states");
  const p = jobsPage();
  await flush();
  const { doc, calls, toasts } = p;
  eq(countOf(calls, "mine"), 1, "exactly one GET /mine on boot");
  eq(firstOf(calls, "mine")[1].limit, 100, "list request uses limit=100");
  eq(cardEls(doc).length, 3, "three real cards rendered");
  ok($("jobsRows", doc) ? !$("jobsRows", doc).hidden : false, "card container visible");
  ok($("jobsLoading", doc).hidden, "loading skeletons hidden");
  ok($("jobsEmpty", doc).hidden, "empty state hidden");
  ok($("jobsFilterEmpty", doc).hidden, "filter-empty state hidden");
  ok($("jobsError", doc).hidden, "error state hidden");
  eq($("jobsCount", doc).textContent, "3 opportunities", "count label from real rows");
  ok(!$("jobsCompanyBanner", doc).hidden, "company banner shown from role profile");
  eq($("jobsCompanyName", doc).textContent, "Acme Corp", "company name from server profile");
  ok($("jobsProfileWarn", doc).hidden, "profile warning hidden when company present");
  const draftCard = cardEls(doc).find((c) => c.getAttribute("data-id") === "11");
  ok(/Backend Intern/.test(draftCard.textContent), "card shows real title");
  ok(/Python/.test(draftCard.textContent) && /SQL/.test(draftCard.textContent), "card shows real skill names");
  eq(p.consoleErrors.length, 0, "no console/runtime errors");
  eq(toasts.length, 0, "no toasts on a clean load");
  p.dom.window.close();
}

async function t_emptyState() {
  section("JOBS — zero opportunities");
  const p = jobsPage({ rows: [] });
  await flush();
  const { doc, calls } = p;
  ok($("jobsEmpty", doc) && !$("jobsEmpty", doc).hidden, "empty state visible for zero rows");
  ok($("jobsRows", doc).hidden, "card container hidden");
  eq($("jobsCount", doc).textContent, "", "count label cleared");
  eq(cardCount(p), 0, "no cards shown");
  eq(countOf(calls, "mine"), 1, "single list call");
  p.dom.window.close();
}

async function t_tabsAndFilters() {
  section("JOBS — status tabs, search, type/mode filters (client-side)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls } = p;
  const tabs = Array.from(doc.querySelectorAll("#jobsTabs button"));

  click(win, tabs.find((b) => b.getAttribute("data-status") === "draft"));
  eq(cardEls(doc).length, 1, "Draft tab filters to 1 draft");
  eq($("jobsCount", doc).textContent, "1 of 3 shown", "count shows filtered/total");
  ok(/Draft/.test(cardEls(doc)[0].textContent), "draft badge shown");
  eq(cardEls(doc)[0].getAttribute("data-id"), "11", "draft card id matches real row");

  click(win, tabs.find((b) => b.getAttribute("data-status") === "published"));
  eq(cardEls(doc).length, 1, "Published tab filters to 1 published");
  eq(cardEls(doc)[0].getAttribute("data-id"), "22", "published card is the real published row");
  eq(actionSet(cardEls(doc)[0]).join(","), "applicants,archive,close,edit", "published actions = Applicants + Edit + Close + Archive");
  eq(doc.querySelectorAll("#jobsRows a[href*='opportunity-details.html?id=22']").length, 1, "View link carries the real id");

  click(win, tabs.find((b) => b.getAttribute("data-status") === "closed"));
  eq(cardEls(doc).length, 1, "Closed tab filters to 1 closed");
  eq(actionSet(cardEls(doc)[0]).length, 2, "closed row: Applicants + Archive only");
  ok(actionSet(cardEls(doc)[0]).indexOf("archive") !== -1, "closed card offers archive");
  ok(actionSet(cardEls(doc)[0]).indexOf("applicants") !== -1, "closed card offers applicants (applications are kept)");
  ok(/Closed/.test(cardEls(doc)[0].textContent), "closed badge shown");
  ok(!/Reopen/i.test(cardEls(doc)[0].textContent), "no fake Reopen action");

  click(win, tabs[0]);
  eq(cardEls(doc).length, 3, "All tab restores every row");

  setInput(win, $("jobsSearch", doc), "backend");
  eq(cardEls(doc).length, 1, "search matches title");
  setInput(win, $("jobsSearch", doc), "react");
  eq(cardEls(doc).length, 1, "search matches a skill name");
  setInput(win, $("jobsSearch", doc), "zzzz");
  eq(cardCount(p), 0, "no cards shown for a non-matching search");
  ok($("jobsRows", doc).hidden, "card container hidden when nothing matches");
  ok(!$("jobsFilterEmpty", doc).hidden, "filter-empty state shown");
  click(win, $("jobsClearFilters", doc));
  eq(cardEls(doc).length, 3, "clear filters restores all rows");
  eq($("jobsSearch", doc).value, "", "clear filters empties the search box");

  setInput(win, $("jobsTypeFilter", doc), "internship");
  eq(cardEls(doc).length, 1, "type filter works");
  setInput(win, $("jobsTypeFilter", doc), "");
  setInput(win, $("jobsModeFilter", doc), "hybrid");
  eq(cardEls(doc).length, 1, "work-mode filter works");
  setInput(win, $("jobsModeFilter", doc), "remote");
  eq(cardEls(doc).length, 1, "mode filter alone matches the remote draft");
  eq(cardEls(doc)[0].getAttribute("data-id"), "11", "matched card is the remote row");
  click(win, $("jobsClearFilters", doc));
  eq(cardEls(doc).length, 3, "clear filters resets type/mode too");

  eq(countOf(calls, "mine"), 1, "filtering/search never re-requests the API");
  eq(p.consoleErrors.length, 0, "no console errors while filtering");
  p.dom.window.close();
}

async function t_actionSets() {
  section("JOBS — per-status action sets");
  const p = jobsPage();
  await flush();
  const { doc } = p;
  const byId = {};
  cardEls(doc).forEach((c) => { byId[c.getAttribute("data-id")] = c; });
  eq(actionSet(byId["11"]).join(","), "delete,edit,publish", "draft: Edit + Publish + Delete");
  eq(actionSet(byId["22"]).join(","), "applicants,archive,close,edit", "published: Applicants + Edit + Close + Archive");
  eq(actionSet(byId["33"]).join(","), "applicants,archive", "closed: Applicants + Archive only");
  eq(Object.keys(byId).length, 3, "all three real rows present as cards");
  ok(!/kebab|more-actions/i.test(byId["11"].innerHTML), "no kebab-menu markup");
  ok(!/\d+\s*(applicant|application)/i.test(byId["11"].textContent + byId["22"].textContent), "no fabricated application counts");
  p.dom.window.close();
}


async function t_publishFlow() {
  section("JOBS — publish (confirm gate, server-authoritative)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  const draft = cardEls(doc).find((c) => c.getAttribute("data-id") === "11");

  click(win, draft.querySelector("[data-act='publish']"));
  ok(!$("jobsConfirm", doc).hidden, "confirm dialog opens before publishing");
  eq($("jobsConfirmMsg", doc).textContent, "Publish this opportunity? It becomes visible to students.", "confirm copy is explicit");
  eq($("jobsConfirmOk", doc).textContent, "Publish", "confirm button label");
  answer(win, doc, false);
  await flush();
  eq(countOf(calls, "publish"), 0, "cancelling publishes nothing");
  ok($("jobsConfirm", doc).hidden, "dialog closes on cancel");

  const mineBefore = countOf(calls, "mine");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='publish']"));
  answer(win, doc, true);
  await flush();
  eq(countOf(calls, "publish"), 1, "confirm publishes exactly once");
  eq(firstOf(calls, "publish")[1], 11, "publish targets the real row id");
  eq(countOf(calls, "mine"), mineBefore, "no redundant reload after a successful publish");
  ok(/Published/.test(cardEls(doc).find((c) => c.getAttribute("data-id") === "11").textContent), "card badge flips to Published");
  eq(actionSet(cardEls(doc).find((c) => c.getAttribute("data-id") === "11")).join(","), "applicants,archive,close,edit", "actions update to Applicants + Edit + Close + Archive");
  ok(toasts.some((t) => /published/i.test(t)), "success toast shown");
  eq(p.consoleErrors.length, 0, "no console errors during publish");
  p.dom.window.close();
}

async function t_publishError() {
  section("JOBS — publish failure (409 keeps UI honest)");
  const p = jobsPage({ publishError: err(409, "Add at least one required skill before publishing") });
  await flush();
  const { window: win, doc, calls, toasts } = p;
  const mineBefore = countOf(calls, "mine");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='publish']"));
  answer(win, doc, true);
  await flush();
  ok(toasts.some((t) => /at least one required skill/i.test(t)), "server detail surfaced to the recruiter");
  ok(!/undefined|\[object|500/i.test(toasts.join(" ")), "no raw internals leaked");
  eq(countOf(calls, "mine"), mineBefore + 1, "list resynced after the failure");
  ok(/Draft/.test(cardEls(doc).find((c) => c.getAttribute("data-id") === "11").textContent), "row still shows Draft");
  p.dom.window.close();
}

async function t_closeFlow() {
  section("JOBS — close (published -> closed)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "22").querySelector("[data-act='close']"));
  ok(!$("jobsConfirm", doc).hidden, "confirm dialog opens before closing");
  eq($("jobsConfirmMsg", doc).textContent, "Close this opportunity? Students will no longer see it as an active opportunity.", "close copy is explicit");
  answer(win, doc, true);
  await flush();
  eq(countOf(calls, "close"), 1, "close called once");
  eq(firstOf(calls, "close")[1], 22, "close targets the real row id");
  ok(/Closed/.test(cardEls(doc).find((c) => c.getAttribute("data-id") === "22").textContent), "badge flips to Closed");
  eq(actionSet(cardEls(doc).find((c) => c.getAttribute("data-id") === "22")).join(","), "applicants,archive", "closed card collapses to Applicants + Archive only");
  ok(toasts.some((t) => /closed/i.test(t)), "close toast shown");
  p.dom.window.close();
}

async function t_deleteFlow() {
  section("JOBS — delete draft (row removed locally)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  const mineBefore = countOf(calls, "mine");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='delete']"));
  ok(!$("jobsConfirm", doc).hidden, "confirm dialog opens before deleting");
  eq($("jobsConfirmMsg", doc).textContent, "Delete this draft opportunity?", "delete copy is explicit");
  answer(win, doc, false);
  await flush();
  eq(countOf(calls, "delete"), 0, "cancelling deletes nothing");

  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='delete']"));
  answer(win, doc, true);
  await flush();
  eq(countOf(calls, "delete"), 1, "delete called once");
  eq(firstOf(calls, "delete")[1], 11, "delete targets the real row id");
  eq(cardEls(doc).length, 2, "card removed from the list");
  eq(cardEls(doc).filter((c) => c.getAttribute("data-id") === "11").length, 0, "removed card is gone");
  eq($("jobsCount", doc).textContent, "2 opportunities", "count updated");
  eq(countOf(calls, "mine"), mineBefore, "no full reload needed after delete");
  ok(toasts.some((t) => /deleted/i.test(t)), "delete toast shown");
  p.dom.window.close();
}

async function t_deleteConflict() {
  section("JOBS — delete non-draft (409)");
  const p = jobsPage({ deleteError: err(409, "Only draft opportunities can be deleted") });
  await flush();
  const { window: win, doc, calls, toasts } = p;
  const mineBefore = countOf(calls, "mine");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='delete']"));
  answer(win, doc, true);
  await flush();
  ok(toasts.some((t) => /draft opportunities can be deleted|state has changed/i.test(t)), "409 explained to the recruiter");
  eq(countOf(calls, "mine"), mineBefore + 1, "list resynced after 409");
  ok(cardEls(doc).length === 3, "row kept because the server refused");
  p.dom.window.close();
}



async function t_editPrefillAndSave() {
  section("JOBS — edit prefill then PATCH + skill PUT (never POST)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='edit']"));
  await flush();
  ok(!$("jobsModal", doc).hidden, "composer opens for editing");
  eq($("jobsModalTitle", doc).textContent, "Edit opportunity", "composer titled for edit");
  eq(firstOf(calls, "detail")[1], 11, "detail fetched with the real row id");
  eq($("f_title", doc).value, "Backend Intern", "form prefilled from the server detail");
  eq($("f_openings", doc).value, "3", "numeric field prefilled");
  eq($("f_min_cgpa", doc).value, "7", "eligibility field prefilled");
  ok($("jobsSaveDraftBtn", doc).hidden, "Save draft hidden in edit mode");
  ok(!$("jobsSaveChangesBtn", doc).hidden, "Save changes shown in edit mode");
  eq($("jobsPublishBtn", doc).textContent, "Publish", "publish available for a draft");
  ok(!$("jobsPublishBtn", doc).disabled, "publish enabled for a draft");
  ok($("jobsCloseBtn", doc).hidden, "close hidden for a draft");
  ok(/Python/.test($("jobsSkillSelected", doc).textContent), "existing skills loaded into the editor");

  const mineBefore = countOf(calls, "mine");
  setInput(win, $("f_title", doc), "Backend Intern II");
  click(win, $("jobsSaveChangesBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 0, "editing never calls POST /opportunities");
  eq(countOf(calls, "patch"), 1, "PATCH called once");
  eq(firstOf(calls, "patch")[1], 11, "PATCH targets the same real id");
  eq(firstOf(calls, "patch")[2].title, "Backend Intern II", "PATCH carries the edited title");
  eq(countOf(calls, "skills"), 1, "skills PUT exactly once on save");
  eq(firstOf(calls, "skills")[1], 11, "skills PUT targets the same id");
  eq(firstOf(calls, "skills")[2][0].skill_id, 7, "skills PUT uses real catalog ids");
  eq(firstOf(calls, "skills")[2][0].required_level, "advanced", "skills PUT preserves the stored level");
  eq(countOf(calls, "mine"), mineBefore + 1, "list refreshed after saving");
  ok($("jobsModal", doc).hidden, "composer closed after save");
  ok(toasts.some((t) => /saved/i.test(t)), "save toast shown");
  p.dom.window.close();
}

async function t_editPublished() {
  section("JOBS — edit a published row (close available, publish disabled)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls } = p;
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "22").querySelector("[data-act='edit']"));
  await flush();
  eq($("jobsEditingStatus", doc).textContent, "published", "editing line shows the real status");
  eq($("jobsPublishBtn", doc).textContent, "Published", "publish button reflects the published state");
  ok($("jobsPublishBtn", doc).disabled, "publish disabled for an already-published row");
  ok(!$("jobsCloseBtn", doc).hidden, "close available for a published row");
  click(win, $("jobsPublishBtn", doc));
  await flush();
  eq(countOf(calls, "publish"), 0, "clicking the inert Published button does nothing");
  click(win, $("jobsSaveChangesBtn", doc));
  await flush();
  eq(countOf(calls, "publish"), 0, "saving changes does not publish");
  eq(countOf(calls, "patch"), 1, "PATCH called once");
  eq(countOf(calls, "close"), 0, "saving changes does not close");
  p.dom.window.close();
}

async function t_createDraft() {
  section("JOBS — create draft (POST only for new records)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  click(win, $("jobsPostBtn", doc));
  await flush();
  ok(!$("jobsModal", doc).hidden, "composer opens for a new role");
  eq($("jobsModalTitle", doc).textContent, "Post job", "composer titled for create");
  eq($("f_title", doc).value, "", "create form starts empty");
  ok($("jobsEditingLine", doc).hidden, "no editing line for a new role");
  ok(!$("jobsSaveDraftBtn", doc).hidden, "Save draft shown for a new role");
  ok($("jobsSaveChangesBtn", doc).hidden, "Save changes hidden for a new role");
  eq($("jobsPublishBtn", doc).textContent, "Save & Publish", "primary action is Save & Publish");

  click(win, $("jobsSaveDraftBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 0, "client validation blocks an empty form");
  eq($("jobsFormErrorMsg", doc).textContent, "Title is required.", "validation message shown");
  ok(!$("jobsFormError", doc).hidden, "form error banner visible");

  setInput(win, $("f_title", doc), "New Data Intern");
  setInput(win, $("f_description", doc), "Work with the data team.");
  setInput(win, $("f_opportunity_type", doc), "internship");
  click(win, $("jobsSaveDraftBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 1, "POST called once for a new draft");
  eq(firstOf(calls, "create")[1].title, "New Data Intern", "POST carries the form payload");
  eq(firstOf(calls, "create")[1].opportunity_type, "internship", "POST carries the type");
  ok($("jobsModal", doc).hidden, "composer closed after saving the draft");
  ok(toasts.some((t) => /draft saved/i.test(t)), "draft toast shown");
  eq(cardEls(doc).length, 4, "new draft appears in the refreshed list");
  p.dom.window.close();
}

async function t_skillSearchAndPublish() {
  section("JOBS — skill catalog search, add, then Save & Publish sequence");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  click(win, $("jobsPostBtn", doc));
  await flush();
  setInput(win, $("f_title", doc), "Skill Test Role");
  setInput(win, $("f_description", doc), "Description for the skill flow.");

  click(win, $("jobsPublishBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 0, "publishing with zero skills is blocked client-side");
  eq($("jobsFormErrorMsg", doc).textContent, "Add at least one required skill before publishing.", "skill requirement explained");

  setInput(win, $("jobsSkillSearch", doc), "pyt");
  eq(countOf(calls, "catalog"), 0, "search is debounced, not per keystroke");
  await flush(340);
  eq(countOf(calls, "catalog"), 1, "catalog queried once after debounce");
  eq(firstOf(calls, "catalog")[1], "pyt", "catalog query text");
  const addBtn = $("jobsSkillResults", doc).querySelector("[data-add]");
  ok(!!addBtn, "catalog result offers an Add button");
  click(win, addBtn);
  ok(/Python/.test($("jobsSkillSelected", doc).textContent), "picked skill shown in the editor");

  const sel = $("jobsSkillSelected", doc).querySelector("select[data-k='importance']");
  sel.value = "critical";
  sel.dispatchEvent(new win.Event("change", { bubbles: true }));

  click(win, $("jobsPublishBtn", doc));
  await flush(20);
  eq(countOf(calls, "create"), 1, "create happens first");
  eq(countOf(calls, "skills"), 1, "skills PUT happens second");
  eq(firstOf(calls, "skills")[2][0].importance, "critical", "skill editor changes are saved");
  eq(countOf(calls, "publish"), 1, "publish happens last");
  const order = calls.filter((c) => ["create", "skills", "publish"].indexOf(c[0]) !== -1).map((c) => c[0]);
  eq(order.join(">"), "create>skills>publish", "create -> skills -> publish ordering");
  ok($("jobsModal", doc).hidden, "composer closed after publishing");
  ok(toasts.some((t) => /published/i.test(t)), "publish toast shown");
  p.dom.window.close();
}


async function t_listErrors() {
  section("JOBS — list error states + retry");
  const p = jobsPage({ mineError: err(401) });
  await flush();
  const { window: win, doc, calls } = p;
  ok(!$("jobsError", doc).hidden, "error state shown on 401");
  eq($("jobsErrorMsg", doc).textContent, "Your session has expired. Please sign in again.", "401 copy");
  ok($("jobsRows", doc).hidden, "no stale cards while errored");
  click(win, $("jobsRetry", doc));
  await flush();
  eq(countOf(calls, "mine"), 2, "retry re-requests the list");
  p.dom.window.close();

  const p2 = jobsPage({ mineError: err(500) });
  await flush();
  eq($("jobsErrorMsg", p2.doc).textContent, "Something went wrong. Please try again.", "500 copy hides internals");
  p2.dom.window.close();

  const p3 = jobsPage({ authError: err(401) });
  await flush();
  ok(!$("jobsError", p3.doc).hidden, "auth failure surfaces the error state");
  ok(!/undefined/.test($("jobsErrorMsg", p3.doc).textContent), "auth error copy is clean");
  p3.dom.window.close();

  const p4 = jobsPage({ profileError: err(500), company: null });
  await flush();
  /* A failed profile read must never produce a false "complete your
     profile" warning — the banner stays hidden and the list still loads. */
  ok($("jobsProfileWarn", p4.doc).hidden, "no false profile warning when the profile read fails");
  eq(cardEls(p4.doc).length, 3, "list still loads when the profile call fails");
  p4.dom.window.close();
}

async function t_saveErrors() {
  section("JOBS — save error surfacing (422 detail, no internals)");
  const p = jobsPage({ patchError: err(422, "Title must be at most 180 characters") });
  await flush();
  const { window: win, doc } = p;
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='edit']"));
  await flush();
  setInput(win, $("f_title", doc), "X");
  click(win, $("jobsSaveChangesBtn", doc));
  await flush();
  ok(!$("jobsFormError", doc).hidden, "form error shown for a rejected save");
  eq($("jobsFormErrorMsg", doc).textContent, "Title must be at most 180 characters", "server validation detail surfaced");
  ok(!$("jobsModal", doc).hidden, "composer stays open so work is not lost");
  ok(!/undefined|\[object/.test($("jobsFormErrorMsg", doc).textContent), "no raw internals in the message");
  p.dom.window.close();
}

async function t_nonRecruiter() {
  section("JOBS — non-recruiter guard");
  const p = jobsPage({ role: "student" });
  await flush();
  const { window: win, doc, calls, toasts } = p;
  eq($("jobsPostBtn", doc).style.display, "none", "post button hidden for non-recruiters");
  click(win, $("jobsPostBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 0, "non-recruiter cannot create");
  eq(countOf(calls, "detail"), 0, "non-recruiter cannot open the editor");
  ok(cardEls(doc).length === 3, "their own list still renders whatever the API returns");
  p.dom.window.close();
}


/* ==================== OPPORTUNITY DETAILS TESTS ==================== */
function detailsPage(opts) {
  opts = opts || {};
  const calls = [], consoleErrors = [];
  const html = fs.readFileSync(ROOT + "opportunity-details.html", "utf8");
  const js = fs.readFileSync(ROOT + "opportunity-details.js", "utf8");
  const opp = opts.opp || {
    id: 22, title: "Frontend Engineer", company_name: "Acme Corp", opportunity_type: "job",
    work_mode: "hybrid", status: "published", location: "Pune",
    description: "Build accessible UI components for our hiring platform.",
    responsibilities: "Own the design system", duration: "6 months", compensation: "Rs 40k / month",
    openings: 2, deadline: "2026-04-01T00:00:00Z", min_cgpa: 7.5,
    eligible_degree: "B.Tech", eligible_branch: "CSE, IT",
    skills: [{ skill_id: 7, skill_name: "React", required_level: "advanced", importance: "critical" }],
    my_match: opts.match ? { match_percentage: 82 } : undefined
  };
  const api = {
    getOpportunity: (id) => {
      calls.push(["detail", id]);
      if (opts.error) {
        const e = typeof opts.error === "function" ? opts.error() : opts.error;
        if (e) return Promise.reject(e);
      }
      return Promise.resolve({ opportunity: opp });
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
      window.addEventListener("error", (e) => consoleErrors.push(String(e.message || e)));
      try { window.eval(js); } catch (e) { consoleErrors.push("eval: " + e.message); }
    }
  });
  return { dom, window: dom.window, doc: dom.window.document, calls, consoleErrors };
}

async function d_publishedDetail() {
  section("DETAILS — published opportunity renders real fields");
  const p = detailsPage({ match: true });
  await flush();
  const { doc, calls } = p;
  eq(countOf(calls, "detail"), 1, "exactly one detail request");
  eq(firstOf(calls, "detail")[1], 22, "detail uses the id from the URL");
  ok($("oppLoading", doc).hidden, "skeleton hidden after load");
  ok(!$("oppHead", doc).hidden && !$("oppBody", doc).hidden, "real content visible");
  eq($("oppTitle", doc).textContent, "Frontend Engineer", "real title");
  eq($("oppEyebrow", doc).textContent, "Acme Corp · Full-time · Hybrid · Pune", "eyebrow built from real fields");
  ok(/Published/.test($("oppBadges", doc).textContent), "published status badge");
  ok(/Full-time/.test($("oppBadges", doc).textContent), "type badge");
  ok(/82% skill match/.test($("oppBadges", doc).textContent), "match badge when the API provides it");
  const skillsTxt = $("oppSkills", doc).textContent;
  ok(/React/.test(skillsTxt) && /advanced/i.test(skillsTxt) && /critical/i.test(skillsTxt), "skills show name/level/importance");
  ok(!/skill_id|^\s*7\s*$/.test(skillsTxt), "no raw skill ids rendered");
  ok(/Pune/.test($("oppFacts", doc).textContent), "facts include the real location");
  ok(/Rs 40k/.test($("oppFacts", doc).textContent), "facts include compensation");
  ok(/7\.5/.test($("oppEligibility", doc).textContent), "eligibility shows the real CGPA cut-off");
  ok(/CSE/.test($("oppEligibility", doc).textContent), "eligibility shows the real branches");
  ok(/Build accessible UI/.test($("oppDescription", doc).textContent), "description rendered");
  ok($("oppManageNote", doc).hidden, "no recruiter manage note for students");
  eq($("oppBackLink", doc).getAttribute("href"), "opportunities.html", "student back link");
  eq(p.consoleErrors.length, 0, "no console errors");
  p.dom.window.close();
}

async function d_recruiterView() {
  section("DETAILS — recruiter view keeps a path back to Jobs");
  const p = detailsPage({ role: "recruiter", search: "?id=11", opp: {
    id: 11, title: "Backend Intern", company_name: "Acme Corp", opportunity_type: "internship",
    work_mode: "remote", status: "draft", location: "Remote", description: "Backend work",
    skills: []
  } });
  await flush();
  const { doc } = p;
  ok(!$("oppManageNote", doc).hidden, "manage note shown to recruiters");
  eq($("oppBackLink", doc).getAttribute("href"), "jobs.html", "recruiter back link points at Jobs");
  ok(/Draft/.test($("oppBadges", doc).textContent), "draft status badge shown to the owner");
  ok($("oppSkillsWrap", doc).hidden, "skills block hidden when there are no skills");
  eq(doc.querySelectorAll("#oppFacts .opp-fact").length, 2, "facts list renders only populated rows (location + work mode)");
  ok($("oppCompanyPanel", doc).hidden === false, "company panel shown when the API returns a company name");
  p.dom.window.close();
}


async function d_emptyAndBadId() {
  section("DETAILS — no id / invalid id never calls the API");
  const p = detailsPage({ search: "" });
  await flush();
  ok(!$("oppEmpty", p.doc).hidden, "empty state when the URL has no id");
  eq($("oppLoading", p.doc).hidden, true, "skeleton hidden");
  eq(countOf(p.calls, "detail"), 0, "no API request without an id");
  eq($("oppEmptyBrowse", p.doc).getAttribute("href"), "opportunities.html", "student empty-state CTA stays on Opportunities");
  p.dom.window.close();

  const p2 = detailsPage({ search: "?id=abc" });
  await flush();
  ok(!$("oppEmpty", p2.doc).hidden, "non-numeric id falls back to the empty state");
  eq(countOf(p2.calls, "detail"), 0, "invalid id is never sent to the API");
  ok($("oppError", p2.doc).hidden, "no error state for an invalid id");
  p2.dom.window.close();

  const p3 = detailsPage({ search: "?id=0" });
  await flush();
  eq(countOf(p3.calls, "detail"), 0, "id=0 is rejected client-side");
  ok(!$("oppEmpty", p3.doc).hidden, "id=0 shows the empty state");
  p3.dom.window.close();
}

async function d_errorStates() {
  section("DETAILS — 403 / 404 / 500 copy and retry");
  const p = detailsPage({ error: err(404) });
  await flush();
  ok(!$("oppError", p.doc).hidden, "error state on 404");
  eq($("oppErrorMsg", p.doc).textContent, "This opportunity could not be found.", "404 copy");
  ok($("oppHead", p.doc).hidden && $("oppBody", p.doc).hidden, "no stale content on error");
  click(p.window, $("oppRetry", p.doc));
  await flush();
  eq(countOf(p.calls, "detail"), 2, "retry re-requests the detail");
  p.dom.window.close();

  const p2 = detailsPage({ error: err(403) });
  await flush();
  eq($("oppErrorMsg", p2.doc).textContent, "You don't have permission to view this opportunity.", "403 copy");
  p2.dom.window.close();

  const p3 = detailsPage({ error: err(500) });
  await flush();
  eq($("oppErrorMsg", p3.doc).textContent, "Something went wrong. Please try again.", "500 copy hides internals");
  p3.dom.window.close();

  const p4 = detailsPage({ error: err(401) });
  await flush();
  eq($("oppErrorMsg", p4.doc).textContent, "Your session has expired. Please sign in again.", "401 copy");
  p4.dom.window.close();
}

async function d_retryRecovers() {
  section("DETAILS — retry recovers to real data");
  let n = 0;
  const p = detailsPage({ error: () => (++n === 1 ? err(500) : null) });
  await flush();
  ok(!$("oppError", p.doc).hidden, "first attempt shows the error state");
  eq(countOf(p.calls, "detail"), 1, "one request so far");
  click(p.window, $("oppRetry", p.doc));
  await flush();
  eq(countOf(p.calls, "detail"), 2, "retry issues a second request");
  ok($("oppError", p.doc).hidden, "error state cleared after a successful retry");
  ok(!$("oppHead", p.doc).hidden && !$("oppBody", p.doc).hidden, "real content rendered after retry");
  eq($("oppTitle", p.doc).textContent, "Frontend Engineer", "title from the retried payload");
  p.dom.window.close();
}

async function d_sparseAndClosed() {
  section("DETAILS — sparse fields are hidden, never faked");
  const p = detailsPage({ search: "?id=44", opp: { id: 44, title: "Bare Role", status: "closed" } });
  await flush();
  const { doc } = p;
  eq($("oppTitle", doc).textContent, "Bare Role", "title rendered");
  eq($("oppEyebrow", doc).textContent, "Opportunity", "eyebrow falls back to a neutral label when nothing is known");
  ok(/Closed/.test($("oppBadges", doc).textContent), "closed badge rendered");
  eq($("oppDescription", doc).textContent, "No description provided.", "description fallback text");
  ok($("oppSkillsWrap", doc).hidden, "skills block hidden (no skills in the API payload)");
  ok($("oppResponsibilitiesWrap", doc).hidden, "responsibilities hidden when absent");
  ok($("oppEligibilityWrap", doc).hidden, "eligibility hidden when absent");
  ok($("oppCompanyPanel", doc).hidden, "company panel hidden when the API returns no company");
  eq(doc.querySelectorAll("#oppFacts .opp-fact").length, 0, "no fabricated facts");
  ok(/No extra details were provided/.test($("oppFacts", doc).textContent), "honest empty facts copy");
  ok(!/Skill #/.test(doc.body.textContent), "no placeholder skill names rendered");
  eq(p.consoleErrors.length, 0, "no console errors");
  p.dom.window.close();
}


/* ==================== RUNNER ==================== */
async function t_detailFailureLocksComposer() {
  section("JOBS — failed detail load locks the composer (no blind saves)");
  const p = jobsPage({ detailError: err(500) });
  await flush();
  const { window: win, doc, calls } = p;
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='edit']"));
  await flush();
  ok(!$("jobsModal", doc).hidden, "composer stays open so the recruiter sees the problem");
  ok(!$("jobsFormError", doc).hidden, "the failure is explained in the form");
  ok($("jobsSaveChangesBtn", doc).disabled, "Save changes locked after a failed detail load");
  ok($("jobsPublishBtn", doc).disabled, "Publish locked after a failed detail load");
  ok($("jobsCloseBtn", doc).disabled, "Close locked after a failed detail load");
  click(win, $("jobsSaveChangesBtn", doc));
  await flush();
  eq(countOf(calls, "patch"), 0, "no PATCH is sent from a half-loaded composer");
  eq(countOf(calls, "skills"), 0, "skills are never PUT when the detail fetch failed");
  click(win, $("jobsCancelBtn", doc));
  eq($("jobsModal", doc).hidden, true, "Cancel still closes the composer");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "22").querySelector("[data-act='edit']"));
  await flush();
  ok(!$("jobsModal", doc).hidden, "a new edit attempt reopens the composer");
  p.dom.window.close();
}

async function t_errorCopyFilter() {
  section("JOBS — server hints pass through, internals never do");
  const p = jobsPage({ publishError: err(409, "deadline cannot be before start_date") });
  await flush();
  const { window: win, doc, toasts } = p;
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='publish']"));
  answer(win, doc, true);
  await flush();
  ok(toasts.some((t) => /deadline cannot be before start_date/.test(t)),
     "a lowercase server hint still reaches the recruiter");

  const p2 = jobsPage({ publishError: err(500, '{"traceback": "sqlalchemy.exc.OperationalError"}') });
  await flush();
  const toasts2 = p2.toasts;
  click(p2.window, cardEls(p2.doc).find((c) => c.getAttribute("data-id") === "11").querySelector("[data-act='publish']"));
  answer(p2.window, p2.doc, true);
  await flush();
  ok(!/sqlalchemy|traceback|\{/.test(toasts2.join(" ")), "internals are never shown to the recruiter");
  ok(toasts2.some((t) => /Something went wrong/.test(t)), "a safe generic message is used instead");
  p.dom.window.close();
  p2.dom.window.close();
}

async function t_publishPrechecks() {
  section("JOBS — publish prechecks mirror the backend 409 rules");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls } = p;
  click(win, $("jobsPostBtn", doc));
  await flush();
  setInput(win, $("f_title", doc), "Date Rule Role");
  setInput(win, $("f_description", doc), "Description for the date rules.");
  setInput(win, $("f_deadline", doc), "2026-03-01");
  setInput(win, $("f_start_date", doc), "2026-06-01");
  setInput(win, $("f_opportunity_type", doc), "internship");
  setInput(win, $("jobsSkillSearch", doc), "python");
  await flush(340);
  const addBtn = $("jobsSkillResults", doc).querySelector("[data-add]");
  if (addBtn) click(win, addBtn);

  click(win, $("jobsPublishBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 0, "deadline-before-start is caught before any request");
  eq($("jobsFormErrorMsg", doc).textContent, "The application deadline cannot be before the start date.",
     "honest local explanation of the date order rule");

  setInput(win, $("f_deadline", doc), "2026-09-01");
  setInput(win, $("f_start_date", doc), "2026-06-01");
  click(win, $("jobsSaveDraftBtn", doc));
  await flush();
  eq(countOf(calls, "create"), 1, "a draft saves normally once the dates are consistent");
  eq(countOf(calls, "publish"), 0, "saving a draft never publishes");
  p.dom.window.close();

  const p2 = jobsPage();
  await flush();
  const w2 = p2.window, d2 = p2.doc;
  click(w2, $("jobsPostBtn", d2));
  await flush();
  setInput(w2, $("f_title", d2), "Past Deadline Role");
  setInput(w2, $("f_description", d2), "Description for the past deadline.");
  setInput(w2, $("f_deadline", d2), "2020-01-01");
  setInput(w2, $("jobsSkillSearch", d2), "python");
  await flush(340);
  const add2 = $("jobsSkillResults", d2).querySelector("[data-add]");
  if (add2) click(w2, add2);
  click(w2, $("jobsPublishBtn", d2));
  await flush();
  eq(countOf(p2.calls, "create"), 0, "a past deadline cannot be published");
  eq($("jobsFormErrorMsg", d2).textContent, "The application deadline is already in the past.",
     "past deadline explained locally");
  click(w2, $("jobsSaveDraftBtn", d2));
  await flush();
  eq(countOf(p2.calls, "create"), 1, "drafts with a past deadline are still allowed to save");
  p2.dom.window.close();
}

async function t_archiveFlow() {
  section("JOBS — archive (published -> archived, terminal)");
  const p = jobsPage();
  await flush();
  const { window: win, doc, calls, toasts } = p;
  const mineBefore = countOf(calls, "mine");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "22").querySelector("[data-act='archive']"));
  ok(!$("jobsConfirm", doc).hidden, "confirm dialog opens before archiving");
  eq($("jobsConfirmMsg", doc).textContent, "Archive this opportunity? It leaves public discovery and can no longer receive applications. Existing applications are kept.", "archive copy is explicit");
  answer(win, doc, false);
  await flush();
  eq(countOf(calls, "archive"), 0, "cancelling archives nothing");

  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "22").querySelector("[data-act='archive']"));
  answer(win, doc, true);
  await flush();
  eq(countOf(calls, "archive"), 1, "archive called once");
  eq(firstOf(calls, "archive")[1], 22, "archive targets the real row id");
  eq(countOf(calls, "mine"), mineBefore, "no redundant reload after a successful archive");
  ok(/Archived/.test(cardEls(doc).find((c) => c.getAttribute("data-id") === "22").textContent), "card badge flips to Archived");
  eq(actionSet(cardEls(doc).find((c) => c.getAttribute("data-id") === "22")).join(","), "applicants", "archived card keeps Applicants (applications are kept, lifecycle is terminal)");
  ok(toasts.some((t) => /archived/i.test(t)), "archive toast shown");
  p.dom.window.close();
}

async function t_archiveConflict() {
  section("JOBS — archive invalid transition (409)");
  const p = jobsPage({ archiveError: err(409, "Only published or closed opportunities can be archived") });
  await flush();
  const { window: win, doc, calls, toasts } = p;
  const mineBefore = countOf(calls, "mine");
  click(win, cardEls(doc).find((c) => c.getAttribute("data-id") === "22").querySelector("[data-act='archive']"));
  answer(win, doc, true);
  await flush();
  ok(toasts.some((t) => /archived|state has changed/i.test(t)), "409 explained to the recruiter");
  eq(countOf(calls, "mine"), mineBefore + 1, "list resynced after 409");
  ok(cardEls(doc).length === 3, "row kept because the server refused");
  p.dom.window.close();
}

async function main() {
  console.log("STAGE 2.7 — jsdom behavioural suite");
  const tests = [
    t_bootAndRender, t_emptyState, t_tabsAndFilters, t_actionSets,
    t_publishFlow, t_publishError, t_closeFlow, t_archiveFlow, t_archiveConflict,
    t_deleteFlow, t_deleteConflict,
    t_editPrefillAndSave, t_editPublished, t_createDraft, t_skillSearchAndPublish,
    t_listErrors, t_saveErrors, t_nonRecruiter, t_detailFailureLocksComposer,
    t_errorCopyFilter, t_publishPrechecks,
    d_publishedDetail, d_recruiterView, d_emptyAndBadId, d_errorStates,
    d_retryRecovers, d_sparseAndClosed
  ];
  for (const t of tests) {
    try { await t(); }
    catch (e) { fail++; failures.push(t.name + " threw"); console.log("  FAIL  " + t.name + " threw -> " + e.stack.split("\n").slice(0, 3).join(" | ")); }
  }
  console.log("\n================ SUMMARY ================");
  console.log("PASS: " + pass + "   FAIL: " + fail);
  if (failures.length) console.log("Failures: " + failures.join(" ; "));
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error("suite crashed", e); process.exitCode = 2; });

