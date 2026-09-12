/* =========================================================
   STAGE 6 — Career Report bridge (additive)
   Replaces placeholder data with real backend data.
   Auth-guarded: exits silently if no valid JWT.
   ========================================================= */
(function () {
    const API = window.SkillShareAPI;
    if (!API || !API.getToken()) return;

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function safeNum(v, fallback) {
        const n = Number(v);
        return isFinite(n) ? n : (fallback != null ? fallback : 0);
    }

    function renderOverview(stats) {
        const cards = document.querySelectorAll('.grid-4 .panel.stat-card');
        if (cards.length >= 4) {
            const skillsCount = safeNum(stats.skills_count);
            const totalProjects = safeNum(stats.total_projects);
            const overallProgress = safeNum(stats.overall_progress);
            if (skillsCount > 0 || totalProjects > 0) {
                cards[2].innerHTML = '<div class="stat-top"><span class="stat-icon">📊</span></div><b>' + skillsCount + '</b><span>Skills with evidence</span>';
            }
            if (totalProjects > 0 || overallProgress > 0) {

    function renderSkillsList(skills) {
        var container = document.querySelector('.grid-2 .panel:first-child .row-list');
        if (!container) return;
        if (!skills || !skills.length) {
            container.innerHTML = '<div class="row-item"><div class="grow"><h3>No skill evidence yet</h3><p>Complete learning and build projects to grow your skills.</p></div></div>';
            return;
        }
        var top = skills.slice(0, 6);
        container.innerHTML = top.map(function (s) {
            var name = escapeHtml(s.skill_name || "Unknown");
            var level = s.level ? escapeHtml(s.level) : "—";
            var evCount = safeNum(s.evidence_count);
            var projCount = safeNum(s.project_evidence);
            var learnCount = safeNum(s.learning_evidence);
            var verified = s.is_verified;
            var badgeHtml = verified
                ? '<span class="badge green">Verified</span>'
                : '<span class="badge blue">' + evCount + ' evidence</span>';
            return '<div class="row-item"><div class="grow"><h3>' + name + ' — Level: ' + level + '</h3><p>' + projCount + ' project' + (projCount !== 1 ? "s" : "") + ' · ' + learnCount + ' learning</p></div>' + badgeHtml + '</div>';
        }).join("");
    }

    function renderEvidenceSummary(evidence) {
        var panels = document.querySelectorAll('.grid-2 .panel');
        if (panels.length < 2) return;
        var container = panels[1].querySelector('.row-list');
        if (!container) return;
        var items = (evidence && evidence.by_skill) ? evidence.by_skill.slice(0, 5) : [];
        if (!items.length) {
            container.innerHTML = '<div class="row-item"><div class="grow"><h3>No evidence yet</h3><p>Learning and project evidence will appear here.</p></div></div>';
            return;
        }
        container.innerHTML = items.map(function (e) {
            var name = escapeHtml(e.skill_name || "Unknown");
            var count = safeNum(e.evidence_count);
            var proj = safeNum(e.project_evidence);
            var learn = safeNum(e.learning_evidence);
            return '<div class="row-item"><div class="grow"><h3>' + name + '</h3><p>' + count + ' evidence item' + (count !== 1 ? "s" : "") + ' (' + proj + ' project · ' + learn + ' learning)</p></div><span class="badge blue">' + count + '</span></div>';

    function updateHeader(stats) {
        var desc = document.querySelector('.portal-head p');
        if (!desc) return;
        var parts = [];
        if (stats.total_projects > 0) parts.push(stats.total_projects + ' project' + (stats.total_projects !== 1 ? "s" : ""));
        if (stats.total_learning > 0) parts.push(stats.total_learning + ' learning record' + (stats.total_learning !== 1 ? "s" : ""));
        if (stats.skills_count > 0) parts.push(stats.skills_count + ' skill' + (stats.skills_count !== 1 ? "s" : ""));
        if (parts.length) {
            desc.textContent = 'Real data: ' + parts.join(', ') + '. Generated ' + new Date().toLocaleDateString() + '.';
        } else {
            desc.textContent = 'No data yet. Start learning and build projects to populate your career report.';
        }
    }

    async function boot() {
        try {
            const results = await Promise.all([
                API.getSkillGrowth().catch(() => null),
                API.getSkillEvidence().catch(() => null),
                API.getLearningOverview().catch(() => null)
            ]);
            var growth = results[0], evidence = results[1], overview = results[2];
            var stats = {
                total_learning: overview ? safeNum(overview.total) : 0,
                completed_learning: overview ? safeNum(overview.completed) : 0,
                total_projects: 0,
                overall_progress: overview ? safeNum(overview.overall_progress) : 0,
                skills_count: growth ? safeNum((growth.skills || []).length) : 0
            };
            try {
                var projects = await API.getMyProjects().catch(() => []);
                stats.total_projects = Array.isArray(projects) ? projects.length : (projects.projects || []).length;
            } catch (e) {}
            renderOverview(stats);
            if (growth && growth.skills) renderSkillsList(growth.skills);
            if (evidence) renderEvidenceSummary(evidence);
            updateHeader(stats);
        } catch (err) {}
    }

    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 300); });
})();

        }).join("");
    }

                cards[3].innerHTML = '<div class="stat-top"><span class="stat-icon">📈</span></div><b>' + overallProgress + '%</b><span>Learning progress</span>';
            }
        }
    }
