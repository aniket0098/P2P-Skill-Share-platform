
/* Sandbox challenge detail - Stage 7 */
(function () {
    "use strict";
    const S = { c: null, p: null };
    function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function showToast(msg) {
        try { const r = document.getElementById("toast-root"); if (!r) return; const t = document.createElement("div"); t.textContent = msg;
            t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1e293b;color:#e2e8f0;padding:12px 20px;border-radius:8px;border:1px solid #38bdf8;z-index:9999;font-size:13px;";
            r.appendChild(t); setTimeout(() => t.remove(), 3000); } catch (e) {}
    }
    function getParam(n) { return new URLSearchParams(window.location.search).get(n); }
    function diffClass(d) { const v = (d || "").toLowerCase(); return v === "beginner" ? "diff-beginner" : v === "advanced" ? "diff-advanced" : "diff-intermediate"; }

    async function boot() {
        if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) { window.location.href = "login.html"; return; }
        const id = getParam("id"); if (!id) { window.location.href = "industry-sandbox.html"; return; }
        try {
            const d = await window.SkillShareAPI.getMySandboxChallenge(id).catch(() => null);
            if (d && d.participant) { S.c = d; S.p = d.participant; } else { S.c = await window.SkillShareAPI.getSandboxChallenge(id); }
            render();
        } catch (e) { document.getElementById("challenge-detail").innerHTML = '<div class="sandbox-error">Unable to load. ' + esc(e.message || "") + "</div>"; }
    }

    function render() {
        const c = S.c; const el = document.getElementById("challenge-detail");
        if (!c) { el.innerHTML = '<div class="sandbox-empty"><h3>Not found</h3></div>'; return; }
        const skills = (c.skills || []).map(s => '<span class="skill-tag">' + esc(s.skill_name) + "</span>").join("");
        const tasks = (c.tasks || []).map((t, i) => '<div class="ws-task-item"><div class="ws-task-title">' + (i+1) + ". " + esc(t.title) + "</div></div>").join("");
        const resources = (c.resources || []).map(r => '<div class="ws-resource-item"><a href="' + esc(r.url || "#") + '" target="_blank">' + esc(r.title) + '</a><div class="ws-res-type">' + esc(r.resource_type || "link") + "</div></div>").join("");
        const joined = !!S.p; const sl = joined ? (S.p.status || "in_progress") : "not_joined";
        let actionBtn = ""; if (!joined) actionBtn = '<button class="btn primary" id="sb-start-btn">Start Challenge</button>';
        else if (sl === "in_progress" || sl === "submitted") actionBtn = '<button class="btn primary" id="sb-continue-btn">Continue</button>';
        else actionBtn = '<button class="btn primary" id="sb-view-btn">View</button>';

        el.innerHTML = '<div style="margin-bottom:16px;"><a href="industry-sandbox.html" style="color:#38bdf8;text-decoration:none;font-size:13px;">&larr; Back</a></div>' +
            '<div class="sandbox-hero"><h1 style="margin:0;">' + esc(c.title) + (c.is_demo ? ' <span class="demo-badge">DEMO</span>' : '') + '</h1>' +
            '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;"><span class="domain-tag">' + esc(c.domain || "General") + '</span><span class="diff-tag ' + diffClass(c.difficulty) + '">' + esc(c.difficulty) + "</span>" + (c.estimated_time ? '<span style="color:#94a3b8;font-size:13px;">' + esc(c.estimated_time) + "</span>" : "") + "</div></div>" +
            '<div style="display:grid;grid-template-columns:1fr 300px;gap:20px;">' +
            '<div><div class="panel" style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;">' +
            '<h3 style="color:#f1f5f9;margin:0 0 8px 0;">Problem Statement</h3><p style="color:#94a3b8;line-height:1.6;">' + esc(c.description) + "</p>" +
            (c.business_context ? '<h4 style="color:#38bdf8;font-size:13px;margin:16px 0 4px 0;">Business Context</h4><p style="color:#94a3b8;">' + esc(c.business_context) + "</p>" : "") + "</div>" +
            (tasks ? '<div class="panel mt" style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;"><h3 style="color:#f1f5f9;margin:0 0 12px 0;">Tasks</h3>' + tasks + "</div>" : "") + "</div>" +
            '<div><div class="panel" style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;">' +
            '<h4 style="color:#94a3b8;font-size:12px;text-transform:uppercase;margin:0 0 8px 0;">Required Skills</h4><div class="skill-tags" style="margin-bottom:16px;">' + skills + "</div>" +
            '<h4 style="color:#94a3b8;font-size:12px;text-transform:uppercase;margin:16px 0 4px 0;">Company</h4><p style="color:#e2e8f0;font-size:14px;">' + esc(c.company_name || "Platform Demo") + '</p>' +
            '<div style="margin-top:16px;">' + actionBtn + "</div></div>" +
            (resources ? '<div class="panel mt" style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;"><h4 style="color:#94a3b8;font-size:12px;text-transform:uppercase;margin:0 0 8px 0;">Resources</h4>' + resources + "</div>" : "") + "</div></div>";

        const sb = document.getElementById("sb-start-btn"); const cb = document.getElementById("sb-continue-btn"); const vb = document.getElementById("sb-view-btn");
        if (sb) sb.addEventListener("click", async () => { sb.disabled = true; try { await window.SkillShareAPI.startSandboxChallenge(c.id); window.location.href = "sandbox-workspace.html?id=" + c.id; } catch (e) { showToast(e.message || "Could not start"); sb.disabled = false; } });
        if (cb) cb.addEventListener("click", () => { window.location.href = "sandbox-workspace.html?id=" + c.id; });
        if (vb) vb.addEventListener("click", () => { window.location.href = "sandbox-workspace.html?id=" + c.id; });
    }
    document.addEventListener("DOMContentLoaded", boot);
})();
