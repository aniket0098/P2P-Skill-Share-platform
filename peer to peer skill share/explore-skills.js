/* Explore Skills - discovery + content catalog (one source of truth: /api/learning/*).
 * Real actions only: watchable lectures open the Learning Player, everything
 * else opens the real external source. No fake progress, no dead buttons.
 */
(function () {
"use strict";
var API = window.SkillShareAPI;
var TH = window.SkillShareThumbs;
var S = { items: [], courses: [], lectures: [], skills: [], counts: null,
  recos: null, me: null, q: "", cat: "", skillCat: "", diff: "", type: "",
  prog: "", savedOnly: false, showAllCourses: false, showAllLectures: false,
  showAllLibrary: false };
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function toast(m) { var t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(window._xsT); window._xsT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
function badge(st) { var s = String(st || "not_started"); var l = s === "completed" ? "COMPLETED" : (s === "in_progress" ? "IN PROGRESS" : "NOT STARTED"); return '<span class="badge ' + s + '">' + l + "</span>"; }
function fmtSecs(s) { s = Math.max(0, parseInt(s || 0, 10)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); if (h) return m ? h + "h " + m + "m" : h + "h"; if (m) return m + "m"; return s ? s + "s" : "0m"; }
function matchQ(it, q) { if (!q) return true; q = q.toLowerCase(); return ((it.title || "") + " " + (it.skill || "") + " " + (it.topic || "") + " " + (it.provider || "") + " " + (it.category || "") + " " + (it.description || "")).toLowerCase().indexOf(q) >= 0; }
function passCommon(it) { if (S.diff && (it.difficulty || "") !== S.diff) return false; if (S.prog && (it.status || "not_started") !== S.prog) return false; if (S.savedOnly && !it.saved) return false; if (!matchQ(it, S.q)) return false; return true; }
function bar(p) { p = Math.max(0, Math.min(100, Number(p || 0))); return '<div class="bar"><div style="width:' + p + '%"></div></div>'; }
function typeLabel(it) {
  if (it.watchable) return '<span class="chip watch">&#9654; Video</span>';
  if (it.is_lecture) return '<span class="chip ext">Reading / External</span>';
  if ((it.resource_type || "") === "course") return '<span class="chip ext">&#8599; External course</span>';
  return '<span class="chip ext">Reading / External</span>';
}
function thumb(it, video) { return TH ? TH.thumb(it, { video: video }) : ""; }
function progLine(it) { if (!it.record_id) return '<small class="muted">Not started</small>'; if (it.duration_seconds > 0 || (it.watched_seconds && it.watched_seconds > 0)) return "<small class='muted'>" + fmtSecs(it.watched_seconds) + " / " + fmtSecs(it.duration_seconds) + " &middot; " + Math.round(it.progress || 0) + "%</small>"; return "<small class='muted'>" + Math.round(it.progress || 0) + "% complete</small>"; }
async function boot() { if (!API) return fail("API client missing."); $("xsRetry").addEventListener("click", function () { window.location.reload(); }); wireFilters(); document.addEventListener("click", onClick); await loadAll(); }
function fail(m) { $("xsLoading").hidden = true; $("xsApp").hidden = true; $("xsError").hidden = false; $("xsErrorMsg").textContent = m; }
async function loadAll() {
  try {
    var cat = await API.getLearningCatalog();
    S.items = cat.resources || []; S.courses = cat.courses || [];
    S.lectures = cat.lectures || []; S.skills = cat.skills || [];
    S.counts = cat.counts || null;
    var extra = await Promise.allSettled([API.getLearningMe(), API.getLearningRecommendations(5)]);
    S.me = extra[0].status === "fulfilled" ? extra[0].value : null;
    S.recos = extra[1].status === "fulfilled" ? extra[1].value : null;
    $("xsLoading").hidden = true; $("xsApp").hidden = false; renderAll();
  } catch (e) { fail((e && (e.detail || e.message)) || "Unable to load learning content."); }
}
function byId(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }
/* XS2 render */
function renderAll() {
  var c = S.counts || {};
  $("hsSkills").textContent = c.skills != null ? c.skills : S.skills.length;
  $("hsCourses").textContent = c.courses != null ? c.courses : S.courses.length;
  $("hsLectures").textContent = c.watchable_lectures != null ? c.watchable_lectures + " playable" : (c.lectures != null ? c.lectures : S.lectures.length);
  $("hsResources").textContent = c.resources != null ? c.resources : S.items.length;
  renderContinue(); renderRecos(); renderSkills();
  renderCourses(); renderLectures(); renderLibrary(); renderSaved();
  var n = filteredCourses().length + filteredLectures().length + filteredLibrary().length;
  $("xsResultCount").textContent = (S.q || S.cat || S.diff || S.type || S.prog || S.savedOnly) ? (n + " results") : "";
}
function renderContinue() {
  var sec = $("secContinue"); if (!sec) return;
  var items = (S.me && (S.me.active || [])) || S.items.filter(function (i) { return i.status === "in_progress"; }).slice(0, 6);
  if (!items.length) { sec.hidden = true; return; }
  sec.hidden = false;
  $("continueList").innerHTML = items.slice(0, 6).map(function (r) {
    var it = r.resource_id ? byId(r.resource_id) : null;
    var title = (it && it.title) || r.resource_title || r.title;
    var skill = (it && it.skill) || r.skill_name || r.skill || "";
    var id = r.resource_id || r.id; var url = (it && it.url) || r.resource_url || "";
    var watchable = !!(it && it.watchable) || !!r.resource_media_url;
    var pct = Math.round(r.progress || 0);
    var line = r.total_duration_seconds ? (fmtSecs(r.watched_seconds) + " / " + fmtSecs(r.total_duration_seconds) + " watched") : (pct + "% complete");
    var item = { title: title, skill: skill, category: (it && it.category) || "", resource_type: "video" };
    return "<div class='learn-card'>" + thumb(item, watchable) +
      "<h3>" + esc(title) + "</h3>" + bar(pct) + "<small class='muted'>" + esc(line) + "</small>" +
      "<div class='card-actions'>" +
      (watchable ? "<button class='btn primary sm' data-act='watch' data-id='" + id + "'>Continue</button>"
                 : "<a class='btn primary sm' href='" + esc(url || "#") + "' target='_blank' rel='noopener'>Open source</a>") +
      "</div></div>";
  }).join("");
}
function renderRecos() {
  var box = $("recoList"); if (!box) return;
  var recs = (S.recos && S.recos.recommendations) || [];
  if (!recs.length) { box.innerHTML = "<div class='empty'>Set a career goal in CareerVerse for sharper picks. Meanwhile, start a popular course below.</div>"; return; }
  $("recoSub").textContent = S.recos.message || ("Based on " + (S.recos.target_role || "your profile") + ".");
  box.innerHTML = recs.slice(0, 5).map(function (r) {
    var res = r.resource || {};
    return "<div class='rrow'><div><strong>" + esc(r.skill_name || "Skill") + "</strong><small>" + esc(r.reason || "") + "</small></div>" +
      (res.id ? "<button class='btn primary sm' data-act='reco' data-id='" + res.id + "'>Start</button>" : "<a class='btn ghost sm' href='skill-mapping.html'>Details</a>") + "</div>";
  }).join("");
}
function renderSkills() {
  var grid = $("skillGrid"); if (!grid) return;
  var list = S.skills.filter(function (s) { return (!S.skillCat || s.category === S.skillCat) && matchQ({ title: s.skill, skill: s.skill, category: s.category, description: "" }, S.q); });
  if (!list.length) { grid.innerHTML = "<div class='empty'>No learning content found.</div>"; return; }
  grid.innerHTML = list.slice(0, 12).map(function (s) {
    return "<div class='skill-card'><div class='n'>" + s.resources + "</div><h3>" + esc(s.skill) + "</h3><p>" + esc(s.category || "") + " &middot; " + s.resources + " resources</p>" +
      "<div class='card-actions'><button class='btn primary sm' data-act='skill' data-skill='" + esc(s.skill) + "'>View content</button></div></div>";
  }).join("");
}
/* XS3 cards + library */
function filteredCourses() {
  return S.courses.filter(function (cc) {
    if (S.cat && cc.category !== S.cat) return false;
    if (S.diff && cc.difficulty !== S.diff) return false;
    if (S.type === "lecture") return false;
    if (S.prog && cc.status !== S.prog) return false;
    if (S.savedOnly && !cc.saved) return false;
    if (!matchQ({ title: cc.course_title, skill: cc.skill, category: cc.category, provider: cc.provider, description: "" }, S.q)) return false;
    return true;
  });
}
function filteredLectures() {
  return S.lectures.filter(function (it) {
    if (S.cat && it.category !== S.cat) return false;
    if (S.type === "course") return false;
    if (!passCommon(it)) return false;
    return true;
  });
}
function filteredLibrary() {
  return S.items.filter(function (it) {
    if (S.cat && it.category !== S.cat) return false;
    if (S.prog && (it.status || "not_started") !== S.prog) return false;
    if (S.savedOnly && !it.saved) return false;
    if (!matchQ(it, S.q)) return false;
    var t = S.type;
    if (t === "course" && (it.resource_type !== "course" && !it.course_key)) return false;
    if (t === "lecture" && !it.is_lecture) return false;
    return true;
  });
}
function courseCard(cc) {
  var anyWatch = (cc.lectures || []).some(function (l) { return l.watchable; });
  var watchCount = (cc.lectures || []).filter(function (l) { return l.watchable; }).length;
  var item = { title: cc.course_title, skill: cc.skill, category: cc.category, resource_type: "course" };
  var started = cc.status === "in_progress" || cc.status === "completed";
  return "<div class='learn-card'>" + thumb(item, false) +
    "<h3>" + esc(cc.course_title) + "</h3><div class='meta'>" +
    "<span class='chip skill'>" + esc(cc.skill || "") + "</span><span class='chip'>" + esc(cc.difficulty || "") + "</span>" +
    "<span class='chip'>" + cc.lecture_count + " chapters</span><span class='chip'>" + esc(cc.duration_label || "") + "</span>" +
    (watchCount ? "<span class='chip watch'>" + watchCount + " &#9654; watchable</span>" : "<span class='chip ext'>&#8599; external</span>") + badge(cc.status) + "</div>" +
    bar(cc.progress || 0) + progLine(cc) +
    "<div class='card-actions'><button class='btn primary sm' data-act='course' data-key='" + esc(cc.course_key) + "'>" + (started ? "Continue" : "View Course") + "</button>" +
    "<button class='btn ghost sm' data-act='save-course' data-key='" + esc(cc.course_key) + "'>" + (cc.saved ? "Saved" : "Save") + "</button></div></div>";
}
function lectureCard(it) {
  return "<div class='learn-card'>" + thumb(it, it.watchable) +
    "<h3>" + esc(it.title) + "</h3><div class='meta'>" +
    "<span class='chip skill'>" + esc(it.skill || "") + "</span><span class='chip'>" + esc(it.difficulty || "") + "</span>" +
    "<span class='chip'>" + esc(it.duration_label || "") + "</span>" + typeLabel(it) + badge(it.status) + "</div>" +
    bar(it.progress || 0) + progLine(it) +
    "<div class='card-actions'>" +
    (it.watchable ? "<button class='btn primary sm' data-act='watch' data-id='" + it.id + "'>" + (it.record_id ? "Continue" : "Watch Lecture") + "</button>"
                  : "<a class='btn primary sm' href='" + esc(it.url || "#") + "' target='_blank' rel='noopener'>Open source</a>") +
    "<button class='btn ghost sm' data-act='save' data-id='" + it.id + "'>" + (it.saved ? "Saved" : "Save") + "</button></div></div>";
}
function resourceCard(it) {
  return "<div class='learn-card'>" + thumb(it, it.watchable) +
    "<h3>" + esc(it.title) + "</h3><div class='meta'>" +
    "<span class='chip skill'>" + esc(it.skill || "") + "</span><span class='chip'>" + esc(it.category || "") + "</span>" +
    "<span class='chip'>" + esc(it.duration_label || "") + "</span>" + typeLabel(it) + "</div>" +
    (it.record_id ? (bar(it.progress || 0) + progLine(it)) : "<small class='muted'>" + esc(it.provider || "") + "</small>") +
    "<div class='card-actions'>" +
    (it.watchable ? "<button class='btn primary sm' data-act='watch' data-id='" + it.id + "'>" + (it.record_id ? "Continue" : "Watch Lecture") + "</button>"
                  : "<a class='btn primary sm' href='" + esc(it.url || "#") + "' target='_blank' rel='noopener'>Open source</a>") +
    "<button class='btn ghost sm' data-act='save' data-id='" + it.id + "'>" + (it.saved ? "Saved" : "Save") + "</button></div></div>";
}
function renderCourses() {
  var grid = $("courseGrid"); if (!grid) return;
  var list = filteredCourses();
  var vis = S.showAllCourses ? list : list.slice(0, 6);
  grid.innerHTML = vis.length ? vis.map(courseCard).join("") : "<div class='empty'>No learning content found.</div>";
  var va = $("viewAllCourses"); if (va) va.textContent = S.showAllCourses ? "Show less" : ("View all courses (" + list.length + ")");
}
function renderLectures() {
  var grid = $("lectureGrid"); if (!grid) return;
  var list = filteredLectures();
  var vis = S.showAllLectures ? list : list.slice(0, 6);
  grid.innerHTML = vis.length ? vis.map(lectureCard).join("") : "<div class='empty'>No learning content found.</div>";
  var va = $("viewAllLectures"); if (va) va.textContent = S.showAllLectures ? "Show less" : ("View all lectures (" + list.length + ")");
}
function renderLibrary() {
  var grid = $("libraryGrid"); if (!grid) return;
  var list = filteredLibrary();
  var vis = S.showAllLibrary ? list : list.slice(0, 8);
  grid.innerHTML = vis.length ? vis.map(resourceCard).join("") : "<div class='empty'>No learning content found.</div>";
  var va = $("viewAllLibrary"); if (va) va.textContent = S.showAllLibrary ? "Show less" : ("View all resources (" + list.length + ")");
}
function renderSaved() {
  var box = $("savedList"); if (!box) return;
  var saved = S.items.filter(function (i) { return i.saved; }).slice(0, 6);
  box.innerHTML = saved.length ? saved.map(resourceCard).join("") : "<div class='empty'>Nothing saved yet - tap Save on any course or lecture.</div>";
}
/* XS4 actions + filters */
function needAuth() { if (!API.getToken()) { window.location.href = "login.html?next=" + encodeURIComponent("explore-skills.html"); return true; } return false; }
async function doWatch(id, btn) {
  if (needAuth()) return;
  var it = byId(id);
  if (it && !it.watchable) { window.open(it.url || "#", "_blank", "noopener"); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Opening..."; }
  try {
    var out = await API.startLearning(id);
    var rec = out && out.record;
    window.location.href = "learning-player.html?resource=" + id + (rec ? "&record=" + rec.id : "");
  } catch (err) { toast((err && (err.detail || err.message)) || "Could not start learning."); if (btn) { btn.disabled = false; btn.textContent = "Watch Lecture"; } }
}
async function doSave(rid, btn) {
  if (needAuth()) return;
  var it = byId(rid);
  try {
    if (it && it.saved) { await API.removeLearningBookmark(rid); it.saved = false; }
    else { await API.addLearningBookmark(rid); if (it) it.saved = true; }
    syncSaved(); renderCourses(); renderLectures(); renderLibrary(); renderSaved();
  } catch (err) { toast((err && (err.detail || err.message)) || "Could not save."); }
}
async function doSaveCourse(key, btn) {
  if (needAuth()) return;
  var cc = null;
  for (var i = 0; i < S.courses.length; i++) if (S.courses[i].course_key === key) cc = S.courses[i];
  if (!cc || !cc.lectures || !cc.lectures.length) return;
  var anyUnsaved = cc.lectures.some(function (l) { return !l.saved; });
  try {
    for (var j = 0; j < cc.lectures.length; j++) {
      var l = cc.lectures[j];
      if (anyUnsaved && !l.saved) await API.addLearningBookmark(l.id);
      if (!anyUnsaved && l.saved) await API.removeLearningBookmark(l.id);
    }
    var cat = await API.getLearningCatalog();
    S.items = cat.resources || []; S.courses = cat.courses || []; S.lectures = cat.lectures || [];
    renderCourses(); renderLectures(); renderLibrary(); renderSaved();
    toast(anyUnsaved ? "Course saved." : "Course unsaved.");
  } catch (err) { toast((err && (err.detail || err.message)) || "Could not save course."); }
}
async function onClick(e) {
  var b = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
  if (!b) return;
  var act = b.getAttribute("data-act");
  if (act === "watch") { var id = parseInt(b.getAttribute("data-id"), 10); await doWatch(id, b); }
  else if (act === "reco") { var rid2 = parseInt(b.getAttribute("data-id"), 10); await doWatch(rid2, b); }
  else if (act === "course") { var k = b.getAttribute("data-key"); window.location.href = "course-details.html?course=" + encodeURIComponent(k); }
  else if (act === "save") { var rid = parseInt(b.getAttribute("data-id"), 10); await doSave(rid, b); }
  else if (act === "save-course") { await doSaveCourse(b.getAttribute("data-key"), b); }
  else if (act === "skill") { var sk = b.getAttribute("data-skill") || ""; var inp = $("xsSearch"); if (inp) { inp.value = sk; } S.q = sk; renderSkills(); renderCourses(); renderLectures(); renderLibrary(); var y = document.getElementById("secLibrary") ? document.getElementById("secLibrary").offsetTop : 0; window.scrollTo({ top: Math.max(0, y - 120), behavior: "smooth" }); }
}
function syncSaved() {
  var map = {};
  for (var i = 0; i < S.items.length; i++) map[S.items[i].id] = S.items[i].saved;
  for (var j = 0; j < S.lectures.length; j++) if (map[S.lectures[j].id] != null) S.lectures[j].saved = map[S.lectures[j].id];
  for (var k = 0; k < S.courses.length; k++) {
    var cc = S.courses[k];
    if (cc.lectures) for (var m = 0; m < cc.lectures.length; m++) if (map[cc.lectures[m].id] != null) cc.lectures[m].saved = map[cc.lectures[m].id];
    cc.saved = cc.lectures && cc.lectures.some(function (l) { return l.saved; });
  }
}
function wireFilters() {
  var s = $("xsSearch"), t = null;
  if (s) s.addEventListener("input", function () { clearTimeout(t); t = setTimeout(function () { S.q = (s.value || "").trim(); renderSkills(); renderCourses(); renderLectures(); renderLibrary(); renderAll_counts(); }, 220); });
  function renderAll_counts() { var n = filteredCourses().length + filteredLectures().length + filteredLibrary().length; $("xsResultCount").textContent = (S.q || S.cat || S.diff || S.type || S.prog || S.savedOnly) ? (n + " results") : ""; }
  var c = $("fCategory"); if (c) c.addEventListener("change", function () { S.cat = c.value || ""; renderCourses(); renderLectures(); renderLibrary(); });
  var d = $("fDifficulty"); if (d) d.addEventListener("change", function () { S.diff = d.value || ""; renderCourses(); renderLectures(); renderLibrary(); });
  var ty = $("fType"); if (ty) ty.addEventListener("change", function () { S.type = ty.value || ""; renderCourses(); renderLectures(); renderLibrary(); });
  var p = $("fProgress"); if (p) p.addEventListener("change", function () { S.prog = p.value || ""; renderCourses(); renderLectures(); renderLibrary(); });
  var sv = $("btnSaved"); if (sv) sv.addEventListener("click", function () { S.savedOnly = !S.savedOnly; sv.classList.toggle("on", S.savedOnly); renderCourses(); renderLectures(); renderLibrary(); });
  var cl = $("btnClear"); if (cl) cl.addEventListener("click", function () { S.q = ""; S.cat = ""; S.diff = ""; S.type = ""; S.prog = ""; S.savedOnly = false; if (s) s.value = ""; if (c) c.value = ""; if (d) d.value = ""; if (ty) ty.value = ""; if (p) p.value = ""; if (sv) sv.classList.remove("on"); renderAll(); });
  document.querySelectorAll("#skillTabs button").forEach(function (b) { b.addEventListener("click", function () { document.querySelectorAll("#skillTabs button").forEach(function (x) { x.classList.remove("active"); }); b.classList.add("active"); S.skillCat = b.getAttribute("data-cat") || ""; renderSkills(); }); });
  var va = $("viewAllCourses"); if (va) va.addEventListener("click", function () { S.showAllCourses = !S.showAllCourses; renderCourses(); });
  var vl = $("viewAllLectures"); if (vl) vl.addEventListener("click", function () { S.showAllLectures = !S.showAllLectures; renderLectures(); });
  var vl2 = $("viewAllLibrary"); if (vl2) vl2.addEventListener("click", function () { S.showAllLibrary = !S.showAllLibrary; renderLibrary(); });
}
document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 120); });
})();
