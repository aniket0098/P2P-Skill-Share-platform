/* =========================================================
   SKILLSHARE — SIH 2026 PORTAL SHARED BEHAVIOUR (portal.js)
   Frontend-only UI helpers: tabs, filtering, mock chat,
   toasts. No API calls. TODO: wire to backend API later.
   ========================================================= */
"use strict";
/* portal.js v2 — STAGE 2 unified behaviour. No backend. No auth changes. */
document.addEventListener("DOMContentLoaded", function () {
if (window.PortalShell) { try { window.PortalShell.render(); } catch (e) {} }
/* Tabs: keyboard accessible (arrow keys + Enter/Space native). */
document.querySelectorAll(".tabs").forEach(function (bar) {
bar.setAttribute("role", "tablist");
var btns = Array.prototype.slice.call(bar.querySelectorAll("button[data-tab]"));
btns.forEach(function (btn, i) {
btn.setAttribute("role", "tab");
btn.setAttribute("tabindex", btn.classList.contains("active") ? "0" : "-1");
btn.addEventListener("click", function () { activate(i); });
btn.addEventListener("keydown", function (e) {
if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
e.preventDefault();
var n = (i + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length;
activate(n);
btns[n].focus();
});
});
function activate(i) {
btns.forEach(function (b, j) {
b.classList.toggle("active", i === j);
b.setAttribute("tabindex", i === j ? "0" : "-1");
});
var scope = bar.parentElement;
scope.querySelectorAll(".tab-pane").forEach(function (p) { p.classList.remove("active"); });
var pane = scope.querySelector("#" + btns[i].dataset.tab);
if (pane) pane.classList.add("active");
}
});
/* Client-side filter: input[data-filter="#gridId"] filters [data-name] children */
document.querySelectorAll("input[data-filter]").forEach(input => {
const grid = document.querySelector(input.dataset.filter);
if (!grid) return;
const empty = document.querySelector(input.dataset.empty || ".filter-empty");
input.addEventListener("input", () => {
const q = input.value.trim().toLowerCase();
let visible = 0;
grid.querySelectorAll("[data-name]").forEach(card => {
const hit = !q || (card.dataset.name || "").toLowerCase().includes(q);
card.style.display = hit ? "" : "none";
if (hit) visible++;
});
if (empty) empty.style.display = visible ? "none" : "";
});
});
/* Toasts: reuse existing dashboard .toast styles when present. */
window.portalToast = function (msg) {
var root = document.getElementById("toast-root");
if (!root) return;
var t = document.createElement("div");
t.className = "toast success";
t.setAttribute("role", "status");
t.textContent = msg;
root.appendChild(t);
setTimeout(function () { t.remove(); }, 2600);
};
document.querySelectorAll("[data-toast]").forEach(b =>
b.addEventListener("click", () => window.portalToast(b.dataset.toast)));
/* Shared role views (?role=student|recruiter on applications/interviews).
   Reads the stored workspace role too, so recruiter links persist. */
if (document.body.dataset.role === "shared") {
var q = null;
try { q = new URLSearchParams(window.location.search).get("role"); } catch (e) {}
if (!q) { try { q = localStorage.getItem("skillshare_portal_role"); } catch (e2) {} }
if (q !== "recruiter") q = "student";
document.querySelectorAll(".role-switch.shared-view button").forEach(b => {
b.classList.toggle("active", b.dataset.view === q);
b.addEventListener("click", () => {
const url = new URL(window.location.href);
url.searchParams.set("role", b.dataset.view);
window.location.href = url.toString();
});
});
document.querySelectorAll("[data-view-student]").forEach(el => { el.style.display = q === "recruiter" ? "none" : ""; });
document.querySelectorAll("[data-view-recruiter]").forEach(el => { el.style.display = q === "recruiter" ? "" : "none"; });
}
/* Mock AI coach chat (frontend simulation only) */
const coachForm = document.getElementById("coachForm");
if (coachForm) {
coachForm.addEventListener("submit", e => {
e.preventDefault();
const input = document.getElementById("coachInput");
const text = (input.value || "").trim();
if (!text) return;
const chat = document.getElementById("coachChat");
const u = document.createElement("div");
u.className = "msg user";
u.textContent = text;
chat.appendChild(u);
input.value = "";
chat.scrollTop = chat.scrollHeight;
setTimeout(() => {
const b = document.createElement("div");
b.className = "msg bot";
b.textContent = "Noted. Live AI guidance is not connected yet — for now, check the recommended next skills and Skill Mapping page. (TODO: connect career-coach API.)";
chat.appendChild(b);
chat.scrollTop = chat.scrollHeight;
}, 600);
});
}
});
