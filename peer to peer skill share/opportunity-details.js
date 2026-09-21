/* =====================================================================
   SKILLSHARE — OPPORTUNITY DETAILS (Stage 2.7 + Stage 2.9)
   Renders the EXISTING opportunity-details.html from real backend data:
     GET  /api/opportunities/{id}
     GET  /api/applications/me            (already-applied state, JWT only)
     POST /api/opportunities/{id}/apply   (Stage 2.9 apply)
   - id comes from the URL (?id=<real database id>) — never title/company.
   - Only fields actually returned by the API are rendered; anything the
     API does not return is hidden, never fabricated (no mock fallback).
   - Skills render as "Name — Level · Importance" (no raw database ids).
   - Eligibility / skill match / missing skills are ONLY the server's own
     values (my_eligible / my_match / my_*_skills); this file never
     recomputes eligibility and never invents a match percentage.
   - The Apply button is a strict state machine:
       Apply Now -> Applying... -> Applied (disabled, survives refresh)
     with exactly one POST per click (duplicate guard) and server answers
     (409 duplicate / not-eligible / deadline, 401/403/404/422/500) mapped
     to friendly copy — no traceback, SQL or raw JSON is ever shown.
   - Identity/role come from the JWT only; student ids are never sent.
   ===================================================================== */
(function () {
"use strict";

var API = window.SkillShareAPI;
var AUTH = window.SkillShareAuth;

var S = {
  id: null,
  user: null,
  role: "",
  busy: false,           // detail request in flight
  applying: false,       // apply POST in flight (duplicate-click guard)
  applyChecking: false,  // /api/applications/me lookup in flight
  applyChecked: false,   // lookup finished for this load
  myApplication: null,   // real application row for this opportunity (or null)
  opportunity: null,     // last rendered detail payload
  serverClosedMsg: null, // server-declared "cannot apply" reason (409s)
  applyMsg: "",          // success copy shown while the state is "applied"
  applyError: ""         // transient error copy, cleared on the next attempt
};

/* Mirrors the backend's ApplicationCreateIn cap (COVER_NOTE_MAX = 2000). */
var COVER_NOTE_MAX = 2000;
/* Bounded already-applied walk over GET /api/applications/me: pages of 50,
   at most 4 pages (200 rows) — never an unbounded or oversized request. */
var APP_PAGE_LIMIT = 50;
var APP_PAGE_MAX = 4;

var TYPES = ["internship", "job", "placement", "apprenticeship", "mini_project", "part_time"];
var TYPE_LABELS = {
  internship: "Internship", job: "Full-time", placement: "Placement",
  apprenticeship: "Apprenticeship", mini_project: "Mini project", part_time: "Part-time"
};
var MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };

/* Application status labels — the same vocabulary applications.js uses.
   Legacy "under_review" is read-only and displayed as "Reviewing". */
var APP_STATUS_META = {
  applied:      { label: "Applied",     badge: "blue" },
  reviewing:    { label: "Reviewing",   badge: "blue" },
  under_review: { label: "Reviewing",   badge: "blue" },
  shortlisted:  { label: "Shortlisted", badge: "purple" },
  interview:    { label: "Interview",   badge: "amber" },
  selected:     { label: "Selected",    badge: "green" },
  rejected:     { label: "Rejected",    badge: "red" },
  withdrawn:    { label: "Withdrawn",   badge: "grey" }
};

/* ---------------- helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clean(v) { return v == null ? "" : String(v).trim(); }
function show(el, on) { if (el) el.hidden = !on; }
function msgFor(e) {
  var st = e && e.status;
  if (st === 401) return "Your session has expired. Please sign in again.";
  if (st === 403) return "You don't have permission to view this opportunity.";
  if (st === 404) return "This opportunity could not be found.";
  if (st === 409) return "Unable to complete this action because the opportunity state has changed.";
  if (st === 422) return "Please check the opportunity information.";
  if (st === 0 || (st && st >= 500)) return "Something went wrong. Please try again.";
  return (e && (e.detail || e.message)) || "Something went wrong.";
}
function typeLabel(t) { t = clean(t).toLowerCase(); return TYPE_LABELS[t] || (t ? t : "--"); }
function modeLabel(m) { m = clean(m).toLowerCase(); return MODE_LABELS[m] || ""; }
/* Coercion that never turns null / undefined / "" into 0 (same rule as
   opportunities.js Stage 2.8): a value the API did not send stays "unknown". */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
function titleCase(s) {
  s = clean(s).toLowerCase();
  if (!s) return "";
  return s.replace(/(^|[\s\-_])([a-z])/g, function (m, p1, p2) { return p1 + p2.toUpperCase(); });
}
function appStatusLabel(st) {
  var key = clean(st).toLowerCase();
  if (APP_STATUS_META[key]) return APP_STATUS_META[key].label;
  return key ? titleCase(key) : "Applied";
}
function toastMsg(msg) {
  if (window.portalToast) { window.portalToast(msg); return; }
  var root = $("toast-root");
  if (!root) return;
  var t = document.createElement("div");
  t.className = "toast success";
  t.setAttribute("role", "status");
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(function () { t.remove(); }, 2600);
}
function fmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  try { return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch (e) { return String(iso).slice(0, 10); }
}
function statusBadge(st) {
  st = clean(st).toLowerCase();
  if (st === "published") return '<span class="badge green">Published</span>';
  if (st === "closed") return '<span class="badge grey">Closed</span>';
  if (st === "draft") return '<span class="badge amber">Draft</span>';
  return "";
}
function showState(which) {   /* loading | empty | error | data */
  show($("oppLoading"), which === "loading");
  show($("oppEmpty"), which === "empty");
  show($("oppError"), which === "error");
  show($("oppHead"), which === "data");
  show($("oppBody"), which === "data");
}
function showError(m) {
  showState("error");
  var el = $("oppErrorMsg");
  if (el) el.textContent = m || "Something went wrong. Please try again.";
}

/* ---------------- render ---------------- */
function factRow(icon, label, value) {
  if (!clean(value)) return "";
  return '<div class="opp-fact"><span class="opp-ico">' + icon + '</span><div class="grow">' +
    "<h3>" + esc(label) + "</h3><p>" + esc(value) + "</p></div></div>";
}
function renderSkills(o) {
  var skills = (o && o.skills) || [];
  var wrap = $("oppSkillsWrap"), host = $("oppSkills");
  if (!wrap || !host) return;
  /* Only skills the backend actually names are rendered; an unnamed link
     (orphan skill row) is skipped rather than exposing an internal id. */
  var items = skills.filter(function (s) { return s && clean(s.skill_name); });
  if (!items.length) { show(wrap, false); return; }
  host.innerHTML = items.map(function (s) {
    var bits = [];
    var lvl = titleCase(s.required_level);
    if (lvl) bits.push(lvl);
    if (clean(s.importance)) bits.push(titleCase(s.importance) + " importance");
    if (clean(s.skill_type) === "preferred") bits.push("Preferred");
    return '<span class="opp-skill"><b>' + esc(clean(s.skill_name)) + "</b>" +
      (bits.length ? "<small>· " + esc(bits.join(" · ")) + "</small>" : "") + "</span>";
  }).join("");
  show(wrap, true);
}
function gradYearText(o) {
  var allowed = clean(o.allowed_graduation_years);
  if (allowed) return allowed;
  var lo = o.min_graduation_year, hi = o.max_graduation_year;
  if (lo != null && hi != null) return lo + " – " + hi;
  if (lo != null) return "From " + lo;
  if (hi != null) return "Up to " + hi;
  return "";
}
function renderEligibility(o) {
  var wrap = $("oppEligibilityWrap"), host = $("oppEligibility");
  if (!wrap || !host) return;
  var rows = [];
  if (clean(o.eligibility_text)) {
    rows.push('<div class="opp-fact"><span class="opp-ico">📝</span><div class="grow"><h3>Notes</h3><p style="white-space:pre-wrap">' +
      esc(o.eligibility_text) + "</p></div></div>");
  }
  rows.push(factRow("🎯", "Minimum CGPA", o.min_cgpa != null ? o.min_cgpa + " / 10" : ""));
  rows.push(factRow("🎓", "Graduation year", gradYearText(o)));
  rows.push(factRow("📜", "Degree", clean(o.eligible_degree).split(",").map(function (x) { return x.trim(); }).filter(Boolean).join(", ")));
  rows.push(factRow("🧭", "Branch", clean(o.eligible_branch).split(",").map(function (x) { return x.trim(); }).filter(Boolean).join(", ")));
  rows = rows.filter(Boolean);
  if (!rows.length) { show(wrap, false); return; }
  host.innerHTML = rows.join("");
  show(wrap, true);
}
function render(payload) {
  var p = payload || {};
  /* The detail endpoint returns { opportunity: {...}, my_*: {...} } for
     students; a bare opportunity object is accepted too (older callers). */
  var o = p.opportunity || p;
  S.opportunity = o;
  var mine = personalization(p, o);
  var eyebrow = [];
  if (clean(o.company_name)) eyebrow.push(clean(o.company_name));
  var tl = typeLabel(o.opportunity_type);
  if (tl !== "--") eyebrow.push(tl);
  if (modeLabel(o.work_mode)) eyebrow.push(modeLabel(o.work_mode));
  if (clean(o.location)) eyebrow.push(clean(o.location));
  $("oppEyebrow").textContent = eyebrow.length ? eyebrow.join(" · ") : "Opportunity";
  $("oppTitle").textContent = clean(o.title) || "Untitled role";
  var desc = clean(o.description);
  $("oppSummary").textContent = desc.length > 180 ? desc.slice(0, 179) + "…" : desc;
  $("oppDescription").textContent = desc || "No description provided.";

  var badges = "";
  if (tl !== "--") badges += '<span class="badge blue">' + esc(tl) + "</span> ";
  var match = num(mine.match && mine.match.match_percentage);
  if (match != null) badges += '<span class="badge green">' + Math.round(match) + "% skill match</span> ";
  badges += statusBadge(o.status);
  $("oppBadges").innerHTML = badges;

  show($("oppResponsibilitiesWrap"), !!clean(o.responsibilities));
  $("oppResponsibilities").textContent = clean(o.responsibilities);
  renderSkills(o);
  renderEligibility(o);
  renderMatch(mine);
  renderApplyPanel();

  var facts = [
    factRow("📍", "Location", clean(o.location)),
    factRow("🏢", "Work mode", modeLabel(o.work_mode)),
    factRow("🗓", "Duration", clean(o.duration)),
    factRow("💰", "Compensation", clean(o.compensation)),
    factRow("👥", "Openings", o.openings != null ? o.openings : ""),
    factRow("⏰", "Application deadline", fmtDate(o.deadline)),
    factRow("🚀", "Start date", fmtDate(o.start_date))
  ].filter(Boolean);
  $("oppFacts").innerHTML = facts.length
    ? facts.join("")
    : '<p class="muted">No extra details were provided.</p>';

  /* Company: display-only name from the server (never an ownership key). */
  var company = clean(o.company_name);
  show($("oppCompanyPanel"), !!company);
  if (company) $("oppCompanyText").textContent =
    "This opportunity is posted by " + company + ".";
  show($("oppManageNote"), S.role === "recruiter");
  showState("data");
}

/* ---------------- data ---------------- */
function readId() {
  var raw = "";
  try { raw = new URLSearchParams(window.location.search).get("id") || ""; } catch (e) { raw = ""; }
  raw = clean(raw);
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) return null;
  return Number(raw);
}
function load() {
  if (S.busy) return Promise.resolve();
  var id = readId();
  if (!id) {
    S.id = null;
    showState("empty");
    return Promise.resolve();
  }
  S.id = id;
  S.busy = true;
  S.myApplication = null;
  S.applyChecked = false;
  S.serverClosedMsg = null;
  showState("loading");
  return API.getOpportunity(id).then(function (res) {
    render(res || null);
    /* Already-applied state comes from the real application list (JWT),
       never from localStorage — only students on a published opportunity
       (the apply panel is hidden for every other state). */
    if ((S.opportunity || {}).status === "published") {
      return checkMyApplication();
    }
  }).catch(function (e) { showError(msgFor(e)); })
    .then(function () { S.busy = false; });
}

/* =====================================================================
   STAGE 2.9 — server-authored match + student apply flow.
   The backend stays authoritative: this code renders the server's
   my_eligible / my_match / my_* values and reflects what POST /apply
   answers. It never recomputes eligibility and never sends student ids.
   ===================================================================== */

/* Personalization keys sit on the payload ROOT for students (the backend
   adds my_* next to opportunity); a bare opportunity object is accepted. */
function personalization(p, o) {
  function pick(key) { return p[key] !== undefined ? p[key] : o[key]; }
  return {
    eligible: pick("my_eligible"),
    match: pick("my_match") || null,
    matched: pick("my_matched_skills") || [],
    missing: pick("my_missing_skills") || [],
    partial: pick("my_partial_skills") || [],
    reasons: pick("my_eligibility_reasons") || [],
    checks: pick("my_eligibility") || null
  };
}

function deadlinePassed(o) {
  if (!o || !clean(o.deadline)) return false;
  var d = new Date(o.deadline);
  return !isNaN(d.getTime()) && d.getTime() < Date.now();
}

function skillNames(list, onlyType) {
  var out = [];
  (list || []).forEach(function (s) {
    if (!s || !clean(s.skill_name)) return;
    if (onlyType && clean(s.skill_type) !== onlyType) return;
    out.push(clean(s.skill_name));
  });
  return out;
}

function skillChips(list, kind) {
  return (list || [])
    .filter(function (s) { return s && clean(s.skill_name); })
    .map(function (s) {
      var bits = [];
      if (kind === "matched" && clean(s.student_level)) bits.push("Your level: " + titleCase(s.student_level));
      if (clean(s.required_level)) bits.push(titleCase(s.required_level));
      if (kind === "partial" && s.gap_levels != null && num(s.gap_levels) != null) {
        bits.push("Gap: " + num(s.gap_levels) + (num(s.gap_levels) === 1 ? " level" : " levels"));
      }
      if (kind === "matched" && clean(s.evidence_label)) bits.push(clean(s.evidence_label));
      return '<span class="opp-skill"><b>' + esc(clean(s.skill_name)) + "</b>" +
        (bits.length ? "<small>· " + esc(bits.join(" · ")) + "</small>" : "") + "</span>";
    }).join("");
}

function matchList(label, chips) {
  if (!chips) return "";
  return '<div class="opp-match-list mt"><span class="lab">' + esc(label) + "</span>" + chips + "</div>";
}

/* Renders ONLY the server's own match/eligibility data; without it the
   whole panel stays hidden (never a locally computed score). */
function renderMatch(mine) {
  var wrap = $("oppMatchWrap");
  if (!wrap) return;
    var hasAny = mine && (
    mine.eligible === true || mine.eligible === false ||
    (mine.match && mine.match.match_percentage != null) ||
    (mine.matched || []).length > 0 || (mine.missing || []).length > 0 ||
    (mine.partial || []).length > 0 || (mine.reasons || []).length > 0 ||
    (mine.checks && typeof mine.checks === "object" && Object.keys(mine.checks).length)
  );
  if (!hasAny) { show(wrap, false); return; }
  show(wrap, true);

  var pct = num(mine.match && mine.match.match_percentage);
  if (pct != null) {
    $("oppMatchBarFill").style.width = Math.max(0, Math.min(100, Math.round(pct))) + "%";
    $("oppMatchPct").textContent = Math.round(pct) + "%";
    show($("oppMatchScore"), true);
  } else {
    show($("oppMatchScore"), false);
  }

  var badges = "";
  if (mine.eligible === true) badges += '<span class="badge green">Eligible</span>';
  else if (mine.eligible === false) badges += '<span class="badge amber">Not currently eligible</span>';
  $("oppMatchBadges").innerHTML = badges;

  var lists = "";
  var matched = (mine.matched || []).filter(function (s) { return s && clean(s.skill_name); });
  var partial = (mine.partial || []).filter(function (s) { return s && clean(s.skill_name); });
  var missing = (mine.missing || []).filter(function (s) { return s && clean(s.skill_name); });
  if (matched.length) lists += matchList("Matched skills", skillChips(matched, "matched"));
  if (partial.length) lists += matchList("Partial skills", skillChips(partial, "partial"));
  if (missing.length) lists += matchList("Missing skills", skillChips(missing, "missing"));
  var listsEl = $("oppMatchLists");
  if (lists) { listsEl.innerHTML = lists; show(listsEl, true); } else show(listsEl, false);

  /* Server-authored reasons only — the UI never derives its own verdict. */
  var rows = "";
  (mine.reasons || []).forEach(function (r) {
    if (!clean(r)) return;
    rows += '<div class="opp-match-reason"><span class="ico">•</span><p>' + esc(clean(r)) + "</p></div>";
  });
  var rWrap = $("oppMatchReasonsWrap");
  if (rows) { $("oppMatchReasons").innerHTML = rows; show(rWrap, true); } else show(rWrap, false);

    var dis = $("oppMatchDisclaimer");
  if (dis) dis.hidden = false;

  /* Per-check evidence (CGPA / degree / branch / graduation_year), sourced
     from the server's eligibility object — never computed client-side. */
  var checksEl = $("oppMatchChecks"), body = "";
  var checks = mine.checks || {};
  if (checks && typeof checks === "object" && Object.keys(checks).length) {
    function checkRow(label, sub) {
      var req = sub.required, act = sub.actual, passed = sub.passed;
      if (passed === true) return ""; /* only surface failed / mixed checks */
      var rv = (req != null) ? esc(req) : "—";
      var av = (act != null && clean(act) !== "") ? esc(act) : "—";
      return '<div class="opp-check"><span class="check-ico fail">✕</span><div class="check-meta"><h4>' +
             esc(label) + '</h4><p>' + rv + " required</p><p>" + av + " (yours)</p></div></div>";
    }
    body += checkRow("CGPA", checks.cgpa || {});
    if (checks.degree) body += checkRow("Degree", checks.degree || {});
    if (checks.branch) body += checkRow("Branch", checks.branch || {});
    if (checks.graduation_year) body += checkRow("Graduation year", checks.graduation_year || {});
  }
  if (body) { checksEl.innerHTML = body; show(checksEl, true); } else show(checksEl, false);
}

/* ---------------- apply panel ---------------- */

function applyPanelVisible() {
  if (S.role !== "student") return false;
  var o = S.opportunity || {};
  return clean(o.status) === "published";
}

/* Single source of truth for the panel state, derived from REAL data:
   the application row (from /api/applications/me), the server verdict
   (my_eligible), the server-declared closed reason and the deadline. */
function desiredApplyState() {
  if (!applyPanelVisible()) return "hidden";
  if (S.myApplication) return "applied";
  if (S.applying) return "applying";
  if (S.serverClosedMsg) return "closed";
  var o = S.opportunity || {};
  if (deadlinePassed(o)) return "closed";
  if (o.my_eligible === false) return "ineligible";
  return "idle";
}

function applyStateRow(state) {
  if (state === "applied") {
    var st = clean(S.myApplication && S.myApplication.status).toLowerCase() || "applied";
    var meta = APP_STATUS_META[st] || { label: appStatusLabel(st), badge: "blue" };
    return '<div class="row-item"><span class="opp-ico">✅</span><div class="grow"><h3>Status</h3><p>Status: ' +
      esc(meta.label) + '</p></div><span class="badge ' + meta.badge + '">' + esc(meta.label) + "</span></div>";
  }
  if (state === "ineligible") {
    return '<div class="row-item"><span class="opp-ico">⛔</span><div class="grow"><h3>Status</h3><p>Not currently eligible</p></div></div>';
  }
  if (state === "closed") {
    return '<div class="row-item"><span class="opp-ico">🔒</span><div class="grow"><h3>Status</h3><p>Applications closed</p></div></div>';
  }
  return '<div class="row-item"><span class="opp-ico">📝</span><div class="grow"><h3>Status</h3><p>Not applied yet</p></div></div>';
}

/* Server data only — never invented reasons. */
function ineligibleMsg() {
  var o = S.opportunity || {};
  var reasons = (o.my_eligibility_reasons || []).filter(function (r) { return clean(r); });
  if (reasons.length) return reasons.slice(0, 3).join(" · ");
  var missingReq = skillNames(o.my_missing_skills, "required");
  if (missingReq.length) {
    var shown = missingReq.slice(0, 3).join(", ");
    return "Missing required skills: " + shown +
      (missingReq.length > 3 ? " +" + (missingReq.length - 3) + " more" : "");
  }
  return "You are not currently eligible for this opportunity.";
}

function setApplyMsg(text, tone) {
  var el = $("oppApplyMsg");
  if (!el) return;
  if (!text) { el.textContent = ""; el.hidden = true; el.className = "opp-apply-msg"; return; }
  el.textContent = text;
  el.className = "opp-apply-msg" + (tone ? " " + tone : "");
  el.hidden = false;
}

function renderApplyPanel() {
  var wrap = $("oppApplyWrap");
  if (!wrap) return;
  var state = desiredApplyState();
  show(wrap, state !== "hidden");
  if (state === "hidden") { setApplyMsg("", ""); return; }

  var btn = $("oppApplyBtn");
  var actions = $("oppApplyActions");
  var coverWrap = $("oppCoverNoteWrap");
  var link = $("oppApplyLink");
  var noteEl = $("oppApplyNote");
  if (noteEl) noteEl.hidden = true;
  $("oppApplyState").innerHTML = applyStateRow(state);

  if (state === "idle" || state === "applying") {
    show(actions, true);
    show(coverWrap, true);
    show(link, false);
    if (btn) {
      btn.disabled = state === "applying";
      btn.textContent = state === "applying" ? "Applying…" : "Apply Now";
    }
    if (state === "applying") {
      setApplyMsg("", "");
    } else if (S.applyError) {
      setApplyMsg(S.applyError, "err");
    } else if ((S.opportunity || {}).my_eligible === true) {
      setApplyMsg("You are eligible to apply.", "ok");
    } else {
      setApplyMsg("", "");
    }
  } else if (state === "applied") {
    show(actions, true);
    show(coverWrap, false);
    show(link, true);
    if (btn) { btn.disabled = true; btn.textContent = "Applied"; }
    setApplyMsg(S.applyMsg || "", S.applyMsg ? "ok" : "");
  } else if (state === "ineligible") {
    show(actions, true);
    show(coverWrap, false);
    show(link, false);
    if (btn) { btn.disabled = true; btn.textContent = "Apply Now"; }
    setApplyMsg(ineligibleMsg(), "warn");
    if (noteEl) {
      noteEl.textContent = "Update your profile or skills, then reload this page to re-check.";
      noteEl.hidden = false;
    }
  } else { /* closed: deadline passed, closed opportunity or blocked re-apply */
    show(actions, true);
    show(coverWrap, false);
    show(link, false);
    if (btn) { btn.disabled = true; btn.textContent = "Apply Now"; }
    setApplyMsg(S.serverClosedMsg || "Applications for this opportunity are closed.", "warn");
  }
}

function updateCoverCount() {
  var ta = $("oppCoverNote"), el = $("oppCoverCount");
  if (!ta || !el) return;
  var len = String(ta.value || "").length;
  el.textContent = len + " / " + COVER_NOTE_MAX;
  el.className = len > COVER_NOTE_MAX ? "over" : "";
}

function markApplied(app, msg) {
  S.myApplication = app || S.myApplication || { status: "applied" };
  S.applyMsg = msg || "";
  renderApplyPanel();
}

function applyNow() {
  /* Duplicate guard: a second click while a POST is in flight is ignored,
     and a completed application never triggers another POST. */
  if (S.applying || desiredApplyState() !== "idle") return;
  var btn = $("oppApplyBtn");
  S.applying = true;
  S.applyError = "";
  if (btn) { btn.disabled = true; btn.textContent = "Applying…"; }
  setApplyMsg("", "");
  var noteEl = $("oppCoverNote");
  var payload = {};
  var note = noteEl ? clean(noteEl.value) : "";
  if (note) payload.cover_note = note;
  API.applyToOpportunity(S.id, payload).then(function (res) {
    S.applyMsg = "Application submitted successfully.";
    markApplied((res && res.application) || null, S.applyMsg);
    toastMsg("Application submitted successfully.");
  }).catch(function (e) {
    handleApplyError(e);
  }).then(function () {
    S.applying = false;
    renderApplyPanel();
  });
}

/* Server detail strings are used verbatim only when they are plain text;
   structured payloads are read field-by-field. Raw JSON is never shown. */
function serverDetailText(e) {
  var d = e && e.detail;
  if (typeof d === "string" && clean(d)) return clean(d);
  if (d && typeof d === "object" && clean(d.message)) return clean(d.message);
  var p = (e && e.payload) || null;
  var inner = p && p.detail;
  if (typeof inner === "string" && clean(inner)) return clean(inner);
  if (inner && typeof inner === "object" && clean(inner.message)) return clean(inner.message);
  return "";
}

function handleApplyError(e) {
  var st = e && e.status;
  if (st === 409) { apply409(e); return; }
  if (st === 401) { S.applyError = "Your session has expired. Please sign in again."; return; }
  if (st === 403) { S.applyError = "You don't have permission to perform this action."; return; }
  if (st === 404) { S.applyError = "This opportunity could not be found."; return; }
  if (st === 422) { S.applyError = "Please check your application information."; return; }
  S.applyError = "Something went wrong. Please try again.";
}

function apply409(e) {
  var d = e && e.detail;
  if (d && typeof d === "object") {
    /* Structured not-eligible answer: adopt the server's own verdict and
       reasons, then let the panel explain them. */
    var o = S.opportunity || (S.opportunity = {});
    o.my_eligible = false;
    if (d.missing_skills) o.my_missing_skills = d.missing_skills;
    if (d.eligibility_reasons) o.my_eligibility_reasons = d.eligibility_reasons;
    if (d.eligibility && !o.my_eligibility) o.my_eligibility = d.eligibility;
    if (d.match_percentage != null && !o.my_match) {
      o.my_match = { match_percentage: d.match_percentage };
    }
    /* The adopted server verdict also refreshes the "Your match" panel so
       the student sees the same missing skills / reasons in both places. */
    try { renderMatch(personalization({}, o)); } catch (err) { /* best effort */ }
    renderApplyPanel();
    return;
  }
  var text = serverDetailText(e);
  var low = (text || "").toLowerCase();
  if (low.indexOf("already applied") !== -1) {
    /* Duplicate protection: reflect the real state, never POST again. */
    S.applyMsg = text || "You have already applied to this opportunity.";
    markApplied(null, S.applyMsg);
    checkMyApplication(true);   // pull the real row for the exact status
    return;
  }
  if (low.indexOf("deadline") !== -1) {
    S.serverClosedMsg = "Applications for this opportunity are closed.";
  } else if (low.indexOf("withdrew") !== -1 || low.indexOf("reapplying") !== -1) {
    S.serverClosedMsg = text || "Reapplying is not supported for this opportunity.";
  } else if (low.indexOf("closed") !== -1 || low.indexOf("published") !== -1) {
    S.serverClosedMsg = text || "This opportunity is closed and no longer accepts applications.";
  } else {
    S.serverClosedMsg = text || "You cannot apply to this opportunity right now.";
  }
  renderApplyPanel();
}

/* Already-applied detection from the REAL application list (JWT identity).
   Bounded walk: pages of 50, at most 4 pages. A lookup failure never blocks
   the page — the server's answer to POST /apply stays authoritative. */
function checkMyApplication(force) {
  if (S.role !== "student" || !S.id) return Promise.resolve();
  if (S.applyChecking) return Promise.resolve();
  if (S.applyChecked && !force) return Promise.resolve();
  /* Stage 2.7 harness (and any partial stub) only mocks getOpportunity:
     a missing wrapper must never flip a good page into the error state. */
  if (!API || typeof API.getMyApplications !== "function") {
    S.applyChecking = false;
    S.applyChecked = true;
    try { renderApplyPanel(); } catch (e) { /* panel is best-effort */ }
    return Promise.resolve();
  }
  S.applyChecking = true;
  var offset = 0, pages = 0;
  function walk() {
    return API.getMyApplications({ limit: APP_PAGE_LIMIT, offset: offset }).then(function (data) {
      var rows = (data && (data.applications || data.items)) || [];
      var found = null;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r && Number(r.opportunity_id) === Number(S.id)) { found = r; break; }
      }
      if (found) {
        S.myApplication = found;
        S.applyChecking = false;
        S.applyChecked = true;
        renderApplyPanel();
        return;
      }
      pages += 1;
      if (Boolean(data && data.has_more) && pages < APP_PAGE_MAX) {
        offset += rows.length || APP_PAGE_LIMIT;
        return walk();
      }
      S.applyChecking = false;
      S.applyChecked = true;
      renderApplyPanel();
    }).catch(function () {
      S.applyChecking = false;
      S.applyChecked = true;
      renderApplyPanel();
    });
  }
  return walk();
}

/* ---------------- boot ---------------- */
function boot() {
  if (!API) { showError("API client failed to load."); return Promise.resolve(); }
  function afterUser() {
    if (S.role === "recruiter") {
      var back = $("oppBackLink");
      if (back) back.href = "jobs.html";
      if (back) back.textContent = "← Back to Jobs";
    }
    return load();
  }
  if (AUTH && AUTH.requireUser) {
    return AUTH.requireUser().then(function (u) {
      S.user = u;
      S.role = clean((u && u.role) || "").toLowerCase();
      return afterUser();
    }).catch(function (e) {
      /* 401 already triggers the global auth-expired redirect; other
         errors surface through the retry UI. */
      if (e && e.status === 401) return;
      showError(msgFor(e));
    });
  }
  var u = API.getUser ? API.getUser() : null;
  S.user = u;
  S.role = clean((u && u.role) || "").toLowerCase();
  return afterUser();
}

document.addEventListener("DOMContentLoaded", function () {
  var retry = $("oppRetry");
  if (retry) retry.addEventListener("click", function () { load(); });
  var browse = $("oppEmptyBrowse");
  if (browse && S.role === "recruiter") browse.href = "jobs.html";
  /* Apply + cover note: bound once; the counter is pure DOM (no requests). */
  var applyBtn = $("oppApplyBtn");
  if (applyBtn) applyBtn.addEventListener("click", applyNow);
  var cover = $("oppCoverNote");
  if (cover) cover.addEventListener("input", updateCoverCount);
  updateCoverCount();
  boot();
});

window.__opportunityDetails = {
  state: S,
  load: load,
  render: render,
  msgFor: msgFor,
  readId: readId,
  applyNow: applyNow,
  checkMyApplication: checkMyApplication,
  desiredApplyState: desiredApplyState
};
})();


