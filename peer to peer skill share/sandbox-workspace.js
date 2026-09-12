
/* Sandbox workspace - Stage 7 */
(function () {
    "use strict";
    const S = { c: null, sub: null, tasks: [], res: [], active: 0, tout: null };
    function esc(v) { return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function toast(msg) { try { const r = document.getElementById("toast-root"); if (!r) return; const t = document.createElement("div"); t.textContent = msg;
        t.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1e293b;color:#e2e8f0;padding:12px 20px;border-radius:8px;border:1px solid #38bdf8;z-index:9999;font-size:13px;"; r.appendChild(t); setTimeout(() => t.remove(), 3000); } catch (e) {} }
    function getParam(n) { return new URLSearchParams(window.location.search).get(n); }

    async function boot() {
        if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) { window.location.href = "login.html"; return; }
        const id = getParam("id"); if (!id) { window.location.href = "industry-sandbox.html"; return; }
        try { const d = await window.SkillShareAPI.getSandboxWorkspace(id); S.c = d; S.sub = d.submission; S.tasks = d.tasks || []; S.res = d.resources || []; render(); }
        catch (e) { document.getElementById("workspace-root").innerHTML = '<div class="sandbox-error">Unable to load. ' + esc(e.message || "") + "</div>"; }
    }

    function render() {
        const c = S.c; const el = document.getElementById("workspace-root");
        if (!c) { el.innerHTML = '<div class="sandbox-empty"><h3>Unavailable</h3></div>'; return; }
        const locked = S.sub && S.sub.status === "submitted";
        el.innerHTML = '<div style="margin-bottom:12px;"><a href="sandbox-challenge.html?id=' + c.id + '" style="color:#38bdf8;text-decoration:none;font-size:13px;">&larr; Back</a><span style="color:#64748b;margin-left:16px;font-size:13px;">' + esc(c.title) + '</span>' + (locked ? '<span class="badge green" style="margin-left:12px;">Submitted</span>' : "") + '</div>' +
            '<div class="sandbox-workspace"><div class="ws-panel"><h4>Tasks</h4>' + (S.tasks.map((t, i) => '<div class="ws-task-item' + (i === S.active ? ' active' : '') + '" data-task="' + i + '"><div class="ws-task-title">' + (i+1) + ". " + esc(t.title) + '</div><div class="ws-task-type">' + esc(t.task_type) + "</div></div>").join("") || '<p style="color:#64748b;font-size:13px;">No tasks.</p>') + '</div>' +
            '<div class="ws-center"><div class="ws-editor-area"><h3 style="color:#f1f5f9;margin:0;font-size:14px;">' + (S.tasks[S.active] ? esc(S.tasks[S.active].title) : "Your Solution") + '</h3>' +
            '<textarea id="ws-content" placeholder="Write your solution..."' + (locked ? ' disabled' : '') + '>' + esc(S.sub ? (S.sub.content || "") : "") + '</textarea>' +
            '<input type="text" id="ws-github" placeholder="GitHub URL (optional)" value="' + esc(S.sub ? (S.sub.github_url || "") : "") + '" style="background:#0f172a;border:1px solid #334155;color:#e2e8f0;padding:8px 12px;border-radius:8px;font-size:13px;"' + (locked ? ' disabled' : '') + '>' +
            '</div><div class="ws-toolbar">' + (locked ? '<span style="color:#4ade80;font-size:13px;">Submitted</span>' : '<button class="btn small ghost" id="ws-save-btn">Save Draft</button><button class="btn small primary" id="ws-submit-btn">Submit</button><span class="ws-save-status" id="ws-save-status"></span>') + '</div></div>' +
            '<div class="ws-panel"><h4>Resources</h4>' + (S.res.map(r => '<div class="ws-resource-item"><a href="' + esc(r.url || "#") + '" target="_blank">' + esc(r.title) + '</a><div class="ws-res-type">' + esc(r.resource_type || "link") + "</div></div>").join("") || "") + '<h4 style="margin-top:16px;">Skills</h4><div class="skill-tags">' + (c.skills || []).map(s => '<span class="skill-tag">' + esc(s.skill_name) + "</span>").join("") + "</div></div></div>";
        el.querySelectorAll(".ws-task-item").forEach(item => { item.addEventListener("click", () => { S.active = parseInt(item.dataset.task); render(); }); });
        if (!locked) {
            const ta = document.getElementById("ws-content"); const st = document.getElementById("ws-save-status");
            if (ta) ta.addEventListener("input", () => { st && (st.textContent = "Typing..."); clearTimeout(S.tout); S.tout = setTimeout(() => saveDraft(true), 3000); });
            const sb = document.getElementById("ws-save-btn"); const ub = document.getElementById("ws-submit-btn");
            if (sb) sb.addEventListener("click", () => saveDraft(false));
            if (ub) ub.addEventListener("click", () => submitSolution());
        }
    }

    async function saveDraft(silent) {
        try { const data = { content: document.getElementById("ws-content").value }; const gh = document.getElementById("ws-github"); if (gh) data.github_url = gh.value;
            const d = await window.SkillShareAPI.saveSandboxDraft(S.c.id, data); S.sub = d.submission; const st = document.getElementById("ws-save-status");
            if (st) { st.textContent = "Saved " + new Date().toLocaleTimeString(); st.classList.add("saved"); } if (!silent) toast("Draft saved");
        } catch (e) { if (!silent) toast(e.message || "Could not save"); }
    }

    async function submitSolution() {
        const ta = document.getElementById("ws-content"); if (!ta || !ta.value.trim()) { toast("Please write something first."); return; }
        if (!confirm("Once submitted, this will be sent for evaluation. Continue?")) return;
        try { const data = { content: ta.value }; const gh = document.getElementById("ws-github"); if (gh) data.github_url = gh.value;
            await window.SkillShareAPI.submitSandbox(S.c.id, data); toast("Submitted!"); setTimeout(() => { window.location.href = "sandbox-challenge.html?id=" + S.c.id; }, 1500);
        } catch (e) { toast(e.message || "Could not submit"); }
    }

    document.addEventListener("DOMContentLoaded", boot);
})();
