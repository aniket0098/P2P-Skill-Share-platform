/* =========================================================
   SKILLSHARE — PROFILE PAGE JS
   Real PostgreSQL & FastAPI Backend Integration
   11-Section Architecture (all real data, no dummy values)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       AUTH GUARD
    ===================================================== */
    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
        window.location.href = "login.html";
        return;
    }

    const API = window.SkillShareAPI;
/* =====================================================
       DOM ELEMENTS (must match profile.html)
    ===================================================== */
    // Header & Identity
    const heroName = document.getElementById("heroName");
    const profileAvatar = document.getElementById("profileAvatar");
    const profileUsername = document.getElementById("profileUsername");
    const heroLocation = document.getElementById("heroLocation");
    const profilePublicId = document.getElementById("profilePublicId");
    const heroBio = document.getElementById("heroBio");
    const topNavAvatar = document.getElementById("topNavAvatar");
    const topNavName = document.getElementById("topNavName");

    // Action buttons
    const editBtn = document.getElementById("editBtn");
    const messageBtn = document.getElementById("messageBtn");
    const followBtn = document.getElementById("followBtn");
    const shareBtn = document.getElementById("shareBtn");
    const notificationBtn = document.getElementById("notificationBtn");

    // Quick stats
    const statSkills = document.getElementById("statSkills");
    const statProjects = document.getElementById("statProjects");
    const statConnections = document.getElementById("statConnections");
    const statDaysMember = document.getElementById("statDaysMember");
// About (display mode)
    const aboutSectionCard = document.getElementById("aboutSectionCard");
    const triggerEditSection = document.getElementById("triggerEditSection");
    const aboutDisplayMode = document.getElementById("aboutDisplayMode");
    const dispFirstName = document.getElementById("dispFirstName");
    const dispLastName = document.getElementById("dispLastName");
    const aboutText = document.getElementById("aboutText");
    const editFirstNameBtn = document.getElementById("editFirstNameBtn");
    const editLastNameBtn = document.getElementById("editLastNameBtn");
    const editBioBtn = document.getElementById("editBioBtn");

    // About (inline edit mode — ONLY First / Last / Bio)
    const aboutEditMode = document.getElementById("aboutEditMode");
    const inlineFirstName = document.getElementById("inlineFirstName");
    const inlineLastName = document.getElementById("inlineLastName");
    const inlineBio = document.getElementById("inlineBio");
    const cancelEditBtn = document.getElementById("cancelEditBtn");
    const saveEditBtn = document.getElementById("saveEditBtn");

    // Projects
    const projectCountBadge = document.getElementById("projectCountBadge");
    const myProjectsGrid = document.getElementById("myProjectsGrid");
    const projectsEmptyState = document.getElementById("projectsEmptyState");
    const viewAllProjectsLink = document.getElementById("viewAllProjectsLink");

    // Learning Progress
    const learningOverallPct = document.getElementById("learningOverallPct");
    const learningOverallBar = document.getElementById("learningOverallBar");
    const learningSkillsSection = document.getElementById("learningSkillsSection");
    const learningSkillsList = document.getElementById("learningSkillsList");
    const learningEmptyState = document.getElementById("learningEmptyState");

    // Recent Learning
    const recentLearningList = document.getElementById("recentLearningList");
    const recentLearningEmptyState = document.getElementById("recentLearningEmptyState");

    // Recent Activity
    const activityFilter = document.getElementById("activityFilter");
    const activityList = document.getElementById("activityList");
    const activityEmptyState = document.getElementById("activityEmptyState");

    // Working Skills & Interests (chips)
    const workingSkillChips = document.getElementById("workingSkillChips");
    const skillsEmptyState = document.getElementById("skillsEmptyState");
    const interestChips = document.getElementById("interestChips");
    const interestsEmptyState = document.getElementById("interestsEmptyState");
// Managed in Settings (side card)
    const sideUsername = document.getElementById("sideUsername");
    const sideLocation = document.getElementById("sideLocation");
    const sideSkillsSummary = document.getElementById("sideSkillsSummary");
    const sideInterestsSummary = document.getElementById("sideInterestsSummary");

    // Details card
    const detailConnectionsCount = document.getElementById("detailConnectionsCount");
    const detailMemberSince = document.getElementById("detailMemberSince");
    const detailDaysMember = document.getElementById("detailDaysMember");
    const detailEmail = document.getElementById("detailEmail");

    // Modal editor (alternative quick editor — 3 fields only)
    const editModal = document.getElementById("editModal");
    const modalFirstName = document.getElementById("modalFirstName");
    const modalLastName = document.getElementById("modalLastName");
    const modalBio = document.getElementById("modalBio");
    const modalSaveBtn = document.getElementById("modalSaveBtn");

    const toast = document.getElementById("toast");

    /* =====================================================
       HELPERS
    ===================================================== */
    function escapeHTML(str) {
        if (str === null || str === undefined) return "";
        return String(str)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }
    const statLearning = document.getElementById("statLearning");

    // Modal close buttons (Cancel + ×)
    const modalCloseButtons = document.querySelectorAll("#editModal .close-modal");

    /* =====================================================
        CACHED STATE (single source of truth = backend)
    ===================================================== */
    let userProjects = [];
    let userActivities = [];
    let userConnections = [];
    let userLearning = null;
    let isOwnProfile = true;

    /* =====================================================
        HELPERS
    ===================================================== */
    function showToast(message, type) {
        if (!toast) return;
        toast.textContent = message;
        toast.className = "toast show " + (type || "success");
        clearTimeout(showToast._timer);
        showToast._timer = setTimeout(() => {
            toast.className = "toast";
        }, 3200);
    }

    // "Aniket Deshmukh" -> { first: "Aniket", last: "Deshmukh" }
    // The DB stores ONE `name` column, so first/last are views of it.
    function splitName(fullName) {
        const parts = String(fullName || "").trim().split(/\s+/);
        return {
            first: parts[0] || "",
            last: parts.slice(1).join(" ") || "",
        };
    }

    function joinName(first, last) {
        return [first, last].map((p) => String(p || "").trim()).filter(Boolean).join(" ");
    }

    function parseCSV(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
        return String(value).split(",").map((s) => s.trim()).filter(Boolean);
    }

    function formatMemberDate(iso) {
        if (!iso) return "—";
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    }

    function daysAsMember(iso) {
        if (!iso) return 0;
        const created = new Date(iso).getTime();
        if (isNaN(created)) return 0;
        return Math.max(0, Math.floor((Date.now() - created) / 86400000));
    }

    function timeAgo(iso) {
        if (!iso) return "";
        const then = new Date(iso).getTime();
        if (isNaN(then)) return "";
        const diff = Date.now() - then;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return mins + "m ago";
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + "h ago";
        const days = Math.floor(hours / 24);
        if (days < 30) return days + "d ago";
        return formatMemberDate(iso);
    }

    // Deterministic initials avatar generated from the real name —
    // used ONLY when the user has no avatar_url in the database.
    function initialsAvatar(name) {
        const initials = splitName(name).first.charAt(0).toUpperCase() ||
            (name || "U").charAt(0).toUpperCase();
        const svg =
            '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">' +
            '<rect width="96" height="96" rx="48" fill="#4f46e5"/>' +
            '<text x="48" y="60" font-family="Arial" font-size="38" fill="#fff" ' +
            'text-anchor="middle">' + escapeHTML(initials) + "</text></svg>";
        return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    }

    function setLoading(listEl, message) {
        if (listEl) listEl.innerHTML = '<p class="loading-state">' + escapeHTML(message || "Loading…") + "</p>";
    }

    function goToSettings() {
        window.location.href = "setting.html";
    }

    /* =====================================================
        RENDER — PROFILE HEADER (all real DB values)
    ===================================================== */
    function renderProfile(user) {
        const { first, last } = splitName(user.name);

        // Header
        if (heroName) heroName.textContent = user.name || "Unnamed member";
        if (profileUsername)
            profileUsername.textContent = user.username ? "@" + user.username : "@" + (user.public_id || "");
        if (profilePublicId)
            profilePublicId.textContent = user.public_id ? "ID: " + user.public_id : "";
        if (heroLocation) {
            heroLocation.textContent = user.location || "Location not set";
            heroLocation.classList.toggle("is-empty", !user.location);
        }
        if (heroBio) {
            heroBio.textContent = user.bio || "No bio yet — tell the community about yourself.";
            heroBio.classList.toggle("is-empty", !user.bio);
        }

        // Avatar — real DB image, initials fallback only when DB is empty
        const avatarSrc = user.avatar_url || initialsAvatar(user.name);
        if (profileAvatar) {
            profileAvatar.src = avatarSrc;
            profileAvatar.onerror = () => {
                profileAvatar.onerror = null;
                profileAvatar.src = initialsAvatar(user.name);
            };
        }
        if (topNavAvatar) topNavAvatar.src = avatarSrc;
        if (topNavName) topNavName.textContent = user.name || "Member";

        // ABOUT section — display mode (First / Last / Bio)
        if (dispFirstName) dispFirstName.textContent = first || "Not set";
        if (dispLastName) dispLastName.textContent = last || "Not set";
        if (aboutText) {
            aboutText.textContent = user.bio || "No bio added yet. Click the edit button to introduce yourself.";
            aboutText.classList.toggle("is-empty", !user.bio);
        }

        // Side card — DISPLAY ONLY, managed in Settings → Profile
        if (sideUsername)
            sideUsername.textContent = user.username ? "@" + user.username : "Not set";
        if (sideLocation) sideLocation.textContent = user.location || "Not set";
        if (sideSkillsSummary) {
            const skills = parseCSV(user.skills);
            sideSkillsSummary.textContent = skills.length
                ? skills.slice(0, 4).join(" • ") + (skills.length > 4 ? " …" : "")
                : "No skills added yet";
        }
        if (sideInterestsSummary) {
            const interests = parseCSV(user.interests);
            sideInterestsSummary.textContent = interests.length
                ? interests.slice(0, 4).join(" • ") + (interests.length > 4 ? " …" : "")
                : "No interests added yet";
        }

        // Account details (real values)
        if (detailEmail) detailEmail.textContent = user.email || "—";
        if (detailMemberSince) detailMemberSince.textContent = formatMemberDate(user.created_at);
        if (detailDaysMember) {
            const d = daysAsMember(user.created_at);
            detailDaysMember.textContent = d + (d === 1 ? " day" : " days");
        }
        if (detailConnectionsCount) detailConnectionsCount.textContent = userConnections.length;

        // Quick stats row (all computed, none hardcoded)
        if (statSkills) statSkills.textContent = parseCSV(user.skills).length;
        if (statProjects) statProjects.textContent = userProjects.length;
        if (statConnections) statConnections.textContent = userConnections.length;
        if (statDaysMember) statDaysMember.textContent = daysAsMember(user.created_at);
        if (statLearning)
            statLearning.textContent =
                (userLearning && userLearning.has_activity ? userLearning.overall_progress : 0) + "%";
    }

    /* =====================================================
        RENDER — SKILL / INTEREST CHIPS (real DB data)
    ===================================================== */
    function renderChips(user) {
        const skills = parseCSV(user.skills);
        const interests = parseCSV(user.interests);

        if (workingSkillChips) {
            workingSkillChips.innerHTML = skills
                .map((s) => '<span class="chip">' + escapeHTML(s) + "</span>")
                .join("");
        }
        if (skillsEmptyState) skillsEmptyState.style.display = skills.length ? "none" : "block";

        if (interestChips) {
            interestChips.innerHTML = interests
                .map((s) => '<span class="chip">' + escapeHTML(s) + "</span>")
                .join("");
        }
        if (interestsEmptyState) interestsEmptyState.style.display = interests.length ? "none" : "block";
    }

    /* =====================================================
        RENDER — MY PROJECTS (owner-filtered by backend JWT)
    ===================================================== */
    function renderProjects() {
        if (!myProjectsGrid) return;

        if (projectCountBadge) projectCountBadge.textContent = userProjects.length;

        // "View All My Projects" only shown when projects exist
        if (viewAllProjectsLink)
            viewAllProjectsLink.style.display = userProjects.length ? "inline-flex" : "none";

        if (!userProjects.length) {
            myProjectsGrid.innerHTML = "";
            if (projectsEmptyState) projectsEmptyState.style.display = "block";
            return;
        }
        if (projectsEmptyState) projectsEmptyState.style.display = "none";

        myProjectsGrid.innerHTML = userProjects
            .map((p) => {
                const tech = (p.technologies || [])
                    .map((t) => '<span class="chip chip-sm">' + escapeHTML(t) + "</span>")
                    .join("");
                const img = p.image_url
                    ? '<div class="project-card-img"><img src="' + escapeHTML(p.image_url) +
                      '" alt="' + escapeHTML(p.title) + '" loading="lazy" onerror="this.parentElement.remove()"></div>'
                    : "";
                const links =
                    (p.github_url
                        ? '<a class="project-link" href="' + escapeHTML(p.github_url) + '" target="_blank" rel="noopener">GitHub</a>'
                        : "") +
                    (p.demo_url
                        ? '<a class="project-link" href="' + escapeHTML(p.demo_url) + '" target="_blank" rel="noopener">Live Demo</a>'
                        : "");
                return (
                    '<article class="project-card">' +
                    img +
                    '<div class="project-card-body">' +
                    '<div class="project-card-top"><h3>' + escapeHTML(p.title) + "</h3>" +
                    '<span class="status-badge status-' + escapeHTML(p.status || "in_progress") + '">' +
                    escapeHTML(String(p.status || "in progress").replace("_", " ")) + "</span></div>" +
                    '<p class="project-desc">' + escapeHTML(p.description || "No description provided.") + "</p>" +
                    (tech ? '<div class="project-tech">' + tech + "</div>" : "") +
                    '<div class="project-meta"><small>Shared ' + escapeHTML(timeAgo(p.created_at)) + "</small>" +
                    '<div class="project-links">' + links + "</div></div>" +
                    "</div></article>"
                );
            })
            .join("");
    }

    /* =====================================================
        RENDER — LEARNING PROGRESS + RECENT LEARNING
        (values calculated by backend from LearningRecord rows)
    ===================================================== */
    function renderLearning() {
        const data = userLearning;
        const hasActivity = !!(data && data.has_activity);

        // Overall progress
        const overall = hasActivity ? data.overall_progress : 0;
        if (learningOverallPct) learningOverallPct.textContent = overall + "%";
        if (learningOverallBar) learningOverallBar.style.width = overall + "%";

        // Per-skill progress bars
        if (learningSkillsList) {
            learningSkillsList.innerHTML = hasActivity
                ? data.skills
                      .map(
                          (s) =>
                              '<div class="learning-skill-row">' +
                              '<div class="learning-skill-head"><span>' + escapeHTML(s.name) +
                              "</span><b>" + s.progress + "%</b></div>" +
                              '<div class="learning-bar"><div class="learning-bar-fill" style="width:' +
                              Math.max(0, Math.min(100, s.progress)) + '%"></div></div></div>'
                      )
                      .join("")
                : "";
        }
        if (learningSkillsSection)
            learningSkillsSection.style.display = hasActivity ? "block" : "none";
        if (learningEmptyState) learningEmptyState.style.display = hasActivity ? "none" : "block";

        // Recent learning list
        if (recentLearningList) {
            recentLearningList.innerHTML = hasActivity
                ? data.recent_learning
                      .map(
                          (r) =>
                              '<div class="recent-learning-item">' +
                              '<div class="recent-learning-info"><b>' + escapeHTML(r.skill) + "</b>" +
                              "<small>" + escapeHTML(r.resource) + "</small></div>" +
                              '<div class="recent-learning-progress"><span>' + r.progress + "%</span>" +
                              '<div class="learning-bar"><div class="learning-bar-fill" style="width:' +
                              Math.max(0, Math.min(100, r.progress)) + '%"></div></div></div></div>'
                      )
                      .join("")
                : "";
        }
        if (recentLearningEmptyState)
            recentLearningEmptyState.style.display = hasActivity ? "none" : "block";
    }

    /* =====================================================
        RENDER — RECENT ACTIVITY (real PostgreSQL events)
    ===================================================== */
    function renderActivities() {
        if (!activityList) return;
        const filter = activityFilter ? activityFilter.value : "all";

        const visible = userActivities.filter((a) => {
            if (filter === "all") return true;
            const type = String(a.type || "");
            return type === filter || type.startsWith(filter);
        });

        if (activityEmptyState)
            activityEmptyState.style.display = visible.length ? "none" : "block";

        activityList.innerHTML = visible
            .map(
                (a) =>
                    '<div class="activity-item">' +
                    '<span class="activity-icon">' + escapeHTML(a.icon || "✓") + "</span>" +
                    '<div class="activity-body"><b>' + escapeHTML(a.title) + "</b>" +
                    (a.description ? "<small>" + escapeHTML(a.description) + "</small>" : "") +
                    "</div>" +
                    '<time class="activity-time">' + escapeHTML(timeAgo(a.timestamp)) + "</time>" +
                    "</div>"
            )
            .join("");
    }

    /* =====================================================
        EDIT PROFILE — ONLY First Name / Last Name / Bio
        Saved through PATCH /api/users/me (JWT-derived user).
    ===================================================== */
    function openInlineEdit() {
        if (!currentUser) return;
        const { first, last } = splitName(currentUser.name);
        if (inlineFirstName) inlineFirstName.value = first;
        if (inlineLastName) inlineLastName.value = last;
        if (inlineBio) inlineBio.value = currentUser.bio || "";
        if (aboutDisplayMode) aboutDisplayMode.style.display = "none";
        if (aboutEditMode) aboutEditMode.style.display = "block";
        if (inlineFirstName) inlineFirstName.focus();
    }

    function closeInlineEdit() {
        if (aboutDisplayMode) aboutDisplayMode.style.display = "block";
        if (aboutEditMode) aboutEditMode.style.display = "none";
    }

    async function saveProfileEdits({ first, last, bio }) {
        const cleanFirst = String(first || "").trim();
        const cleanLast = String(last || "").trim();
        if (cleanFirst.length < 2) {
            showToast("First name must be at least 2 characters.", "error");
            return false;
        }
        if (!cleanLast) {
            showToast("Last name is required.", "error");
            return false;
        }

        const newName = joinName(cleanFirst, cleanLast);
        const payload = {};
        if (newName !== (currentUser.name || "")) payload.name = newName;
        if (String(bio || "").trim() !== (currentUser.bio || "")) payload.bio = String(bio || "").trim();

        if (!Object.keys(payload).length) {
            showToast("No changes to save.");
            closeInlineEdit();
            closeModal();
            return true;
        }

        if (saveEditBtn) { saveEditBtn.disabled = true; saveEditBtn.textContent = "Saving…"; }
        if (modalSaveBtn) { modalSaveBtn.disabled = true; modalSaveBtn.textContent = "Saving…"; }

        try {
            const res = await API.updateMyProfile(payload);
            // Backend returns the fresh PostgreSQL row — use it as truth.
            currentUser = res.user;
            // Keep the cached session user in sync for other pages' navbars.
            API.setSession(API.getToken(), {
                id: currentUser.id,
                public_id: currentUser.public_id,
                name: currentUser.name,
                email: currentUser.email,
            });

            renderProfile(currentUser);
            renderChips(currentUser);
            showToast("Profile updated successfully.");
            closeInlineEdit();
            closeModal();
            return true;
        } catch (err) {
            showToast(err.message || "Could not update profile.", "error");
            return false;
        } finally {
            if (saveEditBtn) { saveEditBtn.disabled = false; saveEditBtn.textContent = "Save Changes"; }
            if (modalSaveBtn) { modalSaveBtn.disabled = false; modalSaveBtn.textContent = "Save Changes"; }
        }
    }

    /* =====================================================
        MODAL EDITOR (Edit Profile button — same 3 fields)
    ===================================================== */
    function openModal() {
        if (!currentUser || !editModal) return;
        const { first, last } = splitName(currentUser.name);
        if (modalFirstName) modalFirstName.value = first;
        if (modalLastName) modalLastName.value = last;
        if (modalBio) modalBio.value = currentUser.bio || "";
        editModal.classList.add("open");
        editModal.setAttribute("aria-hidden", "false");
    }

    function closeModal() {
        if (!editModal) return;
        editModal.classList.remove("open");
        editModal.setAttribute("aria-hidden", "true");
    }

    /* =====================================================
        DATA LOADING — everything from the JWT-authenticated
        backend; no hardcoded IDs, no dummy fallbacks.
    ===================================================== */
    async function loadAll() {
        setLoading(myProjectsGrid, "Loading your projects…");
        if (activityList) setLoading(activityList, "Loading activity…");
        if (recentLearningList) setLoading(recentLearningList, "Loading learning activity…");
        if (learningSkillsList) setLoading(learningSkillsList, "Loading progress…");

        const [meRes, projRes, connRes, learnRes, actRes] = await Promise.allSettled([
            API.getMe(),
            API.getMyProjects(),
            API.getConnections(),
            API.getMyLearning(),
            API.getMyActivity(),
        ]);

        // 1. Authenticated user (JWT -> PostgreSQL users row)
        if (meRes.status !== "fulfilled") {
            showToast(meRes.reason.message || "Could not load your profile.", "error");
            return;
        }
        currentUser = meRes.value.user;

        // 2. Projects owned by the authenticated user (backend filters by JWT)
        userProjects =
            projRes.status === "fulfilled" ? projRes.value.projects || [] : [];

        // 3. Accepted connections only (pending requests never included)
        userConnections =
            connRes.status === "fulfilled" ? connRes.value.connections || [] : [];

        // 4. Real learning progress (backend-calculated)
        userLearning =
            learnRes.status === "fulfilled" ? learnRes.value : null;

        // 5. Real activity timeline (PostgreSQL events)
        userActivities =
            actRes.status === "fulfilled" ? actRes.value.activities || [] : [];

        if (projRes.status === "rejected")
            console.warn("Projects could not be loaded:", projRes.reason.message);
        if (connRes.status === "rejected")
            console.warn("Connections could not be loaded:", connRes.reason.message);
        if (learnRes.status === "rejected")
            console.warn("Learning could not be loaded:", learnRes.reason.message);
        if (actRes.status === "rejected")
            console.warn("Activity could not be loaded:", actRes.reason.message);

        renderProfile(currentUser);
        renderChips(currentUser);
        renderProjects();
        renderLearning();
        renderActivities();
    }

    /* =====================================================
        EVENT WIRING
    ===================================================== */
    // Header edit buttons -> open the 3-field modal editor
    if (editBtn) editBtn.addEventListener("click", openModal);
    if (triggerEditSection) triggerEditSection.addEventListener("click", openInlineEdit);

    // Per-field inline Edit buttons (First / Last / Bio)
    [editFirstNameBtn, editLastNameBtn, editBioBtn].forEach((btn) => {
        if (btn) btn.addEventListener("click", openInlineEdit);
    });

    // Inline edit — Save / Cancel
    if (saveEditBtn)
        saveEditBtn.addEventListener("click", () => {
            saveProfileEdits({
                first: inlineFirstName ? inlineFirstName.value : "",
                last: inlineLastName ? inlineLastName.value : "",
                bio: inlineBio ? inlineBio.value : "",
            });
        });
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeInlineEdit);

    // Modal — Save / Cancel / backdrop / ×
    if (modalSaveBtn)
        modalSaveBtn.addEventListener("click", () => {
            saveProfileEdits({
                first: modalFirstName ? modalFirstName.value : "",
                last: modalLastName ? modalLastName.value : "",
                bio: modalBio ? modalBio.value : "",
            });
        });
    modalCloseButtons.forEach((btn) => btn.addEventListener("click", closeModal));
    if (editModal)
        editModal.addEventListener("click", (e) => {
            if (e.target === editModal) closeModal();
        });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });

    // Activity filter
    if (activityFilter) activityFilter.addEventListener("change", renderActivities);

    // Any element marked data-goto-settings routes to Settings → Profile.
    // (Username / Location / Skills / Interests are NOT editable here.)
    document.querySelectorAll("[data-goto-settings]").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.preventDefault();
            goToSettings();
        });
    });

    // Session expired anywhere on the page -> back to login
    window.addEventListener("skillshare:auth-expired", () => {
        window.location.href = "login.html";
    });

    /* =====================================================
        INIT
    ===================================================== */
    loadAll();
});