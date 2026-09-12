/* =========================================================
   STAGE 6 — My Learning backend bridge (additive)
   Wires existing HTML containers to real API data.
   Auth-guarded: exits silently if no valid JWT.
   ========================================================= */
(function () {
    const API = window.SkillShareAPI;
    if (!API) return;

    function fmtHours(seconds) {
        const s = Number(seconds || 0);
        if (s < 60) return "0h";
        const h = Math.floor(s / 3600);
        const m = Math.round((s % 3600) / 60);
        return m ? `${h}h ${m}m` : `${h}h`;
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function evidenceBadge(confidence) {
        const c = String(confidence || "").toLowerCase();
        if (c === "project") return "Project Evidence";
        if (c === "learning") return "Learning Evidence";
        if (c === "verified") return "Verified";
        return "Self-reported";
    }

    function evidenceBadgeClass(confidence) {
        const c = String(confidence || "").toLowerCase();
        if (c === "project") return "badge-project";

    function courseCard(item) {
        const status = String(item.status || "").toLowerCase();
        const isDone = status === "completed" || (item.progress || 0) >= 100;
        const skill = escapeHtml(item.skill_name || "General");
        const title = escapeHtml(item.resource_title || "Learning resource");
        const pct = Math.max(0, Math.min(100, Number(item.progress || 0)));
        const url = item.resource_url || "#";
        return `<article class="course${isDone ? " done" : ""}">
            <div class="course-head">
                <span class="skill-chip">${skill}</span>
                <span class="status-${isDone ? "done" : "progress"}">${isDone ? "Completed" : Math.round(pct) + "%"}</span>
            </div>
            <h4>${title}</h4>
            ${progressBar(pct)}
            <div class="course-actions">
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn-sm${isDone ? " ghost" : ""}">${isDone ? "Review" : "Continue"}</a>
            </div>
        </article>`;
    }

    function evidenceRow(ev) {
        const src = escapeHtml(ev.source_type || "unknown");
        const txt = escapeHtml(ev.evidence_text || "Evidence");
        const badge = evidenceBadge(ev.confidence);
        const cls = evidenceBadgeClass(ev.confidence);
        return `<div class="evidence-row">
            <span class="badge ${cls}">${badge}</span>
            <span class="ev-source">${src}</span>
            <span class="ev-text">${txt}</span>
        </div>`;
    }

        if (c === "learning") return "badge-learning";
        if (c === "verified") return "badge-verified";
        return "badge-self";
    }

    function renderOverview(ov) {
        const total = Number(ov.total || 0);
        const pct = Number(ov.overall_progress || 0);
        const completed = Number(ov.completed || 0);

        const pctEl = document.getElementById("overallProgressPct");
        if (pctEl) pctEl.textContent = total ? Math.round(pct) + "%" : "—";

        const enrolledEl = document.getElementById("skillsEnrolledVal");
        if (enrolledEl) enrolledEl.textContent = total ? String((ov.skills_in_progress || []).length) : "—";

        const completedEl = document.getElementById("skillsCompletedVal");
        if (completedEl) completedEl.textContent = String(completed);

        let totalSeconds = 0;
        (ov.items || []).forEach(i => { totalSeconds += Number(i.time_spent_seconds || 0); });
        const hoursEl = document.getElementById("learningHoursVal");
        if (hoursEl) hoursEl.textContent = total ? fmtHours(totalSeconds) : "—";
    }

    function renderContinueLearning(items) {
        const host = document.getElementById("continueLearningList");
        if (!host) return;
        const active = (items || []).filter(i => {
            const s = String(i.status || "").toLowerCase();
            return s !== "completed" && (i.progress || 0) < 100;
        }).slice(0, 4);
        if (!active.length) {
            host.innerHTML = `<div class="empty-state">No active learning in progress. <a href="explore.html">Explore skills to start learning</a>.</div>`;
            return;
        }
        host.innerHTML = `<div class="courses">${active.map(courseCard).join("")}</div>`;
    }

    function renderRecentCompleted(items) {
        const host = document.getElementById("recentCompletedList");
        if (!host) return;
        const done = (items || []).filter(i => {
            const s = String(i.status || "").toLowerCase();
            return s === "completed" || (i.progress || 0) >= 100;
        }).slice(0, 4);
        if (!done.length) {
            host.innerHTML = `<div class="empty-state">No completed learning yet. Keep going!</div>`;

    function renderSkillsInProgress(skills) {
        const host = document.getElementById("skillsInProgressList");
        if (!host) return;
        const list = skills || [];
        if (!list.length) {
            host.innerHTML = `<div class="empty-state">Start learning a skill to see progress here.</div>`;
            return;
        }
        host.innerHTML = list.slice(0, 6).map(s => {
            const pct = Number(s.avg_progress || 0);
            const skill = escapeHtml(s.skill || "General");
            return `<div class="skill-progress-row">
                <div class="skill-progress-head"><span>${skill}</span><span>${Math.round(pct)}%</span></div>
                ${progressBar(pct)}
                <small>${Number(s.count || 0)} resource${Number(s.count || 0) !== 1 ? "s" : ""} &middot; ${Number(s.completed || 0)} completed</small>
            </div>`;
        }).join("");
    }

    function renderEvidence(bySkill) {
        const host = document.getElementById("learningEvidenceList");
        if (!host) return;
        const skills = bySkill || [];
        if (!skills.length) {
            host.innerHTML = `<div class="empty-state">Completed learning builds evidence for your skills.</div>`;
            return;
        }
        host.innerHTML = skills.slice(0, 8).map(s => {
            const skill = escapeHtml(s.skill_name || "Unknown");
            const evs = s.evidence || [];
            const head = `<div class="ev-skill-head"><strong>${skill}</strong><span class="ev-count">${s.evidence_count} evidence${s.evidence_count !== 1 ? "s" : ""}</span></div>`;
            const rows = evs.slice(0, 3).map(evidenceRow).join("");
            return `<div class="ev-skill-block">${head}${rows}</div>`;
        }).join("");
    }

    function renderRecentActivity(items) {
        const host = document.getElementById("recentActivityList");
        if (!host) return;
        const recent = (items || []).slice(0, 5);
        if (!recent.length) {
            host.innerHTML = `<div class="empty-state">No activity yet.</div>`;
            return;
        }
        host.innerHTML = `<div class="activity-list">${recent.map(i => {
            const title = escapeHtml(i.resource_title || "Learning activity");
            const skill = escapeHtml(i.skill_name || "");
            const pct = Number(i.progress || 0);
            const when = i.updated_at ? new Date(i.updated_at).toLocaleDateString() : "";
            return `<div class="activity-row">
                <span class="activity-dot ${String(i.status || "").toLowerCase() === "completed" ? "done" : "progress"}"></span>
                <div class="activity-info">
                    <span class="activity-title">${title}</span>
                    <small>${skill}${skill && when ? " &middot; " : ""}${when}</small>
                </div>
                <span class="activity-pct">${Math.round(pct)}%</span>
            </div>`;
        }).join("")}</div>`;
    }

    async function boot() {
        if (!API.getToken()) return;
        const [overview, evidence] = await Promise.all([
            API.getLearningOverview().catch(() => null),
            API.getSkillEvidence().catch(() => null)
        ]);
        if (overview) {
            renderOverview(overview);
            renderContinueLearning(overview.items);
            renderRecentCompleted(overview.items);
            renderSkillsInProgress(overview.skills_in_progress);
            renderRecentActivity(overview.items);
        }
        if (evidence) {
            renderEvidence(evidence.by_skill);
        }
    }

    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 300));
})();

            return;
        }
        host.innerHTML = `<div class="courses">${done.map(courseCard).join("")}</div>`;
    }


    function progressBar(pct) {
        const p = Math.max(0, Math.min(100, Number(pct || 0)));
        return `<div class="progress-bar"><div class="progress-fill" style="width:${p}%"></div><span>${Math.round(p)}%</span></div>`;
    }
