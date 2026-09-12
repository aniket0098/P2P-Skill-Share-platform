/* SKILLSHARE PORTAL SHELL v2 (portal-shell.js) - STAGE 2 unified nav. No backend. No auth changes. */
"use strict";

window.PortalShellNavs = {
// [sectionLabel, [[name, icon, url]]] — exact IA filenames, no renames.
student: [
[null, [["Dashboard", "&#127968;", "dashboard.html"]]],
["Discover", [["Explore", "&#128269;", "explore.html"], ["Industry Insights", "&#129518;", "industry-skills.html"], ["Opportunities", "&#128188;", "opportunities.html"]]],
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
["Company", [["Company Profile", "&#127981;", "company-profile.html"], ["Settings", "&#9881;", "recruiter-settings.html"]]]
],
faculty: [
[null, [["Faculty Dashboard", "&#127968;", "faculty-dashboard.html"]]],
["Students", [["Students", "&#129489;", "students.html"], ["Skill Gap", "&#128201;", "skill-gap.html"]]],
["Industry", [["Industry Partners", "&#129309;", "industry-partners.html"], ["Challenges", "&#127981;", "faculty-challenges.html"]]],
["Career", [["Internship Tracking", "&#127891;", "internships-tracking.html"], ["Placement Analytics", "&#128202;", "placement-analytics.html"]]],
["Profile", [["Profile", "&#128100;", "profile.html"], ["Settings", "&#9881;", "setting.html"]]]
],
shared: [
[null, [["Dashboard", "&#127968;", "dashboard.html"]]],
["Linked", [["Opportunities", "&#128188;", "opportunities.html"], ["Applications", "&#128229;", "applications.html"], ["Interviews", "&#127908;", "interviews.html"], ["Messages", "&#128172;", "messages.html"]]]
]
};

window.PortalShell = (() => {
var STORE = "skillshare_portal_role";
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
function bindShell(root) {
root.querySelectorAll("[data-goto]").forEach(function (b) {
b.addEventListener("click", function () { window.location.href = b.getAttribute("data-goto"); });
});
root.querySelectorAll("[data-role-link]").forEach(function (b) {
b.addEventListener("click", function () { try { localStorage.setItem(STORE, b.getAttribute("data-role-link")); } catch (e) {} });
});
var mb = root.querySelector("#mobileMenuBtn");
if (mb) mb.addEventListener("click", function () {
var s = document.getElementById("app-sidebar");
if (!s) return;
var open = s.classList.toggle("open");
mb.setAttribute("aria-expanded", open ? "true" : "false");
});
root.querySelectorAll("[data-notifs]").forEach(function (b) {
b.addEventListener("click", function () { window.location.href = "notifications.html"; });
});
}
function initShellProfile() {
var c = document.querySelector("#profileDropdownContainer");
if (!c || c.children.length || !window.SkillShareProfileDropdown) return;
try { window.SkillShareProfileDropdown.init("#profileDropdownContainer"); } catch (e) {}
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
.map(p => '<button type="button" data-goto="' + p[1] + '" data-role-link="' + p[0] + '" class="' + (role === p[0] ? "active" : "") + '">' + p[0][0].toUpperCase() + p[0].slice(1) + "</button>").join("");
top.innerHTML = '<div class="topbar"><div class="topbar-left">' +
'<button class="mobile-menu-btn" id="mobileMenuBtn" type="button" aria-label="Open menu" aria-expanded="false">☰</button>' +
"<div><h1>Welcome back, <span>" + esc(name) + "</span> 👋</h1><p>" + esc(TAGLINES[role] || TAGLINES.student) + "</p></div></div>" +
'<div class="topbar-right"><div class="role-switch">' + pills + "</div>" +
'<button class="notification-btn" type="button" aria-label="Notifications" data-notifs="1">🔔</button>' +
'<div id="profileDropdownContainer"></div></div></div>';
bindShell(top);
initShellProfile();
}
}
return { render: render, resolveRole: resolveRole, currentFile: currentFile };
})();
