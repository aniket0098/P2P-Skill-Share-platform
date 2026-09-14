/* Learning Player - canonical watch experience.
 * REAL progress only: unique watched seconds derived from the actual
 * media player (currentTime/duration), merged into ranges client-side
 * and unioned server-side. The runtime duration of resources that have
 * no pre-seeded length (YouTube full courses) is read from the player
 * and persisted via POST /api/learning/{id}/init. Completion happens
 * only when the actual video ends.
 */
(function () {
"use strict";
var API = window.SkillShareAPI;
var S = { res: null, rec: null, total: 0, ytRealTotal: 0, watched: new Set(),
  pending: [], lastSave: 0, timer: null, ended: false, inited: false };
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; if (h) return h + ":" + String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0"); return m + ":" + String(x).padStart(2, "0"); }
function toast(m) { var t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(window._lpT); window._lpT = setTimeout(function () { t.classList.remove("show"); }, 3000); }
function ytId(url) { var m = String(url || "").match(/(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/); return m ? m[1] : null; }
async function boot() {
  var q = new URLSearchParams(window.location.search);
  var rid = parseInt(q.get("resource") || "0", 10);
  if (!rid) return fail("Missing resource parameter.");
  if (!API.getToken()) { window.location.href = "login.html?next=" + encodeURIComponent("learning-player.html?resource=" + rid); return; }
  try {
    var d = await API.getLearningResource(rid);
    S.res = d.resource; S.rec = d.record;
    if (!S.rec) { var st = await API.startLearning(rid); S.rec = st.record; }
    S.total = parseInt((S.rec && S.rec.total_duration_seconds) || S.res.duration_seconds || 0, 10) || 0;
    S.watchable = !!S.res.media_url || !!ytId(S.res.url);
    if (!S.watchable) { renderHead(d, true); mountExternal(); return; }
    renderHead(d);
    mountPlayer();
    startLoop();
    document.addEventListener("visibilitychange", function () { if (document.hidden) save(true); });
    window.addEventListener("beforeunload", function () { save(true); });
    var extBtn = $("plExt");
    if (extBtn) extBtn.addEventListener("click", completeNow);
  } catch (e) { fail((e && (e.detail || e.message)) || "Unable to load lecture."); }
}
function fail(m) { $("plLoading").hidden = true; $("plApp").hidden = true; $("plError").hidden = false; $("plErrorMsg").textContent = m; }
function renderHead(d, external) {
  $("plLoading").hidden = true; $("plApp").hidden = false;
  var r = d.resource;
  $("plMeta").innerHTML = "<p class='eyebrow'>" + esc(r.category || "") + " &middot; " + esc(r.skill || "") + "</p><h1 style='margin:0 0 6px'>" + esc(r.title) + "</h1><p class='muted'>" + esc(r.description || "") + "</p>";
  $("plOpenSource").href = r.url || "#";
  $("plOpenSource").textContent = "Open source";
  if (r.course_key) $("crumbCourse").innerHTML = " &middot; <a href='course-details.html?course=" + encodeURIComponent(r.course_key) + "' style='color:#93c5fd'>" + esc(r.course_title || "Course") + "</a>";
  var rel = (d.related || []).concat(d.siblings || []).slice(0, 6);
  $("plRelated").innerHTML = rel.length ? rel.map(function (x) {
    return "<div class='learn-card'>" + (window.SkillShareThumbs ? window.SkillShareThumbs.thumb(x, { video: x.watchable }) : "") +
      "<h3>" + esc(x.title) + "</h3><small class='muted'>" + esc(x.skill || "") + " &middot; " + esc(x.duration_label || "") + "</small><div class='card-actions'>" +
      (x.watchable ? "<a class='btn primary sm' href='learning-player.html?resource=" + x.id + "'>Watch</a>" : "<a class='btn ghost sm' href='" + esc(x.url || "#") + "' target='_blank' rel='noopener'>Open</a>") +
      "</div></div>";
  }).join("") : "<div class='empty'>No related lectures yet.</div>";
  if (external) {
    $("plNote").textContent = "External learning resource - open the source page to learn. We do not fake video progress here.";
    $("plExt").hidden = false;
  }
  paint();
}
function mountExternal() {
  $("plVideoWrap").innerHTML = "<div class='empty'>This resource is an external page (reading/course). Open it in a new tab and complete it when you actually finish.</div>";
  $("plExt").hidden = false;
}
/* LP2 - mount the real player */
var YT_LOADING = false;
function mountPlayer() {
  var wrap = $("plVideoWrap");
  var media = S.res.media_url;
  var ytid = ytId(S.res.url);
  if (media) {
    wrap.innerHTML = "<video id='lpVideo' controls playsinline preload='metadata' style='width:100%;border-radius:12px;background:#000' src='" + esc(media) + "'></video>";
    var v = $("lpVideo");
    var resume = parseInt((S.rec && S.rec.last_position_seconds) || 0, 10) || 0;
    v.addEventListener("loadedmetadata", function () {
      try {
        var real = Math.floor(v.duration || 0);
        if (real > 0 && (S.total <= 0 || Math.abs(S.total - real) > 2)) {
          S.total = real;
          initRealDuration(real);
        }
      } catch (e) {}
      if (resume > 0 && v.duration && resume < v.duration - 4) {
        try { v.currentTime = resume; } catch (e) {}
      }
      $("plNote").textContent = "Real media - progress is unique watched time / " + fmt(S.total) + ".";
      paint();
    });
    v.addEventListener("timeupdate", function () {
      var frac = v.duration > 0 ? (v.currentTime / v.duration) : 0;
      markSecond(Math.floor(frac * S.total));
      paint();
    });
    v.addEventListener("pause", function () { save(false); });
    v.addEventListener("ended", function () { S.ended = true; save(true, true); });
  } else if (ytid) {
    wrap.innerHTML = "<div id='lpYt' style='aspect-ratio:16/9;width:100%;border-radius:12px;overflow:hidden;background:#000'></div><p class='muted small'>YouTube lecture embedded. Duration and time come from the real player API.</p>";
    loadYT(function () {
      var resume2 = parseInt((S.rec && S.rec.last_position_seconds) || 0, 10) || 0;
      S.yt = new YT.Player("lpYt", { videoId: ytid, playerVars: { rel: 0 },
        events: { onReady: function (ev) {
            try {
              var dur = Math.floor(ev.target.getDuration() || 0);
              if (dur > 0) { S.ytRealTotal = dur; S.total = dur; initRealDuration(dur); }
            } catch (e) {}
            if (resume2 > 0) { try { ev.target.seekTo(resume2, true); } catch (e) {} }
            paint();
          },
          onStateChange: function (ev) {
            if (ev.data === YT.PlayerState.ENDED) { S.ended = true; save(true, true); }
            else if (ev.data === YT.PlayerState.PAUSED) save(false);
          } } });
    });
  } else {
    mountExternal();
  }
}
function loadYT(cb) {
  if (window.YT && window.YT.Player) { cb(); return; }
  if (YT_LOADING) { var iv = setInterval(function () { if (window.YT && window.YT.Player) { clearInterval(iv); cb(); } }, 300); return; }
  YT_LOADING = true;
  var tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);
  var iv2 = setInterval(function () { if (window.YT && window.YT.Player) { clearInterval(iv2); cb(); } }, 300);
}
async function initRealDuration(dur) {
  if (S.inited || !S.rec || !dur) return;
  var recTotal = parseInt((S.rec && S.rec.total_duration_seconds) || 0, 10) || 0;
  if (recTotal && Math.abs(recTotal - dur) <= 2) return;
  S.inited = true;
  try {
    var out = await API.initLearningRecord(S.rec.id, dur);
    if (out && out.record) S.rec = out.record;
    if (S.ytset) {}
  } catch (e) { S.inited = false; }
}
/* LP3 - unique watched seconds + periodic persistence */
function markSecond(sec) {
  if (!(S.total > 0)) return;
  sec = Math.max(0, Math.min(Math.floor(sec), S.total - 1));
  if (!S.watched.has(sec)) { S.watched.add(sec); S.pending.push(sec); }
}
function toRanges(sortedSecs) {
  var ranges = [];
  var a = null, p = null;
  sortedSecs.forEach(function (s) {
    if (a === null) { a = s; p = s; }
    else if (s === p + 1) { p = s; }
    else { ranges.push([a, p + 1]); a = s; p = s; }
  });
  if (a !== null) ranges.push([a, p + 1]);
  return ranges.slice(-12);
}
function curPos() {
  var v = $("lpVideo");
  if (v && v.duration) {
    var frac = v.duration > 0 ? (v.currentTime / v.duration) : 0;
    return Math.max(0, Math.min(Math.floor(frac * S.total), S.total));
  }
  if (S.yt && S.yt.getCurrentTime) { try { return Math.max(0, Math.min(Math.floor(S.yt.getCurrentTime()), S.total)); } catch (e) {} }
  return parseInt((S.rec && S.rec.last_position_seconds) || 0, 10) || 0;
}
function paint() {
  var base = parseInt((S.rec && S.rec.watched_seconds) || 0, 10) || 0;
  var total = S.total || 0;
  var uniq = Math.min(base + S.watched.size, total || base);
  var pct = total ? Math.min(100, uniq / total * 100) : 0;
  $("plBar").style.width = pct + "%";
  $("plStats").textContent = fmt(Math.floor(uniq)) + " / " + fmt(total) + " &middot; " + Math.round(pct) + "% (unique watched)";
}
function startLoop() {
  if (S.timer) clearInterval(S.timer);
  S.timer = setInterval(function () {
    if (S.yt && S.yt.getCurrentTime && S.yt.getPlayerState) {
      try {
        if (S.yt.getPlayerState() === YT.PlayerState.PLAYING) {
          var t = Math.floor(S.yt.getCurrentTime());
          if (S.ytRealTotal > 0 && S.total > 0 && S.ytRealTotal !== S.total) {
            markSecond(Math.floor(t / S.ytRealTotal * S.total));
          } else if (S.total > 0) {
            markSecond(t);
          }
        }
      } catch (e) {}
      paint();
    }
    if (Date.now() - S.lastSave > 20000 && S.pending.length) save(false);
  }, 1000);
}
async function save(isFinal, completed) {
  if (!S.rec) return;
  if (!S.pending.length && !isFinal) return;
  var secs = Array.from(S.watched).sort(function (a, b) { return a - b; });
  var ranges = toRanges(secs);
  S.pending = [];
  S.lastSave = Date.now();
  try {
    var out = await API.saveWatchProgress(S.rec.id, {
      segments: ranges, position_seconds: curPos(),
      duration_seconds: S.total, completed: !!completed });
    if (out && out.record) {
      S.rec = out.record;
      S.watched = new Set();
      S.total = out.record.total_duration_seconds || S.total || 0;
      paint();
      if (completed || out.was_completed) toast("Lecture completed! Evidence updated.");
      else if (isFinal) toast("Progress saved.");
    }
  } catch (e) { S.pending = secs.slice(-600); }
}
function completeNow() {
  if (!S.rec) return;
  if (S.watchable) { toast("This is a watchable lecture - it completes when the video ends."); return; }
  if (S.completedFlag) { toast("Already completed."); return; }
  if (!window.confirm("Did you really finish this external course/page? This marks it COMPLETED.")) return;
  try {
    API.saveWatchProgress(S.rec.id, { segments: [], position_seconds: 0, duration_seconds: 0, completed: true })
      .then(function (out) { if (out && out.record) { S.rec = out.record; S.completedFlag = true; paint(); toast((out.message) || "Marked complete."); } })
      .catch(function (e) { toast((e && (e.detail || e.message)) || "Could not complete."); });
  } catch (e) { toast("Could not complete."); }
}
document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 120); });
})();
