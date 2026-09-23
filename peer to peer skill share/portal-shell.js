/* SKILLSHARE PORTAL SHELL v2 (portal-shell.js) - STAGE 2 unified nav. No backend. No auth changes. */
"use strict";

window.PortalShellNavs = {
// [sectionLabel, [[name, icon, url]]] — exact IA filenames, no renames.
student: [
[null, [["Dashboard", "&#127968;", "dashboard.html"]]],
["Discover", [["Explore Skills", "&#128269;", "explore-skills.html"], ["Industry Insights", "&#129518;", "industry-skills.html"], ["Opportunities", "&#128188;", "opportunities.html"]]],
["Learn", [["My Learning", "&#128218;", "my-learning.html"], ["Live Learning", "&#128308;", "live-learning.html"], ["Discussions", "&#129309;", "live-discussions.html"]]],
["Build", [["Industry Sandbox", "&#127981;", "industry-sandbox.html"], ["Innovation Lab", "&#128161;", "innovation-lab.html"], ["Projects", "&#128187;", "projects.html"]]],
["Career", [["Skill Mapping", "&#128506;", "skill-mapping.html"], ["AI Career Coach", "&#129302;", "ai-career-coach.html"], ["CareerVerse", "&#128640;", "careerverse.html"], ["Interview Prep", "&#127908;", "interview-prep.html"], ["DSA", "&#9000;", "dsa.html"], ["Aptitude", "&#129518;", "aptitude.html"]]],
["Connect", [["Messages", "&#128172;", "messages.html"], ["Requests", "&#128101;", "requests.html"], ["Community", "&#128483;", "community.html"], ["Calendar", "&#128197;", "calendar.html"]]],
["Profile", [["Skill Passport", "&#128700;", "skill-passport.html"], ["Career Report", "&#128202;", "career-report.html"], ["Profile", "&#128100;", "profile.html"], ["Notifications", "&#128276;", "notifications.html"], ["Settings", "&#9881;", "setting.html"]]],
["More", [["Credits", "&#129473;", "credits.html"], ["Reviews", "&#11088;", "reviews.html"], ["Leaderboard", "&#127942;", "leaderboard.html"], ["Bookmarks", "&#9825;", "bookmarks.html"], ["Create Session", "&#10133;", "create-session.html"]]]
],
recruiter: [
[null, [["Recruiter Dashboard", "&#127968;", "recruiter-dashboard.html"]]],
["Talent", [["Find Talent", "&#128269;", "find-talent.html"], ["Talent Pool", "&#11088;", "talent-pool.html"]]],
["Hiring", [["Jobs", "&#128188;", "jobs.html"], ["Internships", "&#127891;", "internships.html"], ["Applications", "&#128229;", "applications.html?role=recruiter"], ["Interviews", "&#127908;", "interviews.html?role=recruiter"]]],
["Industry", [["Industry Challenges", "&#127981;", "industry-challenges.html"]]],
["Communication", [["Messages", "&#128172;", "messages.html"], ["Calendar", "&#128197;", "calendar.html"]]],
["Analytics", [["Hiring Analytics", "&#128202;", "hiring-analytics.html"]]],
["Company", [["Company Profile", "&#127981;", "company-profile.html"], ["Settings", "&#9881;", "setting.html"], ["Credits", "&#129473;", "credits.html"]]]
],
faculty: [
[null, [["Faculty Dashboard", "&#127968;", "faculty-dashboard.html"]]],
["Students", [["Students", "&#129489;", "students.html"], ["Skill Gap", "&#128201;", "skill-gap.html"]]],
["Industry", [["Industry Partners", "&#129309;", "industry-partners.html"], ["Challenges", "&#127981;", "faculty-challenges.html"]]],
["Career", [["Internship Tracking", "&#127891;", "internships-tracking.html"], ["Placement Analytics", "&#128202;", "placement-analytics.html"]]],
["Profile", [["Profile", "&#128100;", "profile.html"], ["Settings", "&#9881;", "setting.html"], ["Credits", "&#129473;", "credits.html"]]]
],
shared: [
[null, [["Dashboard", "&#127968;", "dashboard.html"]]],
["Linked", [["Opportunities", "&#128188;", "opportunities.html"], ["Applications", "&#128229;", "applications.html"], ["Interviews", "&#127908;", "interviews.html"], ["Messages", "&#128172;", "messages.html"]]]
]
};

window.PortalShell = (() => {
var STORE = "skillshare_portal_role";
/* ---- Stage 32: shared UI preference applier (device-scoped) ----
   Theme / density / reduced-motion / larger-text live in localStorage
   (a genuine device preference, NOT account data). Defined idempotently
   in BOTH shells (first definition wins; behaviour identical), and kept
   in sync with dashboard.js via the existing skillshare_theme key.
   Settings pushes live changes with window.SkillShareUIPrefs.set(...). */
if (!window.SkillShareUIPrefs) {
  window.SkillShareUIPrefs = (function () {
    var KEY = "skillshare_ui_prefs";
    var THEME_KEY = "skillshare_theme";
    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    }
    function save(prefs) { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} }
    function themeChoice() {
      var c = load().themeChoice;
      return c === "light" || c === "dark" || c === "system" ? c : "dark";
    }
    function resolvedTheme() {
      if (themeChoice() === "system") {
        try { return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; }
        catch (e) { return "dark"; }
      }
      return themeChoice();
    }
    function setAttrs(name, value) {
      try { document.documentElement.setAttribute(name, value); } catch (e) {}
      try { if (document.body) document.body.setAttribute(name, value); } catch (e) {}
    }
    function apply() {
      var p = load();
      var theme = resolvedTheme();
      try { localStorage.setItem(THEME_KEY, theme === "light" ? "light" : "dark"); } catch (e) {}
      setAttrs("data-theme", theme);
      setAttrs("data-density", p.density === "compact" ? "compact" : "comfortable");
      setAttrs("data-reduced-motion", p.reducedMotion ? "true" : "false");
      setAttrs("data-text-scale", p.largeText ? "large" : "normal");
      try {
        if (document.body) document.body.classList.toggle("light-theme", theme === "light");
      } catch (e) {}
    }
    function set(patch) {
      var p = load();
      for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) p[k] = patch[k]; }
      save(p); apply(); return p;
    }
    return { load: load, save: save, apply: apply, set: set,
             resolvedTheme: resolvedTheme, themeChoice: themeChoice };
  })();
  document.addEventListener("DOMContentLoaded", function () {
    try { window.SkillShareUIPrefs.apply(); } catch (e) {}
  });
}
const TAGLINES = {
student: "Ready to learn, share and grow today?",
recruiter: "Find verified talent with real skill evidence.",
faculty: "Track cohort readiness and industry collaboration.",
shared: "One pipeline, viewed by role."
};
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function currentFile() {
const b = document.body && document.body.dataset && document.body.dataset.page;
if (b) return b.toLowerCase().split("?")[0].split("#")[0];
return (window.location.pathname.split("/").pop() || "dashboard.html").toLowerCase().split("?")[0];
}
function resolveRole() {
let r = (document.body && document.body.dataset && document.body.dataset.role) || null;
if (r === "shared") {
try {
var q = new URLSearchParams(window.location.search).get("role");
if (q && window.PortalShellNavs[q]) return q;
} catch (e) {}
try { r = localStorage.getItem(STORE); } catch (e2) {}
if (r && r !== "shared" && window.PortalShellNavs[r]) return r;
return "student";
}
if (!r) { try { r = new URLSearchParams(window.location.search).get("role"); } catch (e) {} }
if (!r) { try { r = localStorage.getItem(STORE); } catch (e) {} }
if (!r) r = "student";
return window.PortalShellNavs[r] ? r : "student";
}
/* ---- Mobile drawer (additive, mobile-only behaviour) ----
   The existing off-canvas CSS in dashboard.css / portal.css /
   portal-shell.css is untouched; this only adds the interaction the
   drawer was missing: backdrop, tap-outside close, Escape close,
   close on nav selection, scroll lock and aria state. */
var shellDrawerBound = false;
function shellNavOpen() {
var s = document.getElementById("app-sidebar");
return !!(s && s.classList.contains("open"));
}
function setShellNav(open) {
var s = document.getElementById("app-sidebar");
if (!s) return;
s.classList.toggle("open", open);
var b = document.getElementById("portalShellBackdrop");
if (b) b.classList.toggle("show", open);
var btn = document.getElementById("mobileMenuBtn");
if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
/* portal-nav-open is only honoured by the <=900px media query in
   portal-shell.css, so desktop scrolling can never be affected. */
document.body.classList.toggle("portal-nav-open", open);
}
function initShellDrawer() {
if (shellDrawerBound) return;
shellDrawerBound = true;
var backdrop = document.createElement("div");
backdrop.id = "portalShellBackdrop";
document.body.appendChild(backdrop);
backdrop.addEventListener("click", function () { setShellNav(false); });
document.addEventListener("keydown", function (e) {
if (e.key === "Escape" && shellNavOpen()) setShellNav(false);
});
var side = document.getElementById("app-sidebar");
if (side) {
side.addEventListener("click", function (e) {
var t = e.target;
var link = t && t.closest ? t.closest("a") : null;
if (!link) return;
if (window.matchMedia && window.matchMedia("(max-width:900px)").matches) {
setShellNav(false);
}
});
}
if (window.matchMedia) {
var mq = window.matchMedia("(min-width:901px)");
var onMQ = function () { if (mq.matches) setShellNav(false); };
if (mq.addEventListener) mq.addEventListener("change", onMQ);
else if (mq.addListener) mq.addListener(onMQ);
}
}
function bindShell(root) {
root.querySelectorAll("[data-goto]").forEach(function (b) {
b.addEventListener("click", function () { window.location.href = b.getAttribute("data-goto"); });
});
root.querySelectorAll("[data-role-link]").forEach(function (b) {
b.addEventListener("click", function () { try { localStorage.setItem(STORE, b.getAttribute("data-role-link")); } catch (e) {} });
});
var mb = root.querySelector("#mobileMenuBtn");
if (mb) {
mb.setAttribute("aria-controls", "app-sidebar");
mb.addEventListener("click", function () { setShellNav(!shellNavOpen()); });
}
root.querySelectorAll("[data-notifs]").forEach(function (b) {
b.addEventListener("click", function () { window.location.href = "notifications.html"; });
});
}
function initShellProfile() {
var c = document.querySelector("#profileDropdownContainer");
if (!c || c.children.length) return;
if (window.SkillShareProfileDropdown) {
    try { window.SkillShareProfileDropdown.init("#profileDropdownContainer"); } catch (e) {}
    return;
}
/* Pages that already ship the API layer (config.js + api-client.js)
   get the shared profile component on demand; pages without it keep
   today's behaviour so no unexpected auth flow is introduced. */
if (window.SkillShareAPI && typeof window.SkillShareAPI.getToken === "function") {
    loadSharedScript("components/profile-dropdown.js", function () {
        try { window.SkillShareProfileDropdown.init("#profileDropdownContainer"); } catch (e) {}
    });
}
}
function initShellCredits() {
var chip = document.querySelector("[data-credits-chip]");
if (!chip) return;
if (window.SkillShareCreditsChip) {
    try { window.SkillShareCreditsChip.mount("[data-credits-chip]"); } catch (e) {}
    return;
}
if (window.SkillShareAPI && typeof window.SkillShareAPI.getToken === "function") {
    loadSharedScript("components/credits-chip.js", function () {
        try { window.SkillShareCreditsChip.mount("[data-credits-chip]"); } catch (e) {}
    });
}
}
function loadSharedScript(src, onload) {
/* Dedupe by src so the shared component is never injected/executed
   twice (no duplicate listeners, no duplicate API calls), even when
   portal-shell.js and portal-unify.js both ask for it. */
var s = document.querySelector('script[data-ss-src="' + src + '"]');
if (!s) {
    s = document.createElement("script");
    s.src = src; s.async = true;
    s.setAttribute("data-ss-src", src);
    s.addEventListener("load", function () { s.dataset.ssLoaded = "1"; });
    document.head.appendChild(s);
}
if (typeof onload === "function") {
    if (s.dataset.ssLoaded) { onload(); return; }
    s.addEventListener("load", onload);
}
}
function ensureSharedStyles() {
/* The shell-rendered profile container and credits chip need their
   shared stylesheets on pages that never linked them. Marker-guarded
   so portal-unify.js and portal-shell.js never inject twice. */
["components/profile-dropdown.css", "components/credits-chip.css"].forEach(function (href) {
    var key = href.split("/").pop();
    if (document.querySelector('link[data-ss-shared="' + key + '"]')) return;
    var l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    l.setAttribute("data-ss-shared", key);
    document.head.appendChild(l);
});
}
function render(role, page) {
role = role || resolveRole();
page = String(page || currentFile()).split("?")[0].split("#")[0];
try{
if(!document.querySelector('link[data-ds="1"]')){
var ds=document.createElement('link');ds.rel='stylesheet';ds.href='design-system.css';ds.setAttribute('data-ds','1');
document.head.appendChild(ds);
}
}catch(e){}
try { ensureSharedStyles(); } catch (e) {}
try { localStorage.setItem(STORE, role); } catch (e) {}
const sections = window.PortalShellNavs[role] || window.PortalShellNavs.student;
const side = document.getElementById("app-sidebar");
if (side && !side.dataset.bound) {
side.dataset.bound = "1";
const nav = sections.map(sec => {
const label = sec[0] ? '<span class="sidebar-nav-label">' + esc(sec[0]) + "</span>" : "";
const links = sec[1].map(l => {
const active = page === l[2].toLowerCase().split("?")[0] ? "active" : "";
return '<a href="' + l[2] + '" class="' + active + '"' + (active ? ' aria-current="page"' : "") + '><span class="icon">' + l[1] + "</span><span>" + esc(l[0]) + "</span></a>";
}).join("");
return label + links;
}).join("");
side.innerHTML = '<div class="sidebar"><div class="logo-area"><div class="logo-icon">SC</div>' +
'<div class="logo-text"><h2>SkillConnect</h2><span>Share Skills. Grow Together.</span></div></div>' +
'<nav class="sidebar-nav" aria-label="Primary">' + nav + "</nav>" +
'<div class="sidebar-promo"><h3>Academia × Industry<br>SIH 2026 Portal</h3>' +
"<p>Skills mapped to real opportunities.</p>" +
'<button type="button" class="share-skill-btn" data-goto="explore.html">Explore</button></div></div>';
bindShell(side);
} else if (side) {
side.querySelectorAll(".sidebar-nav a").forEach(function (a) {
var on = (a.getAttribute("href") || "").toLowerCase().split("?")[0].split("/").pop() === page;
a.classList.toggle("active", on);
if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
});
}
const top = document.getElementById("app-topbar");
if (top && !top.dataset.bound) {
top.dataset.bound = "1";
let name = "member";
try { const u = window.SkillShareAPI && window.SkillShareAPI.getUser && window.SkillShareAPI.getUser(); if (u && u.name) name = u.name.split(" ")[0]; } catch (e) {}
const pills = [["student", "dashboard.html"], ["recruiter", "recruiter-dashboard.html"], ["faculty", "faculty-dashboard.html"]]
.map(p => '<button type="button" data-goto="' + p[1] + '" data-role-link="' + p[0] + '"' +
' data-short="' + p[0][0].toUpperCase() + '"' +
' aria-label="Switch to ' + p[0] + ' view" title="Switch to ' + p[0] + ' view"' +
' class="' + (role === p[0] ? "active" : "") + '">' + p[0][0].toUpperCase() + p[0].slice(1) + "</button>").join("");
top.innerHTML = '<div class="topbar"><div class="topbar-left">' +
'<button class="mobile-menu-btn" id="mobileMenuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="app-sidebar">☰</button>' +
"<div><h1>Welcome back, <span>" + esc(name) + "</span> 👋</h1><p>" + esc(TAGLINES[role] || TAGLINES.student) + "</p></div></div>" +
'<div class="topbar-right"><div class="role-switch">' + pills + "</div>" +
'<button class="notification-btn" type="button" aria-label="Notifications" data-notifs="1">🔔</button>' +
/* Credits chip: [🔔 Notifications][🪙 Credits][👤 Profile] — links to the
   EXISTING credits page and shows the REAL server-side balance via
   SkillShareCreditsChip (read-only, no localStorage authority). */
'<a class="credits-chip" href="credits.html" data-credits-chip title="Your credit balance">' +
'<span class="cc-coin">&#129473;</span><span class="cc-num" data-credits-value>—</span>' +
'<span class="cc-label">Credits</span></a>' +
'<div id="profileDropdownContainer"></div></div></div>';
bindShell(top);
initShellDrawer();
initShellProfile();
initShellCredits();
}
}
return { render: render, resolveRole: resolveRole, currentFile: currentFile };
})();
