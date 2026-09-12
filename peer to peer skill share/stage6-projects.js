/* =========================================================
   STAGE 6 — Projects backend bridge (additive)
   Adds a "My Projects (Mine)" section with real API data.
   Auth-guarded: exits silently if no valid JWT.
   Does NOT rewrite the existing community project gallery.
   ========================================================= */
(function () {
    const API = window.SkillShareAPI;
    if (!API) return;

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function statusBadgeClass(status) {
        const s = String(status || "").toLowerCase();
        if (s === "published" || s === "completed") return "published";
        if (s === "draft") return "draft";
        return "progress";
    }

    function statusBadgeLabel(status) {
        const s = String(status || "").toLowerCase();
        if (s === "published") return "Published";
    function projectCard(project) {
        const title = escapeHtml(project.title || "Untitled Project");
        const desc = escapeHtml((project.description || "").slice(0, 140));
        const techs = (project.technologies || []).slice(0, 5);
        const techHtml = techs.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("");
        const skillsHtml = (project.skills_demonstrated || []).slice(0, 4).map(s =>
            `<span class="ev-chip">${escapeHtml(typeof s === "string" ? s : (s.skill_name || ""))}</span>`
        ).join("");
        const evCount = Number(project.evidence_count || 0);
        const statusClass = statusBadgeClass(project.status);
        const statusLabel = statusBadgeLabel(project.status);
        const hasGithub = !!(project.github_url || "").trim();
        const hasDemo = !!(project.demo_url || "").trim();
        const id = Number(project.id);

        return `<article class="project-card-mine" data-id="${id}">
            <div class="card-mine-head">
                <h4>${title}</h4>
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <p class="card-mine-desc">${desc}${desc.length >= 140 ? "…" : ""}</p>
            ${techHtml ? `<div class="chips">${techHtml}</div>` : ""}
            ${skillsHtml ? `<div class="ev-skills-row"><span class="ev-label">Skills:</span>${skillsHtml}</div>` : ""}
            ${evCount ? `<div class="ev-indicator"><span class="badge-project">${evCount} evidence item${evCount !== 1 ? "s" : ""}</span></div>` : ""}
            <div class="card-mine-actions">
                ${hasGithub ? `<a href="${escapeHtml(project.github_url)}" target="_blank" rel="noopener" class="btn-sm">GitHub</a>` : ""}
                ${hasDemo ? `<a href="${escapeHtml(project.demo_url)}" target="_blank" rel="noopener" class="btn-sm ghost">Demo</a>` : ""}
                <a href="projects.html?mine=${id}" class="btn-sm ghost">View</a>
            </div>
        </article>`;

    function mineEmptyState() {
        return `<div class="empty-state-mine">
            <p>No projects yet.</p>
            <p>Build your first project to start collecting skill evidence.</p>
            <a href="projects.html?create=1" class="btn-sm">Create Project</a>
        </div>`;
    }

    function renderMyProjects(container, projects) {
        if (!container) return;
        if (!projects || !projects.length) {
            container.innerHTML = mineEmptyState();
            return;
        }
        const published = projects.filter(p => {
            const s = String(p.status || "").toLowerCase();
            return s === "published" || s === "completed";
        }).length;
        const inProgress = projects.length - published;
        const skills = new Set();
        projects.forEach(p => (p.skills_demonstrated || []).forEach(s => {
            const name = typeof s === "string" ? s : (s.skill_name || "");
            if (name) skills.add(name);
        }));

        container.innerHTML = `
            <div class="mine-stats">
                <div class="mine-stat"><b>${projects.length}</b><small>Total Projects</small></div>
                <div class="mine-stat"><b>${published}</b><small>Published</small></div>
                <div class="mine-stat"><b>${inProgress}</b><small>In Progress</small></div>
                <div class="mine-stat"><b>${skills.size}</b><small>Skills Demonstrated</small></div>
            </div>
            <div class="mine-grid">${projects.map(projectCard).join("")}</div>
        `;
    }

    function injectMineSection() {
        const hero = document.querySelector(".hero");
        if (!hero || !hero.parentNode) return null;
        const section = document.createElement("section");
        section.id = "stage6MineProjects";
        section.className = "mine-projects-section";
        section.innerHTML = `
            <div class="sectionhead">
                <h2>My Projects</h2>
                <a href="projects.html?create=1" class="btn-sm">+ New Project</a>
            </div>
            <div id="mineProjectsContainer">
                <div class="empty-state">Loading your projects…</div>
            </div>
        `;
        hero.parentNode.insertBefore(section, hero.nextSibling);
        return document.getElementById("mineProjectsContainer");
    }

    async function boot() {
        if (!API.getToken()) return;
        const container = injectMineSection();
        if (!container) return;
        try {
            const data = await API.getMyProjects();
            const projects = Array.isArray(data) ? data : (data.projects || []);
            renderMyProjects(container, projects);
        } catch (err) {
            container.innerHTML = `<div class="empty-state">Unable to load projects. <button onclick="location.reload()" class="btn-sm ghost">Retry</button></div>`;
        }
    }

    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 400));
})();

    }

        if (s === "completed") return "Completed";
        if (s === "draft") return "Draft";
        return "In Progress";
    }
