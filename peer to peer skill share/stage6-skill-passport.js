/* =========================================================
   STAGE 6 — Skill Passport bridge (additive)
   Replaces placeholder data with real backend evidence.
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

    function safeNum(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function renderVerifiedSkills(skills) {
        var container = document.querySelector('.grid-3 .row-list');
        if (!container) return;
        if (!skills || !skills.length) {
            container.innerHTML = '<div class="row-item"><div class="grow"><h3>No verified skills yet</h3><p>Skill evidence from learning and projects will appear here.</p></div></div>';
            return;
        }
        container.innerHTML = skills.slice(0, 8).map(function (s) {
            var name = escapeHtml(s.skill_name || "Unknown");
            var level = s.level ? escapeHtml(s.level) : "—";
            var evCount = safeNum(s.evidence_count);
            var projCount = safeNum(s.project_evidence);
            var learnCount = safeNum(s.learning_evidence);
            var verified = s.is_verified;
            var badgeHtml = verified
                ? '<span class="badge green">Verified</span>'
                : '<span class="badge amber">Evidence</span>';
            return '<div class="row-item"><div class="grow"><h3>' + name + ' — ' + level + '</h3><p>' + projCount + ' project' + (projCount !== 1 ? 's' : '') + ' + ' + learnCount + ' learning</p></div>' + badgeHtml + '</div>';
        }).join("");
    }

    function renderEvidencePanel(evidence) {
        var panels = document.querySelectorAll('.grid-3 .panel');
        if (panels.length < 2) return;
        var container = panels[1].querySelector('.row-list');
        if (!container) return;
        var items = (evidence && evidence.by_skill) ? evidence.by_skill.slice(0, 5) : [];
        if (!items.length) {
            container.innerHTML = '<div class="row-item"><div class="grow"><h3>No evidence yet</h3><p>Complete learning and build projects to generate evidence.</p></div></div>';
            return;
        }
        container.innerHTML = items.map(function (e) {
            var name = escapeHtml(e.skill_name || "Unknown");
            var count = safeNum(e.evidence_count);
            return '<div class="row-item"><div class="grow"><h3>' + name + '</h3><p>' + count + ' evidence item' + (count !== 1 ? 's' : '') + '</p></div><span class="badge blue">' + count + '</span></div>';
        }).join("");
    }

    function renderFeedback(evidence, overview) {
        var panels = document.querySelectorAll('.grid-3 .panel');
        if (panels.length < 3) return;
        var container = panels[2].querySelector('.row-list');
        if (!container) return;
        var parts = [];
        if (overview && safeNum(overview.total) > 0) {
            parts.push('<div class="row-item"><div class="grow"><h3>Learning progress</h3><div class="progress mt"><i style="width:' + safeNum(overview.overall_progress) + '%"></i></div></div><b>' + safeNum(overview.overall_progress) + '%</b></div>');
        }
        if (evidence && evidence.by_skill) {
            var total = evidence.by_skill.reduce(function (a, b) { return a + safeNum(b.evidence_count); }, 0);
            parts.push('<div class="row-item"><div class="grow"><h3>Total evidence</h3><p>' + total + ' evidence items across ' + evidence.by_skill.length + ' skill' + (evidence.by_skill.length !== 1 ? 's' : '') + '</p></div><span class="badge blue">' + total + '</span></div>');
        }
        if (!parts.length) {
            parts.push('<div class="row-item"><div class="grow"><h3>No data yet</h3><p>Start learning and add projects to build your passport.</p></div></div>');
        }
        container.innerHTML = parts.join("");
    }

    function updateHeader(stats) {
        var desc = document.querySelector('.portal-head p');
        if (!desc) return;
        if (stats.total_evidence > 0) {
            desc.textContent = 'Your skill passport with ' + stats.total_evidence + ' evidence items from ' + stats.skills_count + ' skill' + (stats.skills_count !== 1 ? 's' : '') + '.';
        } else {
            desc.textContent = 'Your skill passport is empty. Start learning and add projects to build verified evidence.';
        }
        var badge = document.querySelector('.portal-head .badge');
        if (badge && stats.user_name) {
            badge.textContent = 'ID: ' + stats.user_name + ' (verified)';
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
            var skills = (growth && growth.skills) ? growth.skills : [];

            renderVerifiedSkills(skills);
            renderEvidencePanel(evidence);
            renderFeedback(evidence, overview);

            var totalEv = 0;
            if (evidence && evidence.by_skill) {
                totalEv = evidence.by_skill.reduce(function (a, b) { return a + safeNum(b.evidence_count); }, 0);
            }
            updateHeader({
                total_evidence: totalEv,
                skills_count: skills.length,
                user_name: ''
            });
        } catch (err) {}
    }

    document.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 300); });
})();
