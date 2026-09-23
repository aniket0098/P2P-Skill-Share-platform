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
    let rootSel = null; /* container selector, for post-upload re-render */

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
        return `<div class="profile-area" id="profileArea"><button class="profile-btn" id="profileBtn" aria-expanded="false" aria-haspopup="true"><span class="avatar-slot"><span class="avatar">${avatarHTML}</span><span class="avatar-edit" role="button" tabindex="0" title="Change profile photo" aria-label="Change profile photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></span></span><div class="profile-info"><strong>${escapeHTML(name)}</strong><span>${escapeHTML(roleLabel)}</span></div><span class="profile-arrow">▼</span></button><div class="profile-dropdown" id="profileDropdown" role="menu"><div class="dropdown-header"><span class="user-name">${escapeHTML(name)}</span><span class="user-role">${escapeHTML(roleLabel)}</span></div><a href="profile.html" role="menuitem"><span class="item-icon">👤</span> View Profile</a><a href="setting.html" role="menuitem"><span class="item-icon">⚙️</span> Settings</a><button class="logout" id="logoutBtn" role="menuitem"><span class="item-icon">🚪</span> Logout</button></div></div>`;
    }

    function toggle() { isOpen ? close() : open(); }

    /* Re-render the dropdown shell (avatar + pencil) in place. All
       listeners are document-delegated, so no rewiring is needed. */
    function rerender() {
        if (!rootSel) return;
        const container = document.querySelector(rootSel);
        if (container) container.innerHTML = renderDropdownHTML(cachedUser);
    }

    /* Boundary pencil on the navbar circle: open the shared gallery
       uploader (loaded on demand for pages that never link it). */
    function uploadAvatar() {
        const run = () => {
            if (!window.SkillShareAvatarUpload) return;
            window.SkillShareAvatarUpload.pick().then((detail) => {
                if (detail && detail.user) {
                    cachedUser = Object.assign({}, cachedUser || {}, detail.user);
                }
                rerender();
            }).catch((error) => {
                const message = (error && error.message) ||
                    "Could not update your photo.";
                if (typeof window.portalToast === "function") {
                    window.portalToast(message, "error");
                }
                console.warn("[ProfileDropdown]", message);
            });
        };
        if (window.SkillShareAvatarUpload) { run(); return; }
        const script = document.createElement("script");
        script.src = "components/avatar-upload.js";
        script.onload = run;
        script.onerror = () => {
            console.warn("[ProfileDropdown] avatar uploader failed to load");
        };
        document.head.appendChild(script);
    }

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
            const edit = event.target.closest &&
                event.target.closest(".avatar-edit");
            if (edit) {
                event.preventDefault();
                event.stopPropagation();
                uploadAvatar();
                return;
            }
            const btn = event.target.closest("#profileBtn");
            if (btn) { event.preventDefault(); event.stopPropagation(); toggle(); return; }
            const dropdown = document.getElementById("profileDropdown");
            const area = document.getElementById("profileArea");
            if (isOpen && dropdown && area && !area.contains(event.target)) { close(); }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && isOpen) { close(); }
            const edit = event.target.closest &&
                event.target.closest(".avatar-edit");
            if (edit && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                uploadAvatar();
            }
        });
        document.addEventListener("click", (event) => {
            const logoutBtn = event.target.closest("#logoutBtn");
            if (logoutBtn) { event.preventDefault(); event.stopPropagation(); handleLogout(); }
        });
        /* Photo changed anywhere (this circle's pencil or the profile
           page) -> repaint the navbar circle immediately. */
        window.addEventListener("skillshare:avatar-updated", (event) => {
            const avatarUrl = event && event.detail && event.detail.avatar_url;
            if (avatarUrl && cachedUser) {
                cachedUser = Object.assign({}, cachedUser,
                                            { avatar_url: avatarUrl });
                rerender();
            }
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
            rootSel = containerSelector;
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
