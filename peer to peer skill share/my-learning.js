/* My Learning canonical frontend. Real JWT user data only.
PostgreSQL is the source of truth. No fake progress. */
(function () {
"use strict";
var API = window.SkillShareAPI;
var state = { items: [], active: [], completed: [], stats: null,
  activity: [], skills: [], resources: [], recos: null, roadmap: null,
  q: "", status: "all", skill: "", type: "", sort: "recent",
  modalId: null, trackId: null, trackStart: 0, trackTotal: 0, timer: null };

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function show(id) { var e = $(id); if (e) e.hidden = false; }
function hide(id) { var e = $(id); if (e) e.hidden = true; }
function toast(m) { var t = $("toast"); if (!t) return; t.textContent = m;
  t.classList.add("show"); clearTimeout(window._mlToast);
  window._mlToast = setTimeout(function () { t.classList.remove("show"); }, 2600); }
function fmtTime(s) { s = Math.max(0, parseInt(s || 0, 10));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return m ? h + "h " + m + "m" : h + "h";
  return m ? m + "m" : "0m"; }
function ago(iso) { if (!iso) return "";
  var d = (new Date(iso).getTime() - Date.now()) / 1000 * -1;
  if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago"; }
function badge(st) { var s = String(st || "not_started").toLowerCase();
  var label = s === "completed" ? "COMPLETED" : (s === "in_progress" ? "IN PROGRESS" : "NOT STARTED");
  return '<span class="badge ' + s + '">' + label + "</span>"; }
function bar(p) { p = Math.max(0, Math.min(100, Number(p || 0)));
  return '<div class="bar"><div style="width:' + p + '%"></div></div>'; }

async function boot() {
  if (!API) { return fail("API client missing. Check api-client.js."); }
  if (!API.getToken()) { hide("mlLoading");
    show("mlError"); $("mlErrorMsg").textContent = "Please log in to view your learning data.";
    return; }
  var retry = $("mlRetry");
  if (retry) retry.addEventListener("click", function () { window.location.reload(); });
  wireFilters(); wireModal();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("beforeunload", stopTrack);
  await loadAll();
}

function fail(m) { hide("mlLoading"); hide("mlApp"); hide("mlEmpty");
  show("mlError"); if ($("mlErrorMsg")) $("mlErrorMsg").textContent = m; }

async function loadAll() {
  try {
    var me = await API.getLearningMe();
    state.items = me.items || me.records || [];
    state.active = me.active || [];
    state.completed = me.completed || [];
    state.stats = me.overview || me.stats || null;
    state.activity = me.recent_activity || [];
    state.skills = me.skills || [];
    var extra = await Promise.allSettled([
      API.getLearningRecommendations(6), API.getLearningRoadmap(),
      API.getLearningResources({}), API.getLearningActivity(20)]);
    state.recos = extra[0].status === "fulfilled" ? extra[0].value : null;
    state.roadmap = extra[1].status === "fulfilled" ? extra[1].value : null;
    var res = extra[2].status === "fulfilled" ? extra[2].value : null;
    state.resources = (res && res.resources) || [];
    if (extra[3].status === "fulfilled" && extra[3].value.activity) state.activity = extra[3].value.activity;
    renderAll();
  } catch (e) {
    if (e && e.status === 401) { fail("Session expired. Please log in again."); return; }
    fail((e && (e.detail || e.message)) || "Unable to load your learning data.");
  }
}

function renderAll() {
  hide("mlLoading"); hide("mlError");
  if (!state.items.length) { hide("mlApp"); show("mlEmpty");
    renderResources(); return; }
  hide("mlEmpty"); show("mlApp");
  renderStats(); renderActive(); renderRecos(); renderRoad();
  renderActivity(); renderSkills(); buildFilterOptions(); renderHistory();
  renderResources();
}

function renderStats() {
  var s = state.stats || {};
  $("stTotal").textContent = s.total != null ? s.total : state.items.length;
  $("stActive").textContent = s.active != null ? s.active : state.active.length;
  $("stDone").textContent = s.completed != null ? s.completed : state.completed.length;
  var avg = s.average_progress != null ? s.average_progress : s.overall_progress;
  $("stAvg").textContent = (avg != null ? avg : 0) + "%";
  $("stTime").textContent = s.total_time_formatted || fmtTime(s.total_time_seconds || 0);
  $("stSkills").textContent = s.skills_developing != null ? s.skills_developing : state.skills.length;
  var sub = $("mlSubtitle");
  if (sub) sub.textContent = state.items.length + " learning records · " +
    state.completed.length + " completed · " +
    (s.total_time_formatted || fmtTime(s.total_time_seconds || 0)) + " tracked.";
}

function cardHTML(r) {
  var pct = Math.max(0, Math.min(100, Number(r.progress || 0)));
  var done = String(r.status || "").toLowerCase() === "completed";
  return '<article class="learn-card' + (done ? " done" : "") + '">' +
    '<div class="meta"><span class="chip skill">' + esc(r.skill_name || "General") + "</span>" +
    '<span class="chip">' + esc(r.resource_type || "course") + "</span>" + badge(r.status) + "</div>" +
    "<h3>" + esc(r.resource_title || "Learning resource") + "</h3>" +
    '<div class="meta"><span>' + pct + '%</span><span>·</span><span>' +
    fmtTime(r.time_spent_seconds || 0) + '</span><span>·</span><span>' +
    (r.last_accessed ? esc(ago(r.last_accessed)) : "not opened yet") + "</span></div>" +
    bar(pct) +
    '<div class="card-actions">' +
    '<button class="btn primary sm" data-act="continue" data-id="' + r.id + '" type="button">' +
    (done ? "Review" : "Continue Learning") + "</button>" +
    '<button class="btn ghost sm" data-act="progress" data-id="' + r.id + '" type="button">Update Progress</button>' +
    "</div></article>";
}

function renderActive() {
  var host = $("activeList");
  var list = state.items.filter(function (r) {
    return String(r.status || "").toLowerCase() === "in_progress"; }).slice(0, 6);
  $("activeCount").textContent = list.length + " active";
  host.innerHTML = list.length ? list.map(cardHTML).join("") :
    '<div class="empty">No active learning. Start a resource below or from Explore Skills.</div>';
}

function renderRecos() {
  var host = $("recoList"); var d = state.recos || {};
  var list = d.recommendations || [];
  $("recoSub").textContent = d.has_target ? ("Target: " + (d.target_role || "") + ". " + (d.message || ""))
    : (d.message || "Choose a target career to receive personalized recommendations.");
  if (!list.length) { host.innerHTML = '<div class="empty">' +
    esc(d.message || "Choose a target career to receive personalized recommendations.") +
    ' <a href="profile.html">Set target role</a>.</div>'; return; }
  host.innerHTML = list.slice(0, 6).map(function (g) {
    var res = g.resource || {};
    var btn = res.id ? '<button class="btn primary sm" data-act="start" data-rid="' + res.id +
      '" type="button">Start Learning</button>' : "";
    return '<div class="rrow"><div><strong>' + esc(g.skill_name || "Skill") + "</strong>" +
      "<small>" + esc(g.reason || "") + "</small>" +
      (res.title ? "<small> · " + esc(res.title) + (res.provider ? " — " + esc(res.provider) : "") + "</small>" : "") +
      "</div><div>" + btn + "</div></div>";
  }).join("");
}

function renderRoad() {
  var host = $("roadList"); var d = state.roadmap || {};
  var steps = d.steps || [];
  $("roadSub").textContent = d.has_target ? ("Target: " + (d.target_role || ""))
    : (d.message || "Choose a target career to see your learning roadmap.");
  if (!steps.length) { host.innerHTML = '<div class="empty">' +
    esc(d.message || "Choose a target career to see your learning roadmap.") + "</div>"; return; }
  host.innerHTML = steps.map(function (s, i) {
    var icon = s.state === "done" ? "✓" : (s.state === "current" ? "→" : (s.state === "next" ? "○" : "·"));
    return '<div class="road-step ' + esc(s.state || "todo") + '"><span class="road-n">' + icon +
      "</span><div><strong>" + esc(s.skill_name || "") + "</strong><small>" +
      esc(s.required_level || "") + (s.progress ? " · " + esc(String(s.progress)) + "%" : "") +
      "</small></div></div>";
  }).join("");
}

function renderActivity() {
  var host = $("activityList");
  if (!state.activity.length) { host.innerHTML = '<div class="empty">No learning activity yet. Start or update a record.</div>'; return; }
  host.innerHTML = state.activity.slice(0, 10).map(function (a) {
    var t = String(a.activity_type || "");
    var dot = t === "learning_completed" ? "done" : (t === "learning_started" ? "start" : "prog");
    var label = t === "learning_completed" ? "Completed" : (t === "learning_started" ? "Started" : "Updated");
    return '<div class="arow"><span class="dot ' + dot + '"></span><div style="flex:1"><strong>' +
      esc(label) + "</strong><small>" + esc(a.description || "") + "</small></div><small>" +
      esc(ago(a.created_at)) + "</small></div>";
  }).join("");
}

function renderSkills() {
  var host = $("skillList");
  if (!state.skills.length) { host.innerHTML = '<div class="empty">Skills appear once you start learning.</div>'; return; }
  host.innerHTML = state.skills.slice(0, 10).map(function (s) {
    return '<div class="srow" style="display:block;padding:10px 0;border-bottom:1px solid rgba(148,163,184,.14)">' +
      '<div class="row between"><strong>' + esc(s.skill || s.skill_name || "") + "</strong><span>" +
      esc(String(s.avg_progress != null ? s.avg_progress : 0)) + '%</span></div>' + bar(s.avg_progress || 0) +
      "<small>" + esc(String(s.count || 0)) + " resources · " + esc(String(s.completed || 0)) + " completed</small></div>";
  }).join("");
}

function filteredHistory() {
  var q = state.q.trim().toLowerCase();
  var list = state.items.slice();
  if (state.status !== "all") list = list.filter(function (r) {
    return String(r.status || "").toLowerCase() === state.status; });
  if (state.skill) list = list.filter(function (r) {
    return String(r.skill_name || "") === state.skill; });
  if (state.type) list = list.filter(function (r) {
    return String(r.resource_type || "") === state.type; });
  if (q) list = list.filter(function (r) {
    return ((r.resource_title || "") + " " + (r.skill_name || "") + " " +
      (r.resource_type || "")).toLowerCase().indexOf(q) >= 0; });
  var k = state.sort;
  list.sort(function (a, b) {
    if (k === "progress") return (b.progress || 0) - (a.progress || 0);
    if (k === "newest") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    if (k === "time") return (b.time_spent_seconds || 0) - (a.time_spent_seconds || 0);
    if (k === "alpha") return String(a.resource_title || "").localeCompare(String(b.resource_title || ""));
    return String(b.last_accessed || b.updated_at || "").localeCompare(String(a.last_accessed || a.updated_at || ""));
  });
  return list;
}

function buildFilterOptions() {
  var sk = $("fSkill"), ty = $("fType");
  var skills = [], types = [];
  state.items.forEach(function (r) {
    if (r.skill_name && skills.indexOf(r.skill_name) < 0) skills.push(r.skill_name);
    if (r.resource_type && types.indexOf(r.resource_type) < 0) types.push(r.resource_type);
  });
  skills.sort(); types.sort();
  sk.innerHTML = '<option value="">All skills</option>' + skills.map(function (s) {
    return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("");
  ty.innerHTML = '<option value="">All types</option>' + types.map(function (s) {
    return '<option value="' + esc(s) + '">' + esc(s) + "</option>"; }).join("");
}

function renderHistory() {
  var host = $("historyList");
  var list = filteredHistory();
  if (!list.length) { host.innerHTML = '<div class="empty">No records match these filters.</div>'; return; }
  host.innerHTML = list.map(function (r) {
    var pct = Math.max(0, Math.min(100, Number(r.progress || 0)));
    return '<div class="hrow"><div style="flex:1"><strong>' + esc(r.resource_title || "") + "</strong>" +
      "<small>" + esc(r.skill_name || "") + " · " + esc(r.resource_type || "") +
      " · " + pct + "% · " + fmtTime(r.time_spent_seconds || 0) +
      (r.last_accessed ? " · " + esc(ago(r.last_accessed)) : "") + "</small></div>" +
      "<div>" + badge(r.status) + "</div></div>";
  }).join("");
}

function renderResources() {
  var host = $("resourceList");
  if (!host) return;
  var mine = {};
  state.items.forEach(function (r) { if (r.resource_id) mine[r.resource_id] = r; });
  var q = state.q.trim().toLowerCase();
  var list = state.resources.filter(function (r) {
    if (!q) return true;
    return ((r.title || "") + " " + (r.skill || "") + " " + (r.provider || "")).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 9);
  if (!list.length) { host.innerHTML = '<div class="empty">No curated resources found.</div>'; return; }
  host.innerHTML = list.map(function (r) {
    var m = mine[r.id];
    var right = m ? badge(m.status) :
      '<button class="btn primary sm" data-act="start" data-rid="' + r.id + '" type="button">Start Learning</button>';
    return '<article class="learn-card"><div class="meta"><span class="chip skill">' +
      esc(r.skill || "") + '</span><span class="chip">' + esc(r.resource_type || "course") + "</span></div>" +
      "<h3>" + esc(r.title || "") + "</h3>" +
      '<div class="meta"><span>' + esc(r.provider || "") + "</span>" +
      (m ? "<span>·</span><span>" + Math.round(m.progress || 0) + "%</span>" : "") + "</div>" +
      '<div class="card-actions"><a class="btn ghost sm" href="' + esc(r.url || "#") +
      '" target="_blank" rel="noopener">View Resource</a>' + right + "</div></article>";
  }).join("");
}

function findRecord(id) {
  for (var i = 0; i < state.items.length; i++) {
    if (state.items[i].id === id) return state.items[i];
  }
  return null;
}

function applyRecord(rec) {
  var updated = false;
  for (var i = 0; i < state.items.length; i++) {
    if (state.items[i].id === rec.id) { state.items[i] = rec; updated = true; break; }
  }
  if (!updated) state.items.unshift(rec);
  state.active = state.items.filter(function (r) {
    return String(r.status || "").toLowerCase() === "in_progress"; });
  state.completed = state.items.filter(function (r) {
    return String(r.status || "").toLowerCase() === "completed"; });
  var tot = state.items.length;
  var avg = tot ? state.items.reduce(function (s, r) { return s + Number(r.progress || 0); }, 0) / tot : 0;
  state.stats = { total: tot, active: state.active.length, completed: state.completed.length,
    average_progress: Math.round(avg * 10) / 10, overall_progress: Math.round(avg * 10) / 10,
    total_time_seconds: state.items.reduce(function (s, r) { return s + (r.time_spent_seconds || 0); }, 0),
    total_time_formatted: fmtTime(state.items.reduce(function (s, r) { return s + (r.time_spent_seconds || 0); }, 0)),
    skills_developing: state.skills.length };
  renderStats(); renderActive(); buildFilterOptions(); renderHistory(); renderResources();
}

async function doContinue(id) {
  var r = findRecord(id);
  if (!r) return;
  startTrack(id);
  if (r.resource_url) {
    try { window.open(r.resource_url, "_blank", "noopener"); }
    catch (e) { toast("Learning resource unavailable."); }
  } else {
    toast("Learning resource unavailable.");
  }
  if (Number(r.progress || 0) < 100) {
    var next = Math.min(100, Math.round(Number(r.progress || 0)) + 5);
    await doProgress(id, next, true);
  }
}

async function doProgress(id, pct, silent) {
  try {
    var out = await API.updateLearningProgress(id, pct);
    if (out && out.record) applyRecord(out.record);
    if (!silent) toast((out && out.message) || "Progress updated.");
    if (out && out.was_completed) { toast("Congratulations! Resource completed."); loadAll(); }
  } catch (e) { toast("Failed to update progress: " + ((e && (e.detail || e.message)) || "error")); }
}

async function doStart(rid, btn) {
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Starting..."; }
    var out = await API.startLearning(rid);
    if (out && out.record) { state.items.unshift(out.record); }
    toast((out && out.message) || "Learning started.");
    await loadAll();
  } catch (e) { toast((e && (e.detail || e.message)) || "Could not start learning.");
    if (btn) { btn.disabled = false; btn.textContent = "Start Learning"; } }
}

function startTrack(id) {
  stopTrack(true);
  state.trackId = id; state.trackStart = Date.now(); state.trackTotal = 0;
  clearInterval(state.timer);
  state.timer = setInterval(function () {
    if (document.hidden) return;
    state.trackTotal += 30;
    if (state.trackTotal >= 60) { flushTrack(); state.trackTotal = 0; state.trackStart = Date.now(); }
  }, 30000);
}

async function flushTrack() {
  if (!state.trackId) return;
  var secs = state.trackTotal + Math.floor((Date.now() - state.trackStart) / 1000);
  if (document.hidden) secs = state.trackTotal;
  secs = Math.max(0, Math.min(secs, 600));
  if (secs < 15) return;
  try {
    var out = await API.addLearningTime(state.trackId, secs);
    if (out && out.record) applyRecord(out.record);
  } catch (e) { /* keep learning usable offline; time retry next heartbeat */ }
  state.trackTotal = 0; state.trackStart = Date.now();
}

function stopTrack(silent) {
  clearInterval(state.timer); state.timer = null;
  if (!silent && state.trackId) { var p = flushTrack(); if (p && p.catch) p.catch(function () {}); }
  if (silent && state.trackId) { flushTrack(); }
  state.trackId = null;
}

function onVis() { if (document.hidden) { flushTrack(); state.trackStart = Date.now(); }
  else if (state.trackId) { state.trackStart = Date.now(); } }

function wireFilters() {
  var s = $("mlSearch"), t = null;
  if (s) s.addEventListener("input", function () {
    clearTimeout(t);
    t = setTimeout(function () { state.q = s.value || ""; renderHistory(); renderResources(); }, 220);
  });
  var fs = $("fStatus"); if (fs) fs.addEventListener("change", function () {
    state.status = fs.value || "all"; renderHistory(); });
  var fk = $("fSkill"); if (fk) fk.addEventListener("change", function () {
    state.skill = fk.value || ""; renderHistory(); });
  var ft = $("fType"); if (ft) ft.addEventListener("change", function () {
    state.type = ft.value || ""; renderHistory(); });
  var fo = $("fSort"); if (fo) fo.addEventListener("change", function () {
    state.sort = fo.value || "recent"; renderHistory(); });
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
    if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "continue") doContinue(parseInt(b.getAttribute("data-id"), 10));
    else if (act === "progress") openModal(parseInt(b.getAttribute("data-id"), 10));
    else if (act === "start") doStart(parseInt(b.getAttribute("data-rid"), 10), b);
  });
  window.addEventListener("skillshare:auth-expired", function () {
    stopTrack(true); fail("Session expired. Please log in again."); });
}

function openModal(id) {
  var r = findRecord(id);
  if (!r) return;
  state.modalId = id;
  $("pmSub").textContent = (r.resource_title || "") + " — currently " + Math.round(r.progress || 0) + "%";
  $("pmRange").value = Math.round(r.progress || 0);
  $("pmVal").textContent = Math.round(r.progress || 0) + "%";
  $("progressModal").hidden = false;
}

function wireModal() {
  var range = $("pmRange");
  if (range) range.addEventListener("input", function () {
    $("pmVal").textContent = range.value + "%"; });
  var c = $("pmCancel");
  if (c) c.addEventListener("click", function () { $("progressModal").hidden = true; state.modalId = null; });
  var sv = $("pmSave");
  if (sv) sv.addEventListener("click", async function () {
    var id = state.modalId; if (!id) return;
    sv.disabled = true;
    await doProgress(id, parseInt(range.value, 10));
    sv.disabled = false;
    $("progressModal").hidden = true; state.modalId = null;
  });
}

document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 150); });
})();
