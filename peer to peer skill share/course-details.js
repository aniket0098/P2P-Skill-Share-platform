/* Course details: real curriculum + per-lecture actions.
 * Watchable lectures open the Learning Player; reading chapters open the
 * real external source. Course progress derives from actual lecture
 * records (duration-weighted, done server-side).
 */
(function () {
"use strict";
var API = window.SkillShareAPI;
var TH = window.SkillShareThumbs;
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmtSecs(s) { s = Math.max(0, parseInt(s || 0, 10)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); if (h) return m ? h + "h " + m + "m" : h + "h"; if (m) return m + "m"; return s ? s + "s" : "0m"; }
function toast(m) { var t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(window._cdT); window._cdT = setTimeout(function () { t.classList.remove("show"); }, 2600); }
async function boot() {
  var key = new URLSearchParams(window.location.search).get("course") || "";
  if (!key) { $("cdLoading").hidden = true; $("cdError").hidden = false; $("cdErrorMsg").textContent = "Missing course parameter."; return; }
  try {
    var d = await API.getLearningCourse(key);
    $("cdLoading").hidden = true; $("cdApp").hidden = false;
    var pct = Math.round(d.progress || 0);
    var ls = d.lectures || [];
    var anyWatch = ls.some(function (l) { return l.watchable; });
    var watchCount = ls.filter(function (l) { return l.watchable; }).length;
    var hero = TH ? TH.hero({ title: d.course_title, skill: d.skill, category: d.category, watchable: anyWatch, resource_type: "course" }) : "";
    $("cdHero").innerHTML = hero;
    $("cdHead").innerHTML = "<p class='eyebrow'>" + esc(d.category || "") + " &middot; " + esc(d.skill || "") + "</p><h1 style='margin:0 0 8px'>" + esc(d.course_title) + "</h1>" +
      "<p class='muted'>" + esc(d.description || "") + "</p>" +
      "<div class='meta'><span class='chip'>" + esc(d.difficulty || "") + "</span><span class='chip'>" + d.lecture_count + " chapters</span><span class='chip'>" + esc(d.duration_label || "") + "</span>" +
      (watchCount ? "<span class='chip watch'>" + watchCount + " &#9654; watchable</span>" : "<span class='chip ext'>&#8599; external reading</span>") + "</div>" +
      "<div class='bar' style='margin-top:12px'><div style='width:" + pct + "%'></div></div>" +
      "<p class='muted'>" + fmtSecs(d.watched_seconds) + " / " + fmtSecs(d.total_seconds) + " &middot; " + pct + "% complete</p>" +
      (anyWatch ? "<button class='btn primary' id='cdStart' type='button' style='margin-top:12px'>" + (ls.some(function (l) { return l.record_id; }) ? "Continue Course" : "Start Course") + "</button>" : "");
    $("cdSub").textContent = d.lecture_count + (watchCount ? " chapters &middot; " + watchCount + " watchable lectures" : " chapters &middot; guided reading path");
    $("cdList").innerHTML = ls.map(function (l, i) {
      var lp = Math.round(l.progress || 0);
      var st = l.status === "completed" ? "Completed" : (l.status === "in_progress" ? lp + "% watched" : "Not started");
      var tick = l.status === "completed" ? "&#10003; " : "&#9679; ";
      var act = l.watchable
        ? "<button class='btn primary sm' data-w='" + l.id + "' type='button'>" + (l.record_id ? "Continue" : "Start") + "</button>"
        : "<a class='btn ghost sm' href='" + esc(l.url || "#") + "' target='_blank' rel='noopener'>Open source</a>";
      return "<div class='rrow'><div><strong>" + tick + (i + 1) + ". " + esc(l.title) + "</strong>" +
        "<small>" + (l.watchable ? '<span class="chip watch">&#9654; Video</span>' : '<span class="chip ext">Reading</span>') + " &middot; " + esc(l.difficulty || "") + " &middot; " + esc(l.duration_label || "") + " &middot; " + esc(st) + "</small></div>" +
        "<div style='display:flex;gap:8px;align-items:center'>" + act +
        "<button class='btn ghost sm' data-s='" + l.id + "' type='button'>" + (l.saved ? "Saved" : "Save") + "</button></div></div>";
    }).join("") || "<div class='empty'>No chapters in this course yet.</div>";
    var st0 = $("cdStart");
    if (st0) {
      if (!anyWatch) { st0.hidden = true; }
      else st0.addEventListener("click", function () {
        var first = ls.filter(function (l) { return l.watchable && l.status !== "completed"; })[0] || ls.filter(function (l) { return l.watchable; })[0];
        if (first) startLecture(first.id, st0);
      });
    }
    $("cdList").addEventListener("click", function (e) {
      var w = e.target.closest ? e.target.closest("[data-w]") : null;
      var s = e.target.closest ? e.target.closest("[data-s]") : null;
      if (w) startLecture(parseInt(w.getAttribute("data-w"), 10), w);
      else if (s) toggleSave(parseInt(s.getAttribute("data-s"), 10), s);
    });
  } catch (e) { $("cdLoading").hidden = true; $("cdError").hidden = false; $("cdErrorMsg").textContent = (e && (e.detail || e.message)) || "Unable to load course."; }
}
async function startLecture(id, btn) {
  if (!API.getToken()) { window.location.href = "login.html?next=" + encodeURIComponent("course-details.html" + window.location.search); return; }
  if (btn) { btn.disabled = true; btn.textContent = "Opening..."; }
  try { var out = await API.startLearning(id); var rec = out && out.record; window.location.href = "learning-player.html?resource=" + id + (rec ? "&record=" + rec.id : ""); }
  catch (e) { toast((e && (e.detail || e.message)) || "Could not start."); if (btn) { btn.disabled = false; btn.textContent = "Start"; } }
}
async function toggleSave(id, btn) {
  if (!API.getToken()) { window.location.href = "login.html"; return; }
  try {
    var saved = btn.textContent.trim() === "Saved";
    if (saved) await API.removeLearningBookmark(id); else await API.addLearningBookmark(id);
    btn.textContent = saved ? "Save" : "Saved";
  } catch (e) { toast("Could not save."); }
}
document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 120); });
})();
