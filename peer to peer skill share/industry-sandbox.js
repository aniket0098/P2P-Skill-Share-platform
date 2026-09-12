/* Industry Sandbox catalog page — Stage 7 */
(function () {
    "use strict";
    const S = { challenges: [], filters: {}, myChallenges: [], recommendations: [] };
    let searchDebounce = null;

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function diffClass(d) {
        const v = (d || "").toLowerCase();
        if (v === "beginner") return "diff-beginner";
        if (v === "advanced") return "diff-advanced";
        return "diff-intermediate";
    }
    function showToast(msg) {
        try {
            const root = document.getElementById("toast-root");
            if (!root) return;
            const t = document.createElement("div");
            t.textContent = msg;
            t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1e293b;color:#e2e8f0;padding:12px 20px;border-radius:8px;border:1px solid #38bdf8;z-index:9999;font-size:13px;";
            root.appendChild(t);
            setTimeout(() => t.remove(), 3000);
        } catch (e) {}
    }
    function val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

    async function boot() {
        if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
            window.location.href = "login.html";
            return;
        }
        bindFilters();
        await Promise.all([loadDashboard(), loadChallenges(), loadMyChallenges(), loadRecommendations()]);
    }

    async function loadDashboard() {
        try {
            const d = await window.SkillShareAPI.getSandboxDashboard();
            const s = d.stats || {};
            setText("stat-joined", s.joined || 0);
            setText("stat-progress", s.in_progress || 0);
            setText("stat-completed", s.completed || 0);
            setText("stat-skills", s.skills_demonstrated || 0);
        } catch (e) {
            setText("stat-joined", 0); setText("stat-progress", 0);
            setText("stat-completed", 0); setText("stat-skills", 0);
        }
    }

    async function loadChallenges() {
        const container = document.getElementById("sb-challenges-container");
        const params = { search: val("sb-search"), domain: val("sb-domain"),
            difficulty: val("sb-difficulty"), status: val("sb-status") };
        try {
            const d = await window.SkillShareAPI.getSandboxChallenges(params);
            S.challenges = d.challenges || [];
            S.filters = d.filters || {};
            populateDomainFilter();
            renderChallenges(container, S.challenges);
        } catch (e) {
            container.innerHTML = '<div class="sandbox-error">Unable to load challenges. ' + esc(e.message || "") + "</div>";
        }
    }

    function challengeCard(c) {
        const skills = (c.skills || []).slice(0, 4).map(s => '<span class="skill-tag">' + esc(s.skill_name) + "</span>").join("");
        const moreCount = (c.skills || []).length > 4 ? '<span class="skill-tag">+' + ((c.skills || []).length - 4) + "</span>" : "";
        const demoBadge = c.is_demo ? '<span class="demo-badge">DEMO</span>' : "";
        const timeInfo = c.estimated_time ? '<span style="color:#64748b;font-size:12px;">⏱ ' + esc(c.estimated_time) + "</span>" : "";
        return '<div class="sandbox-card"><div class="card-head"><h3>' + esc(c.title) + "</h3>" + demoBadge + "</div>" +
            '<div class="card-meta"><span class="domain-tag">' + esc(c.domain || c.industry || "General") + "</span>" +
            '<span class="diff-tag ' + diffClass(c.difficulty) + '">' + esc(c.difficulty) + "</span>" + timeInfo + "</div>" +
            '<p class="card-desc">' + esc((c.description || "").slice(0, 140)) + (c.description && c.description.length > 140 ? "..." : "") + "</p>" +
            '<div class="skill-tags">' + skills + moreCount + "</div>" +
            '<div class="card-actions"><button class="btn small primary" data-open="' + c.id + '">View Challenge</button></div></div>';
    }

    function renderChallenges(container, challenges) {
        if (!challenges || challenges.length === 0) {
            container.innerHTML = '<div class="sandbox-empty"><h3>No challenges found</h3><p>Try adjusting your filters, or check back soon for new industry challenges.</p></div>';
            return;
        }
        container.innerHTML = challenges.map(c => challengeCard(c)).join("");
        container.querySelectorAll("[data-open]").forEach(btn => {
            btn.addEventListener("click", () => {
                window.location.href = "sandbox-challenge.html?id=" + btn.dataset.open;
            });
        });
    }

    async function loadMyChallenges() {
        const container = document.getElementById("sb-my-challenges");
        try {
            const d = await window.SkillShareAPI.getMySandboxChallenges();
            S.myChallenges = d.challenges || [];
            renderMyChallenges(container, S.myChallenges);
        } catch (e) {
            container.innerHTML = '<div class="sandbox-error">Unable to load your activity. ' + esc(e.message || "") + "</div>";
        }
    }

    function statusLabel(st) {
        return { in_progress: "In Progress", submitted: "Submitted", evaluated: "Evaluated", completed: "Completed" }[st] || (st || "");
    }

    function renderMyChallenges(container, rows) {
        if (!rows || rows.length === 0) {
            container.innerHTML = '<div class="sandbox-empty"><h3>No active challenges yet</h3><p>Join a challenge above to start building real skill evidence.</p></div>';
            return;
        }
        container.innerHTML = rows.map(r => {
            const c = r.challenge || {}; const p = r.participant || {}; const sub = r.submission;
            const st = statusLabel(p.status);
            const demoBadge = c.is_demo ? '<span class="demo-badge">DEMO</span>' : "";
            const subInfo = sub && sub.status === "submitted"
                ? '<span class="card-status submitted">Submitted' + (sub.submitted_at ? " · " + new Date(sub.submitted_at).toLocaleDateString() : "") + "</span>"
                : "";
            return '<div class="sandbox-card my-challenge-card"><div class="card-head"><h3>' + esc(c.title) + "</h3>" + demoBadge + "</div>" +
                '<div class="card-meta"><span class="status-tag status-' + esc(p.status || "") + '">' + esc(st) + "</span>" + subInfo + "</div>" +
                '<div class="card-actions"><button class="btn small ghost" data-open="' + c.id + '">' +
                (p.status === "in_progress" ? "Continue" : "View Details") + "</button></div></div>";
        }).join("");
        container.querySelectorAll("[data-open]").forEach(btn => {
            btn.addEventListener("click", () => {
                window.location.href = "sandbox-challenge.html?id=" + btn.dataset.open;
            });
        });
    }



    async function loadRecommendations() {
        const container = document.getElementById("sb-recommendations");
        try {
            const d = await window.SkillShareAPI.getSandboxRecommendations();
            S.recommendations = d.recommendations || [];
            if (S.recommendations.length === 0) {
                container.innerHTML = '<div class="sandbox-empty"><p style="color:#64748b;font-size:13px;">No recommendations yet — set a target role in Skill Mapping to get challenge suggestions.</p></div>';
                return;
            }
            container.innerHTML = S.recommendations.map(r => {
                const c = r.challenge || {};
                return '<div class="sandbox-card rec-card"><div class="card-head"><h3>' + esc(c.title) + "</h3>" +
                    (c.is_demo ? '<span class="demo-badge">DEMO</span>' : "") + "</div>" +
                    '<p class="card-desc" style="color:#7dd3fc;">💡 ' + esc(r.reason || "") + "</p>" +
                    '<div class="card-actions"><button class="btn small primary" data-open="' + c.id + '">View Challenge</button></div></div>';
            }).join("");
            container.querySelectorAll("[data-open]").forEach(btn => {
                btn.addEventListener("click", () => {
                    window.location.href = "sandbox-challenge.html?id=" + btn.dataset.open;
                });
            });
        } catch (e) {
            container.innerHTML = '<div class="sandbox-empty"><p style="color:#64748b;font-size:13px;">Recommendations unavailable.</p></div>';
        }
    }

    function populateDomainFilter() {
        const sel = document.getElementById("sb-domain");
        if (!sel) return;
        const current = sel.value;
        const domains = S.filters.domains || [];
        sel.innerHTML = '<option value="">All Domains</option>' +
            domains.map(d => '<option value="' + esc(d) + '">' + esc(d) + "</option>").join("");
        sel.value = current;
    }

    function bindFilters() {
        const search = document.getElementById("sb-search");
        if (search) search.addEventListener("input", () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(loadChallenges, 400);
        });
        ["sb-domain", "sb-difficulty", "sb-status"].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener("change", loadChallenges);
        });
        const reset = document.getElementById("sb-reset");
        if (reset) reset.addEventListener("click", () => {
            if (search) search.value = "";
            ["sb-domain", "sb-difficulty"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
            const status = document.getElementById("sb-status"); if (status) status.value = "open";
            loadChallenges();
        });
    }

    document.addEventListener("DOMContentLoaded", boot);
})();
