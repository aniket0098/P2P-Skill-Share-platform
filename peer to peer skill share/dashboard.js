/* =========================================================
   SKILLCONNECT DASHBOARD
   dashboard.js
   Vanilla JavaScript + LocalStorage
   ========================================================= */

"use strict";

/* =========================================================
   DEMO USER
   ========================================================= */

const DEFAULT_USER = {
    name: "Aniket Deshmukh",
    role: "Learner",
    email: "aniket@example.com",
    bio: "Learning, sharing and growing together.",
    avatar: "AD",
    followers: 248,
    following: 126
};


/* =========================================================
   DEMO SKILLS
   ========================================================= */

const DEFAULT_SKILLS = [
    {
        id: 1,
        name: "English Speaking",
        category: "Languages",
        level: "Beginner",
        learners: 12400,
        growth: 32,
        rating: 4.8,
        icon: "🗣️"
    },
    {
        id: 2,
        name: "Coding Skills",
        category: "Programming",
        level: "Beginner",
        learners: 25800,
        growth: 28,
        rating: 4.9,
        icon: "💻"
    },
    {
        id: 3,
        name: "Digital Marketing",
        category: "Marketing",
        level: "Intermediate",
        learners: 18600,
        growth: 24,
        rating: 4.7,
        icon: "📈"
    },
    {
        id: 4,
        name: "Video Editing",
        category: "Video Editing",
        level: "Intermediate",
        learners: 14200,
        growth: 20,
        rating: 4.8,
        icon: "🎬"
    },
    {
        id: 5,
        name: "Public Speaking",
        category: "Communication",
        level: "Beginner",
        learners: 9700,
        growth: 18,
        rating: 4.6,
        icon: "🎤"
    },
    {
        id: 6,
        name: "Graphic Design",
        category: "Design",
        level: "Intermediate",
        learners: 11300,
        growth: 16,
        rating: 4.9,
        icon: "🎨"
    },
    {
        id: 7,
        name: "Python",
        category: "Programming",
        level: "Beginner",
        learners: 22100,
        growth: 29,
        rating: 4.9,
        icon: "🐍"
    },
    {
        id: 8,
        name: "UI/UX Design",
        category: "Design",
        level: "Intermediate",
        learners: 15400,
        growth: 23,
        rating: 4.8,
        icon: "🎯"
    },
    {
        id: 9,
        name: "AI Tools",
        category: "Productivity",
        level: "Beginner",
        learners: 19800,
        growth: 41,
        rating: 4.9,
        icon: "🤖"
    },
    {
        id: 10,
        name: "Content Writing",
        category: "Writing",
        level: "Intermediate",
        learners: 8900,
        growth: 17,
        rating: 4.6,
        icon: "✍️"
    }
];


/* =========================================================
   DEFAULT DATA
   ========================================================= */

const DEFAULT_CREDITS = {
    currentBalance: 1250,
    totalEarned: 3350,
    totalSpent: 2100,

    transactions: [
        {
            id: 1,
            description: "Completed Python course",
            amount: 500,
            type: "earned",
            date: "Today"
        },
        {
            id: 2,
            description: "Helped another learner",
            amount: 250,
            type: "earned",
            date: "Yesterday"
        },
        {
            id: 3,
            description: "Joined mentorship session",
            amount: -100,
            type: "spent",
            date: "2 days ago"
        },
        {
            id: 4,
            description: "Community contribution",
            amount: 200,
            type: "bonus",
            date: "5 days ago"
        }
    ]
};


const DEFAULT_NOTIFICATIONS = [
    {
        id: 1,
        title: "New learning session",
        description: "A Python live session starts soon.",
        type: "learning",
        time: "5 min ago",
        read: false,
        icon: "📚"
    },
    {
        id: 2,
        title: "You earned 250 credits",
        description: "You helped another learner.",
        type: "system",
        time: "1 hour ago",
        read: false,
        icon: "🪙"
    },
    {
        id: 3,
        title: "Priya started following you",
        description: "Check out their profile.",
        type: "community",
        time: "3 hours ago",
        read: false,
        icon: "👤"
    },
    {
        id: 4,
        title: "Rahul joined your session",
        description: "Your Python learning session has a new participant.",
        type: "messages",
        time: "Yesterday",
        read: false,
        icon: "💬"
    }
];


const DEFAULT_LEARNING = [
    {
        id: 1,
        title: "Python for Beginners",
        progress: 65,
        lessons: 18,
        completedLessons: 12
    },
    {
        id: 2,
        title: "UI/UX Design Fundamentals",
        progress: 40,
        lessons: 20,
        completedLessons: 8
    },
    {
        id: 3,
        title: "Digital Marketing Basics",
        progress: 75,
        lessons: 16,
        completedLessons: 12
    }
];


/* =========================================================
   LOCAL STORAGE DATABASE
   ========================================================= */

const DB_KEY = "skillconnectDB";


function getDB() {

    const saved = localStorage.getItem(DB_KEY);

    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (error) {
            console.error("Could not read SkillConnect data.");
        }
    }

    const database = {
        currentUser: DEFAULT_USER,
        credits: DEFAULT_CREDITS,
        notifications: DEFAULT_NOTIFICATIONS,
        skills: DEFAULT_SKILLS,
        bookmarks: [],
        learning: DEFAULT_LEARNING,
        followedUsers: [],
        theme: "dark"
    };

    saveDB(database);

    return database;
}


function saveDB(database) {
    localStorage.setItem(DB_KEY, JSON.stringify(database));
}


function updateDB(callback) {

    const database = getDB();

    callback(database);

    saveDB(database);

    return database;
}


/* =========================================================
   INITIALIZE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    initializeDatabase();

    renderSidebar();

    renderTopbar();

    renderDashboard();

    initializeGlobalEvents();

    applyTheme();

    syncRealNotificationCount();

});


/* =========================================================
   REAL-DATA NOTIFICATION BADGE (FastAPI + PostgreSQL)
   Replaces the local mock count with the actual number of
   pending received connection requests + unread messages.
   ========================================================= */

async function syncRealNotificationCount() {

    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) return;

    try {

        const [requestsData, conversationsData] = await Promise.all([
            window.SkillShareAPI.listRequests({ direction: "received", status: "pending" }),
            window.SkillShareAPI.getConversations(),
        ]);

        const pendingRequests = ((requestsData && requestsData.requests) || []).length;

        const unreadMessages = ((conversationsData && conversationsData.conversations) || [])
            .reduce((sum, c) => sum + (c.unread_count || 0), 0);

        const badge = document.getElementById("notificationCount");

        if (badge) {
            badge.textContent = pendingRequests + unreadMessages;
            badge.style.display = (pendingRequests + unreadMessages) ? "" : "none";
        }

    } catch (error) {
        /* Silent: the badge falls back to the local value if the
           backend is not reachable. Protected APIs return 401 and
           SkillShareAPI already handles session expiry globally. */
    }
}


function initializeDatabase() {

    const database = localStorage.getItem(DB_KEY);

    if (!database) {
        getDB();
    }
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

    const user = database.currentUser;

    const unreadCount =
        database.notifications
            .filter(notification => !notification.read)
            .length;


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
                        ${escapeHTML(user.name.split(" ")[0])} 👋
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
                    >
                        ${unreadCount}
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
            showNotificationDropdown
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
   DASHBOARD RENDER
   ========================================================= */

function renderDashboard() {

    renderTrendingSkills();

    renderLearning();

    updateCreditDisplay();

    updateNotificationCount();

}


/* =========================================================
   TRENDING SKILLS
   ========================================================= */

function renderTrendingSkills(
    skills = getDB().skills.slice(0, 6)
) {

    const container =
        document.getElementById("trendingSkills");

    if (!container) return;


    const database = getDB();


    container.innerHTML = skills.map(skill => {

        const saved =
            database.bookmarks.includes(skill.id);


        return `

            <article
                class="skill-card"
                data-skill-id="${skill.id}"
            >

                <div class="skill-icon">
                    ${skill.icon}
                </div>


                <h3>
                    ${escapeHTML(skill.name)}
                </h3>


                <div class="learners">
                    ${formatNumber(skill.learners)}
                    learners
                </div>


                <span class="skill-growth">
                    ↑ ${skill.growth}% this week
                </span>


                <div class="skill-card-bottom">

                    <button
                        class="bookmark-btn ${saved ? "saved" : ""}"
                        data-bookmark="${skill.id}"
                        aria-label="Save skill"
                    >
                        ${saved ? "★" : "☆"}
                    </button>


                    <button
                        class="explore-btn"
                        data-explore="${skill.id}"
                    >
                        Explore
                    </button>

                </div>

            </article>

        `;

    }).join("");


    initializeSkillButtons();

}


/* =========================================================
   SKILL BUTTONS
   ========================================================= */

function initializeSkillButtons() {

    document
        .querySelectorAll("[data-bookmark]")
        .forEach(button => {

            button.addEventListener("click", event => {

                event.stopPropagation();

                const id =
                    Number(button.dataset.bookmark);

                toggleBookmark(id);

            });

        });


    document
        .querySelectorAll("[data-explore]")
        .forEach(button => {

            button.addEventListener("click", () => {

                const id =
                    Number(button.dataset.explore);

                window.location.href =
                    `skill-details.html?id=${id}`;

            });

        });

}


/* =========================================================
   BOOKMARK
   ========================================================= */

function toggleBookmark(skillId) {

    updateDB(database => {

        const index =
            database.bookmarks.indexOf(skillId);


        if (index === -1) {

            database.bookmarks.push(skillId);

            showToast(
                "Skill saved successfully.",
                "success"
            );

        } else {

            database.bookmarks.splice(index, 1);

            showToast(
                "Skill removed from saved.",
                "success"
            );

        }

    });


    renderTrendingSkills();

}


/* =========================================================
   SEARCH
   ========================================================= */

function initializeSearch() {

    const input =
        document.getElementById("skillSearch");

    const suggestions =
        document.getElementById("searchSuggestions");


    if (!input) return;


    let timer;


    input.addEventListener("input", () => {

        clearTimeout(timer);


        timer = setTimeout(() => {

            const query =
                input.value.trim().toLowerCase();


            if (!query) {

                hideSearchSuggestions();

                renderTrendingSkills();

                return;

            }


            const results =
                getDB().skills.filter(skill =>

                    skill.name
                        .toLowerCase()
                        .includes(query)

                    ||

                    skill.category
                        .toLowerCase()
                        .includes(query)

                );


            showSearchSuggestions(results);

        }, 250);

    });


    input.addEventListener("keydown", event => {

        if (event.key === "Enter") {

            const query =
                input.value.trim();


            if (query) {

                window.location.href =
                    `explore.html?search=${encodeURIComponent(query)}`;

            }

        }

    });


    document.addEventListener("click", event => {

        if (
            !event.target.closest(".search-box")
        ) {

            hideSearchSuggestions();

        }

    });

}


function showSearchSuggestions(results) {

    const container =
        document.getElementById("searchSuggestions");

    if (!container) return;


    if (results.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                No skills found.
            </div>
        `;

        container.classList.add("show");

        return;

    }


    container.innerHTML =
        results.slice(0, 6).map(skill => `

            <div
                class="search-suggestion"
                data-search-skill="${skill.id}"
            >

                <div class="recent-icon">
                    ${skill.icon}
                </div>

                <div>

                    <strong>
                        ${escapeHTML(skill.name)}
                    </strong>

                    <span>
                        ${escapeHTML(skill.category)}
                        · ${formatNumber(skill.learners)}
                        learners
                    </span>

                </div>

            </div>

        `).join("");


    container.classList.add("show");


    container
        .querySelectorAll("[data-search-skill]")
        .forEach(item => {

            item.addEventListener("click", () => {

                const id =
                    item.dataset.searchSkill;

                /* No dedicated skill-details page exists yet —
                   route to the Explore skills page instead. */

                window.location.href =
                    "explore.html";

            });

        });

}


function hideSearchSuggestions() {

    const container =
        document.getElementById("searchSuggestions");

    if (container) {
        container.classList.remove("show");
    }

}


/* =========================================================
   CATEGORY FILTER
   ========================================================= */

function initializeFilters() {

    const category =
        document.getElementById("categoryFilter");

    const level =
        document.getElementById("levelFilter");


    if (category) {

        category.addEventListener("change", applyFilters);

    }


    if (level) {

        level.addEventListener("change", applyFilters);

    }

}


function applyFilters() {

    const category =
        document
            .getElementById("categoryFilter")
            ?.value || "all";


    const level =
        document
            .getElementById("levelFilter")
            ?.value || "all";


    let skills =
        getDB().skills;


    if (category !== "all") {

        skills =
            skills.filter(
                skill =>
                    skill.category === category
            );

    }


    if (level !== "all") {

        skills =
            skills.filter(
                skill =>
                    skill.level === level
            );

    }


    renderTrendingSkills(skills.slice(0, 6));

}


/* =========================================================
   LEARNING
   ========================================================= */

function renderLearning() {

    const container =
        document.getElementById("learningList");

    if (!container) return;


    const learning =
        getDB().learning;


    container.innerHTML =
        learning.map(course => `

            <div
                class="learning-item"
                data-learning-id="${course.id}"
            >

                <div class="learning-top">

                    <h3>
                        ${escapeHTML(course.title)}
                    </h3>

                    <span>
                        ${course.progress}%
                    </span>

                </div>


                <div class="progress">

                    <div
                        class="progress-bar"
                        style="width:${course.progress}%"
                    ></div>

                </div>


                <div class="learning-bottom">

                    <span>
                        ${course.completedLessons}/${course.lessons}
                        lessons
                    </span>

                    <button
                        data-continue-learning="${course.id}"
                    >
                        Continue →
                    </button>

                </div>

            </div>

        `).join("");


    container
        .querySelectorAll(
            "[data-continue-learning]"
        )
        .forEach(button => {

            button.addEventListener("click", () => {

                const id =
                    Number(
                        button.dataset.continueLearning
                    );

                continueLearning(id);

            });

        });

}


function continueLearning(id) {

    updateDB(database => {

        const course =
            database.learning.find(
                item => item.id === id
            );


        if (!course) return;


        if (course.progress < 100) {

            course.progress =
                Math.min(
                    100,
                    course.progress + 5
                );


            course.completedLessons =
                Math.min(
                    course.lessons,
                    course.completedLessons + 1
                );


            showToast(
                "Lesson completed! Progress updated.",
                "success"
            );

        }

    });


    renderLearning();

}


/* =========================================================
   CREDITS
   ========================================================= */

function updateCreditDisplay() {

    const element =
        document.querySelector(
            ".credits-widget strong"
        );


    if (!element) return;


    element.textContent =
        getDB()
            .credits
            .currentBalance
            .toLocaleString();

}


function addCredits(
    amount,
    description,
    type = "earned"
) {

    if (amount <= 0) return;


    updateDB(database => {

        database.credits.currentBalance += amount;

        database.credits.totalEarned += amount;


        database.credits.transactions.unshift({

            id: Date.now(),

            description,

            amount,

            type,

            date: "Just now"

        });

    });


    updateCreditDisplay();

    showToast(
        `${amount} credits added successfully.`,
        "success"
    );

}


function spendCredits(
    amount,
    description
) {

    if (amount <= 0) return false;


    const database = getDB();


    if (
        database.credits.currentBalance < amount
    ) {

        showToast(
            "Not enough credits.",
            "error"
        );

        return false;

    }


    updateDB(database => {

        database.credits.currentBalance -= amount;

        database.credits.totalSpent += amount;


        database.credits.transactions.unshift({

            id: Date.now(),

            description,

            amount: -amount,

            type: "spent",

            date: "Just now"

        });

    });


    updateCreditDisplay();

    showToast(
        `${amount} credits spent.`,
        "success"
    );


    return true;

}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

function updateNotificationCount() {

    const count =
        document.getElementById(
            "notificationCount"
        );


    if (!count) return;


    const unread =
        getDB()
            .notifications
            .filter(item => !item.read)
            .length;


    count.textContent = unread;

    count.style.display =
        unread === 0
            ? "none"
            : "flex";

}


function showNotificationDropdown() {

    const existing =
        document.getElementById(
            "notificationDropdown"
        );


    if (existing) {

        existing.remove();

        return;

    }


    const database = getDB();


    const dropdown =
        document.createElement("div");


    dropdown.id =
        "notificationDropdown";


    dropdown.className =
        "profile-dropdown show";


    dropdown.style.right = "65px";


    dropdown.style.top = "65px";


    dropdown.style.width = "300px";


    dropdown.innerHTML = `

        <div
            style="
                padding:10px;
                border-bottom:1px solid var(--border);
                margin-bottom:5px;
            "
        >

            <strong style="font-size:12px;">
                Notifications
            </strong>

        </div>


        ${database.notifications
            .slice(0, 5)
            .map(notification => `

                <button
                    class="notification-item"
                    data-notification="${notification.id}"
                    style="
                        display:flex;
                        width:100%;
                        text-align:left;
                        gap:10px;
                        padding:10px;
                        background:transparent;
                        color:white;
                        border-radius:9px;
                    "
                >

                    <span>
                        ${notification.icon}
                    </span>

                    <span>

                        <strong
                            style="
                                display:block;
                                font-size:9px;
                            "
                        >
                            ${escapeHTML(notification.title)}
                        </strong>

                        <small
                            style="
                                display:block;
                                color:var(--text-muted);
                                font-size:8px;
                                margin-top:3px;
                            "
                        >
                            ${escapeHTML(notification.time)}
                        </small>

                    </span>

                </button>

            `).join("")}


        <a
            href="notifications.html"
            style="
                display:block;
                text-align:center;
                margin-top:5px;
                color:var(--primary-light);
            "
        >
            View all notifications →
        </a>

    `;


    document.body.appendChild(dropdown);


    dropdown
        .querySelectorAll(
            "[data-notification]"
        )
        .forEach(item => {

            item.addEventListener("click", () => {

                const id =
                    Number(
                        item.dataset.notification
                    );

                markNotificationRead(id);

                item.style.opacity = "0.5";

            });

        });


    setTimeout(() => {

        document.addEventListener(
            "click",
            function closeNotification(event) {

                const button =
                    document.getElementById(
                        "notificationBtn"
                    );


                if (
                    !dropdown.contains(event.target) &&
                    !button?.contains(event.target)
                ) {

                    dropdown.remove();

                    document.removeEventListener(
                        "click",
                        closeNotification
                    );

                }

            }
        );

    }, 0);

}


function markNotificationRead(id) {

    updateDB(database => {

        const notification =
            database.notifications.find(
                item => item.id === id
            );


        if (notification) {

            notification.read = true;

        }

    });


    updateNotificationCount();

    showToast(
        "Notification marked as read.",
        "success"
    );

}


function markAllNotificationsRead() {

    updateDB(database => {

        database.notifications.forEach(
            notification => {
                notification.read = true;
            }
        );

    });


    updateNotificationCount();

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


function submitSkill(event) {

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


    updateDB(database => {

        database.skills.push({

            id: Date.now(),

            name,

            category,

            level,

            learners: 1,

            growth: 0,

            rating: 5,

            icon: "✨"

        });

    });


    closeModal();


    showToast(
        "Your skill has been added successfully!",
        "success"
    );


    renderTrendingSkills();

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

    updateDB(database => {

        const index =
            database.followedUsers.indexOf(
                userName
            );


        if (index === -1) {

            database.followedUsers.push(
                userName
            );

            showToast(
                `Following ${userName}.`,
                "success"
            );

        } else {

            database.followedUsers.splice(
                index,
                1
            );

            showToast(
                `Unfollowed ${userName}.`,
                "success"
            );

        }

    });

}


/* =========================================================
   THEME
   ========================================================= */

function applyTheme() {

    const database = getDB();


    if (
        database.theme === "light"
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

    updateDB(database => {

        database.theme =
            database.theme === "dark"
                ? "light"
                : "dark";

    });


    applyTheme();

}


/* =========================================================
   LOGOUT
   ========================================================= */

function logoutUser() {

    localStorage.removeItem(
        "skillconnectAuth"
    );


    showToast(
        "Logged out successfully.",
        "success"
    );


    setTimeout(() => {

        window.location.href =
            "index.html";

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

    addCredits,

    spendCredits,

    toggleBookmark,

    toggleFollow,

    toggleTheme,

    showToast,

    openShareSkillModal,

    closeModal,

    markNotificationRead,

    markAllNotificationsRead

};

