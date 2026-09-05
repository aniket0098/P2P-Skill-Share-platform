/* =========================================================
   SKILLCONNECT DASHBOARD
   dashboard.js
   Vanilla JavaScript + LocalStorage
   ========================================================= */

"use strict";

/* =========================================================
   THEME PREFERENCE (the only persisted UI state)
   ========================================================= */

const THEME_KEY = "skillshare_theme";


function getThemePreference() {
    try {
        return localStorage.getItem(THEME_KEY) === "light"
            ? "light"
            : "dark";
    } catch (error) {
        return "dark";
    }
}


function saveThemePreference(theme) {
    try {
        localStorage.setItem(
            THEME_KEY,
            theme === "light" ? "light" : "dark"
        );
    } catch (error) { /* ignore quota errors */ }
}


function getDB() {

    /* Only the theme preference and the current session user are
       trusted. NO synthetic/demo data is ever seeded. */
    const sessionUser =
        (window.SkillShareAPI && window.SkillShareAPI.getUser()) || null;

    return {
        currentUser: sessionUser,
        credits: {
            currentBalance: 0,
            totalEarned: 0,
            totalSpent: 0,
            transactions: []
        },
        notifications: [],
        skills: [],
        bookmarks: [],
        learning: [],
        followedUsers: [],
        theme: getThemePreference()
    };
}


function saveDB(database) {

    /* Persist only the theme preference — a genuine UI setting. */
    try {
        localStorage.setItem(
            THEME_KEY,
            (database && database.theme === "light") ? "light" : "dark"
        );
    } catch (error) { /* ignore quota errors */ }
}


function updateDB(callback) {

    const database = getDB();

    callback(database);

    return database;
}
/* =========================================================
   INITIALIZE
   Authenticated boot sequence:
     1. SkillShareAuth.requireUser()  -> resolves the REAL
        user from GET /me (JWT in localStorage attached
        automatically by api-client.js).
        - no token / expired token -> redirect to login
        - network error            -> error state + retry
     2. SkillShareAPI.getDashboard()  -> real PostgreSQL
        data for every dashboard section.
   ========================================================= */

let dashboardData = null;
let currentVerifiedUser = null;


document.addEventListener("DOMContentLoaded", () => {

    initializeDatabase();

    renderSidebar();

    renderTopbar();

    renderLoadingStates();

    initializeGlobalEvents();

    applyTheme();

    bootDashboard();

});


async function bootDashboard() {

    /* ------------------------------------------------------
       1. AUTHENTICATED CURRENT USER (JWT -> PostgreSQL)
       ------------------------------------------------------ */
    try {

        currentVerifiedUser = await window.SkillShareAuth.requireUser();

    } catch (error) {

        /* Network / server failure: auth.js does NOT redirect
           for these — show the dashboard error state instead. */
        renderDashboardError(
            window.SkillShareAuth.getErrorMessage(error)
        );
        return;

    }


    if (!currentVerifiedUser) {
        /* No token or 401: auth.js has already redirected to
           login.html. Nothing else to do here. */
        return;
    }


    /* Verified identity -> welcome heading + topbar */
    updateWelcomeUser(currentVerifiedUser);


    /* ------------------------------------------------------
       2. REAL DASHBOARD DATA (PostgreSQL)
       ------------------------------------------------------ */
    try {

        dashboardData = await window.SkillShareAPI.getDashboard();

        renderDashboard();

    } catch (error) {

        if (error && error.status === 401) {
            /* Session cleared + redirect handled globally by
               auth.js ("skillshare:auth-expired"). */
            return;
        }

        renderDashboardError(
            (error && error.detail)
                || (error && error.message)
                || "Could not load your dashboard."
        );

    }

}


function updateWelcomeUser(user) {

    const firstName = (user.name || "member").split(" ")[0];

    const heading = document.getElementById("welcomeName");

    if (heading) {
        heading.textContent = firstName;
    }

    const topbarName =
        document.getElementById("topbarUserName");

    if (topbarName) {
        topbarName.textContent = firstName;
    }

}


function renderLoadingStates() {

    const targets = [
        "trendingSkills",
        "recentSkills",
        "activityBars"
    ];

    targets.forEach(id => {

        const element = document.getElementById(id);

        if (element) {
            element.innerHTML =
                '<div class="empty-state">Loading…</div>';
        }

    });

}


function renderDashboardError(message) {

    const main =
        document.querySelector(".page-content");

    if (!main) return;


    main.innerHTML = `

        <div class="panel" style="padding:30px; text-align:center;">

            <div class="empty-state">

                <div class="empty-icon">⚠️</div>

                <h3>Something went wrong</h3>

                <p>${escapeHTML(message)}</p>

                <button
                    class="btn primary"
                    id="dashboardRetryBtn"
                    style="margin-top:15px;"
                >
                    Try again
                </button>

            </div>

        </div>

    `;


    const retry = document.getElementById("dashboardRetryBtn");

    if (retry) {
        retry.addEventListener("click", () => {
            window.location.reload();
        });
    }

}


/* =========================================================
   NOTIFICATIONS
   Filled from GET /api/dashboard (real pending requests
   + unread messages of the authenticated user).
   ========================================================= */


function initializeDatabase() {
    /* The dashboard no longer seeds a fake localStorage
       "database". Real data is fetched from the backend. */
}


/* =========================================================
   SIDEBAR
   ========================================================= */

function renderSidebar() {

    const container = document.getElementById("app-sidebar");

    if (!container) return;

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase() || "dashboard.html";


    const sections = [
        {
            label: null,
            links: [
                {
                    name: "Dashboard",
                    icon: "🏠",
                    url: "dashboard.html"
                }
            ]
        },
        {
            label: "Discover",
            links: [
                {
                    name: "Explore Skills",
                    icon: "🔎",
                    url: "explore.html"
                },
                {
                    name: "Analyze your skills",
                    icon: "🌍",
                    url: "analyze-skill.html"
                },
                {
                    name: "Industry skills",
                    icon: "🧩",
                    url: "industry-skills.html"
                }
            ]
        },
        {
            label: "Learn",
            links: [
                {
                    name: "My Learning",
                    icon: "📚",
                    url: "my-learning.html"
                },
                {
                    name: "Live Learn",
                    icon: "🔴",
                    url: "live-learning.html"
                },
                {
                    name: "Live Discussion",
                    icon: "🤝",
                    url: "live-discussions.html"
                }
            ]
        },
        {
            label: "Build",
            links: [
                {
                    name: "Projects",
                    icon: "💻",
                    url: "projects.html"
                },
                {
                    name: "Teams",
                    icon: "👥",
                    url: "teams.html"
                }
            ]
        },
        {
            label: "Community",
            links: [
                {
                    name: "Messages",
                    icon: "💬",
                    url: "messages.html"
                },
                {
                    name: "Requests",
                    icon: "👥",
                    url: "requests.html"
                },
                {
                    name: "community",
                    icon: "🗣",
                    url: "community.html"
                }
            ]
        },
        {
            label: null,
            links: [
                {
                    name: "Settings",
                    icon: "⚙️",
                    url: "setting.html"
                }
            ]
        }
    ];


    container.innerHTML = `
        <div class="sidebar">

            <div class="logo-area">

                <div class="logo-icon">
                    SC
                </div>

                <div class="logo-text">
                    <h2>SkillConnect</h2>
                    <span>Share Skills. Grow Together.</span>
                </div>

            </div>


            <nav class="sidebar-nav">

                ${sections.map(section => {

                    const labelHtml = section.label
                        ? `<span class="sidebar-nav-label">${section.label}</span>`
                        : "";

                    const linksHtml = section.links.map(link => {

                        const active =
                            currentPage === link.url
                                ? "active"
                                : "";

                        return `
                            <a href="${link.url}" class="${active}">
                                <span class="icon">${link.icon}</span>
                                <span>${link.name}</span>
                            </a>
                        `;

                    }).join("");

                    return labelHtml + linksHtml;

                }).join("")}

            </nav>


            <div class="sidebar-promo">

                <h3>
                    Teach a skill.<br>
                    Inspire the world.
                </h3>

                <p>
                    Join thousands of people sharing
                    their knowledge with the community.
                </p>

                <button
                    type="button"
                    id="shareSkillBtn"
                    class="share-skill-btn"
                >
                    Share Your Skill →
                </button>

            </div>

        </div>
    `;


    const shareButton =
        document.getElementById("shareSkillBtn");

    if (shareButton) {

        shareButton.addEventListener(
            "click",
            openShareSkillModal
        );

    }
}


/* =========================================================
   TOPBAR
   ========================================================= */

function renderTopbar() {

    const container =
        document.getElementById("app-topbar");

    if (!container) return;


    const database = getDB();

    const sessionUser =
        (window.SkillShareAPI && window.SkillShareAPI.getUser()) || null;

    const user = {
        name: (sessionUser && sessionUser.name) || "member",
        role: "",
        email: (sessionUser && sessionUser.email) || ""
    };

    const unreadCount = 0;


    container.innerHTML = `

        <div class="topbar">

            <div class="topbar-left">

                <button
                    class="mobile-menu-btn"
                    id="mobileMenuBtn"
                    aria-label="Open menu"
                >
                    ☰
                </button>

                <div>

                    <h1>
                        Welcome back,
                        <span id="topbarUserName">${escapeHTML(user.name.split(" ")[0])}</span> 👋
                    </h1>

                    <p>
                        Ready to learn, share and grow today?
                    </p>

                </div>

            </div>


            <div class="topbar-right">


                <div
                    class="credits-widget"
                    id="creditsWidget"
                    title="View credits"
                >

                    <div class="coin-icon">
                        🪙
                    </div>

                    <div>

                        <strong>
                            ${database.credits.currentBalance.toLocaleString()}
                        </strong>

                        <small>
                            Credits
                        </small>

                    </div>

                </div>


                <button
                    class="notification-btn"
                    id="notificationBtn"
                    aria-label="Notifications"
                >

                    🔔

                    <span
                        class="notification-count"
                        id="notificationCount"
                        style="display:none;"
                    >
                    </span>

                </button>


                <div class="profile-area">

                    <button
                        class="profile-btn"
                        id="profileBtn"
                    >

                        <div class="avatar">
                            ${getInitials(user.name)}
                        </div>

                        <div class="profile-info">

                            <strong>
                                ${escapeHTML(user.name)}
                            </strong>

                            <span>
                                ${escapeHTML(user.role)}
                            </span>

                        </div>

                        <span class="profile-arrow">
                            ▼
                        </span>

                    </button>


                    <div
                        class="profile-dropdown"
                        id="profileDropdown"
                    >

                        <a href="profile.html">
                            👤 View Profile
                        </a>

                        <a href="my-learning.html">
                            📖 My Learning
                        </a>

                        <a href="explore.html">
                            ⭐ My Skills
                        </a>

                        <a href="credits.html">
                            🪙 Credits
                        </a>

                        <a href="notifications.html">
                            🔔 Notifications
                        </a>

                        <a href="setting.html">
                            ⚙️ Settings
                        </a>

                        <button
                            class="logout"
                            id="logoutBtn"
                        >
                            🚪 Logout
                        </button>

                    </div>

                </div>

            </div>

        </div>

    `;


    initializeTopbarEvents();
}


/* =========================================================
   TOPBAR EVENTS
   ========================================================= */

function initializeTopbarEvents() {

    const profileBtn =
        document.getElementById("profileBtn");

    const profileDropdown =
        document.getElementById("profileDropdown");


    if (profileBtn && profileDropdown) {

        profileBtn.addEventListener("click", event => {

            event.stopPropagation();

            profileDropdown.classList.toggle("show");

        });

    }


    document.addEventListener("click", event => {

        if (
            profileDropdown &&
            !profileDropdown.contains(event.target) &&
            !profileBtn.contains(event.target)
        ) {
            profileDropdown.classList.remove("show");
        }

    });


    const notificationBtn =
        document.getElementById("notificationBtn");


    if (notificationBtn) {

        notificationBtn.addEventListener(
            "click",
            () => {

                if (window.SkillShareAuth) {
                    window.location.href =
                        "notifications.html";
                }

            }
        );

    }


    const creditsWidget =
        document.getElementById("creditsWidget");


    if (creditsWidget) {

        creditsWidget.addEventListener("click", () => {

            window.location.href = "credits.html";

        });

    }


    const logoutBtn =
        document.getElementById("logoutBtn");


    if (logoutBtn) {

        logoutBtn.addEventListener(
            "click",
            logoutUser
        );

    }


    const mobileMenuBtn =
        document.getElementById("mobileMenuBtn");


    if (mobileMenuBtn) {

        mobileMenuBtn.addEventListener("click", () => {

            const sidebar =
                document.getElementById("app-sidebar");

            if (sidebar) {
                sidebar.classList.toggle("open");
            }

        });

    }

}


/* =========================================================
   DASHBOARD RENDER — driven by real PostgreSQL data
   (GET /api/dashboard, resolved from the JWT)
   ========================================================= */

function renderDashboard() {

    if (!dashboardData) return;

    renderTrendingSkills();

    renderLearning();

    renderMetrics();

    renderActivityChart();

    renderRecentSkills();

    renderSpotlight();

    renderSectionPlaceholders();

    updateNotificationCount();

}


/* ---------------------------------------------------------
   LEARNING PROGRESS OVERVIEW — real statistics calculated
   from the user's own database records (profile skills,
   connections, requests, messages). No invented numbers.
   --------------------------------------------------------- */

function renderMetrics() {

    const container =
        document.getElementById("dashboardMetrics");

    if (!container || !dashboardData.stats) return;


    const stats = dashboardData.stats;


    const metrics = [
        { value: stats.skills_count, label: "Skills Listed" },
        { value: stats.connections_count, label: "Connections" },
        { value: stats.requests_accepted, label: "Requests Accepted" },
        { value: stats.messages_sent, label: "Messages Sent" }
    ];


    container.innerHTML = metrics.map(metric => `

        <div>

            <b>${escapeHTML(String(metric.value ?? 0))}</b>

            <span>
                ${escapeHTML(metric.label)}
            </span>

        </div>

    `).join("");

}


/* ---------------------------------------------------------
   ACTIVITY CHART — generated from the user's real Message
   records (messages sent per day over the last 7 days).
   When there is no activity at all a meaningful empty
   state is shown instead of invented values.
   --------------------------------------------------------- */

function renderActivityChart() {

    const totalElement =
        document.getElementById("activityTotal");

    const barsElement =
        document.getElementById("activityBars");

    if (!barsElement || !dashboardData.activity) return;


    const days = dashboardData.activity.days || [];


    if (totalElement) {
        totalElement.textContent =
            String(dashboardData.activity.total_messages_sent || 0);
    }


    const totalWeek = days.reduce(
        (sum, day) => sum + (day.messages_sent || 0),
        0
    );


    if (totalWeek === 0) {

        barsElement.textContent =
            "No messages sent this week yet — start a conversation!";

        barsElement.style.fontSize = "10px";

        barsElement.style.letterSpacing = "0";

        return;

    }


    const max = Math.max(
        ...days.map(day => day.messages_sent || 0)
    );


    /* Character-based bar chart using the existing .bars
       styling: ▁ ▂ ▃ ▄ ▅ ▆ ▇ */
    const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"];


    barsElement.textContent = days.map(day => {

        const count = day.messages_sent || 0;

        if (count === 0) return "·";

        const level = Math.ceil((count / max) * 6);

        return blocks[Math.min(level, 6)];

    }).join("");

}


/* ---------------------------------------------------------
   RECENTLY ADDED SKILLS — newest members' real profile
   skills, straight from the users table.
   --------------------------------------------------------- */

function renderRecentSkills() {

    const container =
        document.getElementById("recentSkills");

    if (!container) return;


    const skills = dashboardData.recent_skills || [];


    if (skills.length === 0) {

        container.innerHTML = `

            <div class="empty-state">

                No skills shared by the community yet.
                Be the first — use "Share Your Skill".

            </div>

        `;

        return;

    }


    container.innerHTML = skills.map(item => `

        <div class="recent-skill">

            <div class="recent-icon">✦</div>

            <div>

                <strong>
                    ${escapeHTML(item.name)}
                </strong>

                <span>
                    by ${escapeHTML(item.owner ? item.owner.name : "member")}
                </span>

            </div>

        </div>

    `).join("");

}


/* ---------------------------------------------------------
   COMMUNITY SPOTLIGHT — top skill sharers ranked by real
   connection counts in the database.
   --------------------------------------------------------- */

function renderSpotlight() {

    const container =
        document.querySelector(".community-spotlight .spotlight");

    if (!container) return;


    const people = dashboardData.spotlight || [];


    if (people.length === 0) {

        container.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">◇</div>

                <h3>Community Spotlight</h3>

                <p>
                    Top skill sharers will appear here once members
                    start connecting and sharing skills.
                </p>

            </div>

        `;

        return;

    }


    container.innerHTML = people.map(person => `

        <div class="spotlight">

            <div class="avatar xl">
                ${escapeHTML(getInitials(person.name || "?"))}
            </div>

            <div>

                <h3>
                    ${escapeHTML(person.name || "member")}
                </h3>

                <p>
                    ${escapeHTML(person.bio || person.skills || "Active community member")}
                </p>

            </div>

        </div>

    `).join("");

}


/* ---------------------------------------------------------
   Sections whose backing database tables do not exist yet
   (upcoming group discussions). Meaningful empty states
   instead of hardcoded demo content.
   --------------------------------------------------------- */

function renderSectionPlaceholders() {

    const discussion =
        document.getElementById("discussionPreview");

    if (discussion) {

        discussion.innerHTML = `

            <div class="empty-state">

                No upcoming group discussions yet.

            </div>

        `;

    }

}



/* ---------------------------------------------------------
   CONTINUE LEARNING — no learning-session records exist in
   the database yet, so a meaningful empty state is shown
   instead of hardcoded demo data.
   --------------------------------------------------------- */

function renderLearning() {

    const container =
        document.getElementById("continueLearning");

    if (!container) return;

    container.innerHTML = `

        <div class="empty-state">

            <div class="empty-icon">📚</div>

            <h3>Nothing in progress yet</h3>

            <p>
                Accept a connection request or join a live
                session and your learning will appear here.
            </p>

        </div>

    `;

}


/* ---------------------------------------------------------
   NOTIFICATION BADGE — real counts from GET /api/dashboard
   (pending received requests + unread messages).
   --------------------------------------------------------- */

function updateNotificationCount() {

    const badge =
        document.getElementById("notificationCount");

    if (!badge) return;

    if (!dashboardData || !dashboardData.notifications) {
        badge.style.display = "none";
        return;
    }

    const notifications = dashboardData.notifications;

    const unread =
        (notifications.pending_requests || []).length
        + (notifications.unread_conversations || []).reduce(
            (sum, conversation) =>
                sum + (conversation.unread_count || 0),
            0
        );

    badge.textContent = String(unread);

    badge.style.display =
        unread === 0
            ? "none"
            : "flex";

}


/* ---------------------------------------------------------
   SEARCH + FILTERS — the search box navigates to the
   Explore page, which queries real users in PostgreSQL
   (GET /api/users/search).
   --------------------------------------------------------- */

function initializeSearch() {

    const input =
        document.getElementById("globalSearch");

    const button =
        document.getElementById("searchBtn");

    function runSearch() {

        const query = ((input && input.value) || "").trim();

        const target = query
            ? `explore.html?q=${encodeURIComponent(query)}`
            : "explore.html";

        window.location.href = target;

    }

    if (button && input) {
        button.addEventListener("click", runSearch);
        input.addEventListener("keydown", event => {
            if (event.key === "Enter") runSearch();
        });
    }

}


function initializeFilters() {

    const filterBtn =
        document.getElementById("filterBtn");

    if (!filterBtn) return;

    filterBtn.addEventListener("click", () => {
        showToast(
            "Advanced filters live on the Explore page.",
            "success"
        );
    });

}



/* =========================================================
   TRENDING SKILLS — real community aggregates from
   GET /api/dashboard (how many members teach each skill).
   ========================================================= */

function renderTrendingSkills() {

    const container =
        document.getElementById("trendingSkills");

    if (!container) return;

    if (!dashboardData) {
        container.innerHTML =
            '<div class="empty-state">Loading…</div>';
        return;
    }

    const skills =
        dashboardData.community_skills || [];

    if (skills.length === 0) {
        container.innerHTML =
            '<div class="empty-state">No community skills yet — share yours to get started!</div>';
        return;
    }

    container.innerHTML = skills.slice(0, 6).map(skill => `

        <article
            class="skill-card"
            data-skill-name="${escapeHTML(skill.name)}"
        >

            <div class="skill-icon">✦</div>

            <h3>
                ${escapeHTML(skill.name)}
            </h3>

            <div class="learners">
                ${skill.count}
                ${skill.count === 1 ? "member teaches" : "members teach"} this
            </div>

            <span class="skill-growth">
                from real member profiles
            </span>

            <div class="skill-card-bottom">

                <button
                    class="explore-btn"
                    data-explore-skill="${escapeHTML(skill.name)}"
                >
                    Explore
                </button>

            </div>

        </article>

    `).join("");

    initializeSkillButtons();

}


/* =========================================================
   SKILL BUTTONS
   ========================================================= */

function initializeSkillButtons() {


    document
        .querySelectorAll("[data-explore-skill]")
        .forEach(button => {

            button.addEventListener("click", () => {

                const skillName =
                    button.dataset.exploreSkill || "";

                window.location.href =
                    `explore.html?q=${
                        encodeURIComponent(skillName)
                    }`;

            });

        });

}


/* =========================================================
   SHARE SKILL MODAL
   ========================================================= */

function openShareSkillModal() {

    if (
        document.getElementById(
            "shareSkillModal"
        )
    ) return;


    const modal =
        document.createElement("div");


    modal.id =
        "shareSkillModal";


    modal.className =
        "modal-overlay";


    modal.innerHTML = `

        <div class="modal">

            <div class="modal-header">

                <h2>
                    Share Your Skill
                </h2>

                <button
                    class="modal-close"
                    data-close-modal
                >
                    ×
                </button>

            </div>


            <form id="shareSkillForm">

                <div class="form-group">

                    <label>
                        Skill Name
                    </label>

                    <input
                        type="text"
                        id="skillName"
                        required
                        placeholder="e.g. Python"
                    >

                </div>


                <div class="form-group">

                    <label>
                        Category
                    </label>

                    <select
                        id="skillCategory"
                        required
                    >

                        <option value="">
                            Select category
                        </option>

                        <option>
                            Programming
                        </option>

                        <option>
                            Design
                        </option>

                        <option>
                            Marketing
                        </option>

                        <option>
                            Communication
                        </option>

                        <option>
                            Languages
                        </option>

                        <option>
                            Productivity
                        </option>

                        <option>
                            Video Editing
                        </option>

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Skill Level
                    </label>

                    <select
                        id="skillLevel"
                        required
                    >

                        <option value="">
                            Select level
                        </option>

                        <option>
                            Beginner
                        </option>

                        <option>
                            Intermediate
                        </option>

                        <option>
                            Advanced
                        </option>

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="skillDescription"
                        placeholder="Tell learners what you can teach..."
                        required
                    ></textarea>

                </div>


                <div class="form-actions">

                    <button
                        type="button"
                        class="btn ghost"
                        data-close-modal
                    >
                        Cancel
                    </button>

                    <button
                        type="submit"
                        class="btn primary"
                    >
                        Submit Skill
                    </button>

                </div>

            </form>

        </div>

    `;


    document.body.appendChild(modal);


    modal
        .querySelectorAll("[data-close-modal]")
        .forEach(button => {

            button.addEventListener(
                "click",
                closeModal
            );

        });


    modal.addEventListener("click", event => {

        if (
            event.target === modal
        ) {

            closeModal();

        }

    });


    document
        .getElementById("shareSkillForm")
        .addEventListener(
            "submit",
            submitSkill
        );

}


async function submitSkill(event) {

    event.preventDefault();


    const name =
        document
            .getElementById("skillName")
            .value
            .trim();


    const category =
        document
            .getElementById("skillCategory")
            .value;


    const level =
        document
            .getElementById("skillLevel")
            .value;


    if (!name || !category || !level) {

        showToast(
            "Please complete all required fields.",
            "error"
        );

        return;

    }


    /* Persist to the user's REAL profile record in
       PostgreSQL (authenticated via JWT). */
    try {

        const result =
            await window.SkillShareAPI.addMySkill(name);

        closeModal();

        showToast(
            result.message || "Your skill has been added successfully!",
            "success"
        );

        /* Refresh community aggregates from the database. */
        dashboardData = await window.SkillShareAPI.getDashboard();

        renderTrendingSkills();

        renderRecentSkills();

    } catch (error) {

        if (error && error.status === 401) return;

        showToast(
            (error && error.detail)
                || "Could not save your skill. Please try again.",
            "error"
        );

    }

}


function closeModal() {

    document
        .querySelectorAll(".modal-overlay")
        .forEach(modal => {

            modal.remove();

        });

}


/* =========================================================
   FOLLOW USER
   ========================================================= */

function toggleFollow(userName) {

    /* NOTE: real "follow" records are not stored in the
       database yet — this only shows feedback and makes no
       claims about persisted data. */

    showToast(
        `Following ${userName}.`,
        "success"
    );

}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme() {

    const theme = getThemePreference();


    if (
        theme === "light"
    ) {

        document.body.classList.add(
            "light-theme"
        );

    } else {

        document.body.classList.remove(
            "light-theme"
        );

    }

}


function toggleTheme() {

    const newTheme =
        getThemePreference() === "dark"
            ? "light"
            : "dark";

    saveThemePreference(newTheme);

    applyTheme();

}


/* =========================================================
   LOGOUT
   ========================================================= */

function logoutUser() {

    /* Clear the real JWT session (api-client.js). */
    if (window.SkillShareAPI) {
        window.SkillShareAPI.clearSession();
    }


    showToast(
        "Logged out successfully.",
        "success"
    );


    setTimeout(() => {

        window.location.href =
            "login.html";

    }, 700);

}


/* =========================================================
   GLOBAL EVENTS
   ========================================================= */

function initializeGlobalEvents() {

    initializeSearch();

    initializeFilters();


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {

                closeModal();

                const dropdown =
                    document.getElementById(
                        "profileDropdown"
                    );

                if (dropdown) {
                    dropdown.classList.remove(
                        "show"
                    );
                }

            }

        }
    );

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(
    message,
    type = "success"
) {

    let root =
        document.getElementById(
            "toast-root"
        );


    if (!root) {

        root =
            document.createElement("div");

        root.id =
            "toast-root";

        document.body.appendChild(root);

    }


    const toast =
        document.createElement("div");


    toast.className =
        `toast ${type}`;


    toast.textContent =
        message;


    root.appendChild(toast);


    setTimeout(() => {

        toast.style.opacity = "0";

        toast.style.transform =
            "translateY(10px)";

        setTimeout(() => {

            toast.remove();

        }, 300);

    }, 3000);

}


/* =========================================================
   UTILITIES
   ========================================================= */

function formatNumber(number) {

    if (number >= 1000000) {

        return (
            number / 1000000
        ).toFixed(1) + "M";

    }


    if (number >= 1000) {

        return (
            number / 1000
        ).toFixed(1) + "K";

    }


    return number.toString();

}


function getInitials(name) {

    return name
        .split(" ")
        .map(word => word[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();

}


function escapeHTML(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =========================================================
   GLOBAL ACCESS
   ========================================================= */

window.SkillConnect = {

    getDB,

    saveDB,

    updateDB,

    toggleFollow,

    toggleTheme,

    showToast,

    openShareSkillModal,

    closeModal

};

