/* =====================================================================
   SKILLSHARE — STUDENT OPPORTUNITY DISCOVERY (Stage 2.8)
   Wires the EXISTING opportunities.html to the real backend:

     * GET /api/opportunities                  (published-only discovery)
     * GET /api/opportunities/me/recommended   (server-side eligibility
                                               + skill match, Stage 2.4)

   Rules (Stage 2.8):
     * no mock rows: every value rendered comes from the API; anything
       the API does not return is hidden, never fabricated
       (no "undefined" / "null" / "NaN" ever reaches the DOM)
     * the backend owns eligibility + ranking — this file never computes
       an eligibility verdict or an invented score
     * search is debounced server-side (300ms); no request per keystroke
     * pagination uses limit/offset + has_more (limit <= 100)
     * detail navigation is always opportunity-details.html?id=<id>
     * the Apply flow is Stage 2.9 and is intentionally NOT wired here
     * identity/role comes only from the JWT (/me); query parameters and
       localStorage are never trusted for student identity
    ===================================================================== */
(function () {
"use strict";

var API = window.SkillShareAPI;
var AUTH = window.SkillShareAuth;

var PAGE_SIZE = 20;               /* backend default; cap is 100 */
var SEARCH_DEBOUNCE_MS = 300;

var TYPE_LABELS = {
  internship: "Internship", job: "Full-time", placement: "Placement",
  apprenticeship: "Apprenticeship", mini_project: "Mini project", part_time: "Part-time"
};
var MODE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" };
var BADGE_BY_TYPE = {
  internship: "blue", job: "green", placement: "purple",
  apprenticeship: "purple", mini_project: "amber", part_time: "amber"
};

/* ---------------- state ---------------- */
var S = {
  user: null, role: "", roleReady: false,
  booted: false, listBusy: false, recoBusy: false,
  listToken: 0, recoToken: 0,
  listLoaded: false, recoLoaded: false,
  listError: false, recoError: false,
  listTotal: null, recoTotal: 0,
  listOffset: 0, recoOffset: 0,
  listRendered: 0,                  /* rows currently in the DOM */
  listRows: [], recoRows: [],
  listHasMore: false, recoHasMore: false,
  q: "", type: "", mode: "", company: "", location: "",
  sort: "newest",
  recoErrorMsg: "", recoDisclaimer: "", recoHint: "",
  searchTimer: null
};
/* Test hook (same convention as window.__jobs) */
window.__opportunitiesExplore = { state: S };

/* ---------------- tiny helpers ---------------- */
function $(id) { return document.getElementById(id); }
function esc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clean(v) { return v == null ? "" : String(v).trim(); }
function show(el, on) { if (el) el.hidden = !on; }
function typeLabel(t) { t = clean(t).toLowerCase(); return TYPE_LABELS[t] || (t ? t : ""); }
function modeLabel(m) { m = clean(m).toLowerCase(); return MODE_LABELS[m] || ""; }
function badgeForType(t) { return BADGE_BY_TYPE[clean(t).toLowerCase()] || "blue"; }
/* Coercion that never turns null / undefined / "" into 0: a value the API
   did not send must stay "unknown" (rendered as nothing or "—"), never 0. */
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
function matchPct(r) { var n = num(r && r.match_percentage); return n == null ? null : Math.round(n); }
function fmtDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0, 10);
  try { return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); }
  catch (e) { return String(iso).slice(0, 10); }
}
/* Deadline bucket for the deterministic client-side "Deadline soonest"
   sort of the LOADED page. Rows without a deadline sort last. */
function deadlineKey(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  var d = new Date(iso);
  return isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime();
}
function rowSkills(r) {
  return ((r && r.skills) || [])
    .map(function (s) { return clean(s && s.skill_name); })
    .filter(Boolean);
}
/* Friendly error routing (same copy style as jobs.js). */
function msgFor(e) {
  var st = e && e.status;
  if (st === 401) return "Your session has expired. Please sign in again.";
  if (st === 403) return "Personalized matches need a student account.";
  if (st === 422) return "Please check the selected filters.";
  if (st === 0 || (st && st >= 500)) return "Something went wrong. Please try again.";
  return (e && (e.detail || e.message)) || "Something went wrong. Please try again.";
}

/* ---------------- shared card pieces ---------------- */
function subLine(r) {
  var parts = [];
  if (clean(r.company_name)) parts.push(clean(r.company_name));
  var tl = typeLabel(r.opportunity_type);
  if (tl) parts.push(tl);
  if (modeLabel(r.work_mode)) parts.push(modeLabel(r.work_mode));
  if (clean(r.location)) parts.push(clean(r.location));
  return parts.join(" · ");
}
function metaHtml(r) {
  var bits = [];
  if (r.openings != null && num(r.openings) != null) {
    bits.push('<span><b>Openings</b><span>' + esc(num(r.openings)) + "</span></span>");
  }
  if (clean(r.duration)) bits.push('<span><b>Duration</b><span>' + esc(clean(r.duration)) + "</span></span>");
  if (clean(r.compensation)) bits.push('<span><b>Compensation</b><span>' + esc(clean(r.compensation)) + "</span></span>");
  if (clean(r.deadline)) bits.push('<span><b>Deadline</b><span>' + esc(fmtDate(r.deadline)) + "</span></span>");
  return bits.join("");
}
function skillsHtml(r) {
  var names = rowSkills(r);
  if (!names.length) return "";
  var showN = Math.min(names.length, 4);
  var html = '<div class="opp-skills"><span class="opp-skills-label">Skills</span>';
  for (var i = 0; i < showN; i++) html += '<span class="tag">' + esc(names[i]) + "</span>";
  if (names.length > showN) html += '<span class="muted">+' + (names.length - showN) + " more</span>";
  return html + "</div>";
}
function viewLink(id) {
  return '<a class="btn small primary" href="opportunity-details.html?id=' + encodeURIComponent(id) + '">View opportunity</a>';
}
function baseCard(inner) { return '<article class="panel opp-card">' + inner + "</article>"; }
function cardHead(r) {
  var tl = typeLabel(r.opportunity_type);
  return '<div class="opp-card-head"><div class="grow"><h3>' + esc(clean(r.title) || "Untitled role") + "</h3>" +
    (subLine(r) ? '<p class="opp-sub">' + esc(subLine(r)) + "</p>" : "") + "</div>" +
    (tl ? '<span class="badge ' + badgeForType(r.opportunity_type) + '">' + esc(tl) + "</span>" : "") + "</div>";
}
function listCardHtml(r) {
  /* Discovery card: real fields only — no fabricated match bar, because
     personalization exists only on the /me/recommended endpoint. */
  var inner = cardHead(r) + (metaHtml(r) ? '<div class="opp-meta">' + metaHtml(r) + "</div>" : "") + skillsHtml(r);
  return baseCard(inner + '<div class="opp-actions">' + viewLink(r.id) + "</div>");
}
/* Missing-skills line, straight from the server response — never invented. */
function missingHtml(r) {
  /* Only REQUIRED gaps are presented as "Missing:". The backend also
     reports optional ("preferred") gaps, which are not a requirement, so
     they are never shown as missing skills here. */
  var req = [];
  ((r && r.missing_skills) || []).forEach(function (s) {
    if (!s || !clean(s.skill_name)) return;
    if (clean(s.skill_type) === "preferred") return;
    req.push(clean(s.skill_name));
  });
  if (!req.length) return "";
  var shown = req.slice(0, 3);
  return '<p class="opp-missing">⚠ <span><b>Missing:</b> ' + esc(shown.join(", ")) +
    (req.length > shown.length ? " +" + (req.length - shown.length) + " more" : "") + "</span></p>";
}
function recoCardHtml(r) {
  var pct = matchPct(r);
  var inner = cardHead(r);
  var matchBits = [];
  if (pct != null) {
    matchBits.push('<div class="match" aria-label="Skill match"><div class="bar"><i style="width:' +
      Math.max(0, Math.min(100, pct)) + '%"></i></div>' + pct + "%</div>");
    matchBits.push('<span class="muted">Skill Match</span>');
  }
  if (r.eligible === true) matchBits.push('<span class="badge green">Eligible</span>');
  else if (r.eligible === false) matchBits.push('<span class="badge amber">Not currently eligible</span>');
  if (matchBits.length) inner += '<div class="opp-match">' + matchBits.join("") + "</div>";
  inner += skillsHtml(r);
  var miss = missingHtml(r);
  if (miss) inner += '<div class="opp-elig">' + miss + "</div>";
  inner += (metaHtml(r) ? '<div class="opp-meta">' + metaHtml(r) + "</div>" : "");
  return baseCard(inner + '<div class="opp-actions">' + viewLink(r.id) + "</div>");
}

/* ---------------- state switching + render ---------------- */
function listState(which) {
  show($("oppLoading"), which === "loading");
  show($("oppGrid"), which === "list");
  show($("oppEmpty"), which === "empty");
  show($("oppFilterEmpty"), which === "filter");
  show($("oppError"), which === "error");
}
function recoState(which) {
  show($("recoLoading"), which === "loading");
  show($("recoGrid"), which === "list");
  show($("recoEmpty"), which === "empty");
  show($("recoError"), which === "error");
}
function filtersActive() {
  return !!(S.q || S.type || S.mode || S.company || S.location);
}
function renderStats() {
  var open = $("oppStatOpen"), match = $("oppStatMatch"), elig = $("oppStatEligible"), eligSub = $("oppStatEligibleSub");
  if (open) open.textContent = S.listTotal == null ? "—" : String(S.listTotal);
  if (S.recoLoaded) {
    var pcts = S.recoRows.map(matchPct).filter(function (n) { return n != null; });
    var best = pcts.length ? Math.max.apply(null, pcts) : null;
    if (match) match.textContent = best == null ? "—" : best + "%";
    var eligCount = S.recoRows.filter(function (r) { return r.eligible === true; }).length;
    if (elig) elig.textContent = String(eligCount);
    if (eligSub) eligSub.textContent = "Eligible · of " + S.recoRows.length + " scored";
  } else {
    if (match) match.textContent = "—";
    if (elig) elig.textContent = "—";
    if (eligSub) eligSub.textContent = "Eligible for you";
  }
}
function setCount(shown) {
  var el = $("oppCount");
  if (!el) return;
  if (!S.listLoaded) { el.textContent = ""; return; }
  var filtered = filtersActive();
  var total = S.listTotal;
  if (total == null) { el.textContent = ""; return; }
  el.textContent = filtered
    ? shown + " shown · " + total + " matching published"
    : total + (total === 1 ? " published opportunity" : " published opportunities");
}
function renderList() {
  var grid = $("oppGrid");
  if (!S.listLoaded) { listState("loading"); return; }
  if (S.listError && !S.listRows.length) { listState("error"); return; }
  if (!S.listRows.length) {
    listState(filtersActive() ? "filter" : "empty");
    S.listRendered = 0;
    renderStats();
    setCount(0);
    show($("oppMore"), false);
    return;
  }
  var ordered = orderedRows();
  if (!S.listOffset) { grid.innerHTML = ""; S.listRendered = 0; }   /* fresh load */
  var fresh = ordered.slice(S.listRendered);   /* append only the new rows */
  grid.insertAdjacentHTML("beforeend", fresh.map(listCardHtml).join(""));
  S.listRendered = ordered.length;
  listState("list");
  renderStats();
  setCount(grid.querySelectorAll(".opp-card").length);
  show($("oppMore"), !!S.listHasMore);
  var note = $("oppSortNote");
  if (note && !S.listHasMore) show(note, false);
}
function renderRecoEmpty() {
  var msg = $("recoEmptyMsg"), actions = $("recoEmptyActions");
  var hint = clean(S.recoHint) || "Nothing to score yet — complete your student profile or add skills, then check back.";
  if (msg) msg.textContent = hint;
  show(actions, true);
}
function renderReco() {
  var grid = $("recoGrid");
  if (!S.recoLoaded && !S.recoError) { recoState("loading"); return; }
  if (S.recoError) {
    recoState("error");
    var m = $("recoErrorMsg");
    if (m) m.textContent = S.recoErrorMsg || "Something went wrong. Please try again.";
    renderStats();
    return;
  }
  if (!S.recoRows.length) {
    recoState("empty");
    renderRecoEmpty();
    var c = $("recoCount");
    if (c) c.textContent = "";
    renderStats();
    return;
  }
  if (!S.recoOffset) grid.innerHTML = "";
  grid.insertAdjacentHTML("beforeend", S.recoRows.map(recoCardHtml).join(""));
  recoState("list");
  var rc = $("recoCount");
  if (rc) rc.textContent = S.recoTotal === 1 ? "1 match" : S.recoTotal + " matches";
  renderStats();
  show($("recoMore"), !!S.recoHasMore);
  var d = $("recoDisclaimer");
  if (d && clean(S.recoDisclaimer)) { d.textContent = clean(S.recoDisclaimer); show(d, true); }
}

/* ---------------- data loading ---------------- */
function loadList(opts) {
  opts = opts || {};
  if (S.listBusy) return Promise.resolve();
  var append = !!opts.append;
  S.listBusy = true;
  if (!append) S.listOffset = 0;
  listState("loading");
  var token = ++S.listToken;
  var params = { limit: Math.min(PAGE_SIZE, 100), offset: S.listOffset };
  if (S.q) params.search = S.q;
  if (S.type) params.opportunity_type = S.type;
  if (S.mode) params.work_mode = S.mode;
  if (S.company) params.company = S.company;
  if (S.location) params.location = S.location;
  return Promise.resolve(API.listPublishedOpportunities(params)).then(function (data) {
    if (token !== S.listToken) return;                 /* stale response */
    var rows = (data && (data.opportunities || data.items)) || [];
    S.listRows = append ? S.listRows.concat(rows) : rows;
    S.listTotal = num(data && data.total) != null ? num(data.total) : S.listRows.length;
    S.listHasMore = !!(data && data.has_more);
    S.listLoaded = true;
    S.listError = false;
    applySort();
    renderList();
  }).catch(function (e) {
    if (token !== S.listToken) return;
    S.listError = true;
    S.listLoaded = true;              /* a failed load must not leave skeletons */
    S.listTotal = null;               /* unknown — never a fake 0 */
    S.listRendered = 0;
    if (!append) S.listRows = [];
    renderList();
    var m = $("oppErrorMsg");
    if (m) m.textContent = msgFor(e);
  }).then(function () { S.listBusy = false; });
}
/* "Newest" is the backend order (created_at DESC, id DESC) — the
   authoritative ranking, never recomputed here. "Deadline soonest"
   deterministically re-orders the LOADED page only: no invented scores,
   and the note discloses the page-only scope. */
function orderedRows() {
  if (S.sort !== "deadline") return S.listRows.slice();
  return S.listRows.slice().sort(function (a, b) {
    var ka = deadlineKey(a && a.deadline), kb = deadlineKey(b && b.deadline);
    if (ka !== kb) return ka - kb;
    return (num(a && a.id) || 0) - (num(b && b.id) || 0);
  });
}
function applySort() {
  var note = $("oppSortNote");
  if (!note) return;
  if (S.sort !== "deadline") { show(note, false); return; }
  note.textContent = "Sorted by deadline within the loaded results" +
    (S.listHasMore ? " — load more to include older pages." : ".");
  show(note, true);
}
function sortChanged() {
  applySort();
  var grid = $("oppGrid");
  if (grid && S.listLoaded && S.listRows.length && !S.listError) {
    var ordered = orderedRows();
    grid.innerHTML = "";
    grid.insertAdjacentHTML("beforeend", ordered.map(listCardHtml).join(""));
    S.listRendered = ordered.length;
  }
}
function loadReco(opts) {
  opts = opts || {};
  if (S.recoBusy) return Promise.resolve();
  var append = !!opts.append;
  S.recoBusy = true;
  if (!append) S.recoOffset = 0;
  recoState("loading");
  var token = ++S.recoToken;
  var params = { limit: Math.min(PAGE_SIZE, 100), offset: S.recoOffset };
  if (S.q) params.search = S.q;
  if (S.type) params.opportunity_type = S.type;
  if (S.mode) params.work_mode = S.mode;
  if (S.company) params.company = S.company;
  if (S.location) params.location = S.location;
  return Promise.resolve(API.getRecommendedOpportunities(params)).then(function (data) {
    if (token !== S.recoToken) return;
    var rows = (data && (data.opportunities || data.items)) || [];
    S.recoRows = append ? S.recoRows.concat(rows) : rows;
    S.recoTotal = num(data && data.total) != null ? num(data.total) : S.recoRows.length;
    S.recoHasMore = !!(data && data.has_more);
    S.recoLoaded = true;
    S.recoError = false;
    S.recoDisclaimer = clean(data && data.disclaimer);
    S.recoHint = "";                                   /* server ranking is authoritative */
    var hintEl = $("recoHint");
    if (hintEl) hintEl.textContent = "Ranked by the server: eligible first, then skill match, then deadline.";
    renderReco();
  }).catch(function (e) {
    if (token !== S.recoToken) return;
    S.recoError = true;
    S.recoLoaded = true;
    S.recoErrorMsg = msgFor(e);
    S.recoRows = [];
    renderReco();
  }).then(function () { S.recoBusy = false; });
}
/* Recommendations honour the same filters; discovery continues
   independently even when this endpoint fails (Stage 2.8 rule 24). */
function reloadReco() {
  if (S.role === "recruiter") return Promise.resolve();
  return loadReco();
}

/* ---------------- boot ---------------- */
function bind() {
  var search = $("oppSearch");
  if (search) {
    search.addEventListener("input", function () {
      if (S.searchTimer) clearTimeout(S.searchTimer);
      S.searchTimer = setTimeout(function () {
        S.searchTimer = null;
        S.q = clean(search.value);
        loadList();
        reloadReco();
      }, SEARCH_DEBOUNCE_MS);
    });
  }
  var type = $("oppTypeFilter");
  if (type) type.addEventListener("change", function () { S.type = clean(type.value); loadList(); reloadReco(); });
  var mode = $("oppModeFilter");
  if (mode) mode.addEventListener("change", function () { S.mode = clean(mode.value); loadList(); reloadReco(); });
  var company = $("oppCompanyFilter");
  if (company) {
    company.addEventListener("input", function () {
      if (S.searchTimer) clearTimeout(S.searchTimer);
      S.searchTimer = setTimeout(function () {
        S.searchTimer = null;
        S.company = clean(company.value);
        loadList();
        reloadReco();
      }, SEARCH_DEBOUNCE_MS);
    });
  }
  var location = $("oppLocationFilter");
  if (location) {
    location.addEventListener("input", function () {
      if (S.searchTimer) clearTimeout(S.searchTimer);
      S.searchTimer = setTimeout(function () {
        S.searchTimer = null;
        S.location = clean(location.value);
        loadList();
        reloadReco();
      }, SEARCH_DEBOUNCE_MS);
    });
  }
  var sort = $("oppSort");
  if (sort) sort.addEventListener("change", function () { S.sort = clean(sort.value) || "newest"; sortChanged(); });
  var more = $("oppMore");
  if (more) {
    more.addEventListener("click", function () {
      if (!S.listHasMore || S.listBusy) return;
      S.listOffset = S.listRows.length;
      loadList({ append: true });
    });
  }
  var recoMore = $("recoMore");
  if (recoMore) {
    recoMore.addEventListener("click", function () {
      if (!S.recoHasMore || S.recoBusy) return;
      S.recoOffset = S.recoRows.length;
      loadReco({ append: true });
    });
  }
  var retry = $("oppRetry");
  if (retry) retry.addEventListener("click", function () { loadList(); });
  var recoRetry = $("recoRetry");
  if (recoRetry) recoRetry.addEventListener("click", function () { loadReco(); });
  var clear = $("oppClearFilters");
  if (clear) {
    clear.addEventListener("click", function () {
      S.q = S.type = S.mode = S.company = S.location = "";
      if (search) search.value = "";
      if (type) type.value = "";
      if (mode) mode.value = "";
      if (company) company.value = "";
      if (location) location.value = "";
      loadList();
      reloadReco();
    });
  }
}
function boot() {
  if (S.booted) return;
  S.booted = true;
  if (!API || typeof API.listPublishedOpportunities !== "function") {
    listState("error");
    var m = $("oppErrorMsg");
    if (m) m.textContent = "API client failed to load.";
    return;
  }
  bind();
  /* Discovery is a public, published-only endpoint: it must load for
     every visitor. Personalization needs the JWT student, resolved by
     auth.js from /me — never from a query parameter or localStorage. */
  loadList();
  if (AUTH && typeof AUTH.requireUser === "function") {
    AUTH.requireUser().then(function (u) {
      S.user = u || null;
      S.role = clean((u && u.role) || "").toLowerCase();
      S.roleReady = true;
      if (S.role === "recruiter") {
        /* No recruiter controls on the student discovery page; only the
           neutral recommended-state note (no Post/Close/Delete UI). */
        recoState("empty");
        var msg = $("recoEmptyMsg");
        if (msg) msg.textContent = "Personalized matches are available on student accounts.";
        show($("recoEmptyActions"), false);
        var d = $("recoDisclaimer");
        if (d) { d.textContent = "Personalized matches are available on student accounts."; show(d, true); }
      } else {
        loadReco();
      }
    }).catch(function (e) {
      S.roleReady = true;
      if (e && e.status === 401) return;   /* auth.js already redirected */
      /* Network/server error: discovery stays usable; recommendations
         show their own error state with a retry button. */
      S.recoError = true;
      S.recoLoaded = true;
      S.recoErrorMsg = msgFor(e);
      renderReco();
    });
  } else {
    loadReco();
  }
}
document.addEventListener("DOMContentLoaded", boot);
})();