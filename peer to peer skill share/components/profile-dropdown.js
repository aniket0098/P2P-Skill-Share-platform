/* =========================================================
   SKILLSHARE — SHARED PROFILE DROPDOWN COMPONENT
   Used across all authenticated pages.
   Handles: open/close/toggle, outside click, Escape key,
   profile navigation, settings navigation, logout.
   Uses existing authentication: SkillShareAPI, SkillShareAuth
========================================================= */

window.SkillShareProfileDropdown = (() => {
    let isOpen = false;
    let cachedUser = null;
    let initialized = false;

    const ROLE_LABELS = {
        student: "STUDENT",
        recruiter: "COMPANY RECRUITER",
        mentor: "INDUSTRY MENTOR",
        admin: "ADMIN",
    };

    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function getInitials(name) {
        return String(name || "?").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
    }

    function getRoleLabel(role) {
        return ROLE_LABELS[role] || String(role || "MEMBER").toUpperCase();
    }

    async function getCurrentUser() {
        if (cachedUser) return cachedUser;
        if (window.SkillShareAPI) {
            const sessionUser = window.SkillShareAPI.getUser();
            if (sessionUser && sessionUser.id) { cachedUser = sessionUser; return cachedUser; }
        }
        if (window.SkillShareAuth) {
            try {
                const user = await window.SkillShareAuth.getCurrentUser();
                if (user && user.id) { cachedUser = user; return cachedUser; }
            } catch (error) { console.warn("[ProfileDropdown] Could not fetch user:", error.message); }
        }
        return null;
    }

    function renderDropdownHTML(user) {
        const name = user?.name || "Member";
        const role = user?.role || "student";
        const roleLabel = getRoleLabel(role);
        const initials = getInitials(name);
        const avatarUrl = user?.avatar_url || null;
        const avatarHTML = avatarUrl
            ? `<img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(name)}" onerror="this.style.display='none';this.parentElement.textContent='${initials}'">`
            : initials;
        return `<div class="profile-area" id="profileArea"><button class="profile-btn" id="profileBtn" aria-expanded="false" aria-haspopup="true"><div class="avatar">${avatarHTML}</div><div class="profile-info"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(roleLabel)}</span></div><span class="profile-arrow">▼</span></button><div class="profile-dropdown" id="profileDropdown" role="menu"><div class="dropdown-header"><span class="user-name">${escapeHTML(name)}</span><span class="user-role">${escapeHTML(roleLabel)}</span></div><a href="profile.html" role="menuitem"><span class="item-icon">👤</span> View Profile</a><a href="setting.html" role="menuitem"><span class="item-icon">⚙️</span> Settings</a><button class="logout" id="logoutBtn" role="menuitem"><span class="item-icon">🚪</span> Logout</button></div></div>`;
    }

    function toggle() { isOpen ? close() : open(); }
    function open() {
        const d = document.getElementById("profileDropdown"); const b = document.getElementById("profileBtn");
        if (!d) return; isOpen = true; d.classList.add("show"); if (b) b.setAttribute("aria-expanded", "true");
    }
    function close() {
        const d = document.getElementById("profileDropdown"); const b = document.getElementById("profileBtn");
        if (!d) return; isOpen = false; d.classList.remove("show"); if (b) b.setAttribute("aria-expanded", "false");
    }

    function setupEventListeners() {
        if (initialized) return;
        initialized = true;
        document.addEventListener("click", (event) => {
            const btn = event.target.closest("#profileBtn");
            if (btn) { event.preventDefault(); event.stopPropagation(); toggle(); return; }
            const dropdown = document.getElementById("profileDropdown");
            const area = document.getElementById("profileArea");
            if (isOpen && dropdown && area && !area.contains(event.target)) { close(); }
        });
        document.addEventListener("keydown", (event) => { if (event.key === "Escape" && isOpen) { close(); } });
        document.addEventListener("click", (event) => {
            const logoutBtn = event.target.closest("#logoutBtn");
            if (logoutBtn) { event.preventDefault(); event.stopPropagation(); handleLogout(); }
        });
    }

    function handleLogout() {
        // Use the centralized logout from auth.js (clears session + cached user).
        if (window.SkillShareAuth && window.SkillShareAuth.logout) {
            window.SkillShareAuth.logout();
        } else {
            if (window.SkillShareAPI) { window.SkillShareAPI.clearSession(); }
            window.location.href = "login.html";
        }
    }

    return {
        async init(containerSelector, options = {}) {
            const useBackend = options.useBackend !== false;
            const container = document.querySelector(containerSelector);
            if (!container) { console.warn("[ProfileDropdown] Container not found:", containerSelector); return; }
            if (window.SkillShareAPI && !window.SkillShareAPI.getToken()) { return; }
            let user = null;
            if (useBackend) { user = await getCurrentUser(); } else if (window.SkillShareAPI) { user = window.SkillShareAPI.getUser(); }
            container.innerHTML = renderDropdownHTML(user);
            setupEventListeners();
        },
        setUser(user) { cachedUser = user; },
        getUser() { return cachedUser; },
        open, close, toggle,
    };
})();
