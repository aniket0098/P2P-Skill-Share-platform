/* =========================================================
   SKILLCONNECT — PROJECT GALLERY
   Interactive JavaScript
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       PROJECT DATA
    ===================================================== */

    let projects = JSON.parse(
        localStorage.getItem("skillconnectProjects")
    ) || [

        {
            id: 1,
            title: "EcoTrack — Carbon Footprint Tracker",
            description:
                "Track your daily activities and learn how to reduce your carbon footprint.",
            category: "Web Development",
            level: "Intermediate",
            language: "JavaScript",
            technologies: [
                "Node.js",
                "MongoDB",
                "Sustainability"
            ],
            creator: "Riya Patel",
            role: "B.Tech CSE",
            time: "3 days ago",
            likes: 124,
            comments: [
                {
                    user: "Arjun",
                    text: "Really useful project!"
                },
                {
                    user: "Meera",
                    text: "The UI looks amazing."
                }
            ],
            saves: 32,
            views: 210,
            type: "web",
            badge: "Featured",
            github: "https://github.com/",
            story:
                "I built EcoTrack to help people understand their environmental impact and make better everyday decisions."
        },

        {
            id: 2,
            title: "SkillSwap — P2P Learning Platform",
            description:
                "A peer-to-peer skill sharing platform connecting learners and teachers.",
            category: "Web Development",
            level: "Advanced",
            language: "JavaScript",
            technologies: [
                "HTML",
                "CSS",
                "JavaScript",
                "FastAPI"
            ],
            creator: "Aniket Deshmukh",
            role: "Full Stack Developer",
            time: "1 week ago",
            likes: 210,
            comments: [
                {
                    user: "Harshal",
                    text: "Great concept for skill sharing!"
                },
                {
                    user: "Atharv",
                    text: "The project has huge potential."
                }
            ],
            saves: 48,
            views: 340,
            type: "web",
            badge: "Featured",
            github: "https://github.com/",
            story:
                "SkillSwap was created to make learning more accessible by allowing anyone to become both a teacher and learner."
        },

        {
            id: 3,
            title: "HabitFlow — Habit Tracking App",
            description:
                "Minimal and beautiful habit tracker for a better you.",
            category: "Mobile Apps",
            level: "Intermediate",
            language: "Flutter",
            technologies: [
                "Flutter",
                "Firebase",
                "Mobile",
                "Productivity"
            ],
            creator: "Karan Mehta",
            role: "App Developer",
            time: "5 days ago",
            likes: 98,
            comments: [
                {
                    user: "Isha",
                    text: "Very clean mobile UI."
                }
            ],
            saves: 24,
            views: 190,
            type: "mobile",
            badge: "Open Source",
            github: "https://github.com/",
            story:
                "HabitFlow helps users build positive habits through reminders, progress tracking and simple visual feedback."
        },

        {
            id: 4,
            title: "FoodLens — AI Food Recognition",
            description:
                "Identify food and get nutrition information using AI.",
            category: "AI/ML",
            level: "Advanced",
            language: "Python",
            technologies: [
                "Python",
                "TensorFlow",
                "OpenCV",
                "AI"
            ],
            creator: "Sneha Iyer",
            role: "Data Science",
            time: "4 days ago",
            likes: 176,
            comments: [
                {
                    user: "Rohan",
                    text: "Interesting AI application."
                }
            ],
            saves: 41,
            views: 280,
            type: "ai",
            badge: "AI",
            github: "https://github.com/",
            story:
                "FoodLens uses computer vision to identify food items and provide useful nutritional information."
        },

        {
            id: 5,
            title: "3D Interactive Room",
            description:
                "A 3D virtual room built with Three.js and interactive animations.",
            category: "Creative",
            level: "Advanced",
            language: "JavaScript",
            technologies: [
                "Three.js",
                "JavaScript",
                "3D",
                "WebGL"
            ],
            creator: "Aditya Rao",
            role: "3D Enthusiast",
            time: "1 week ago",
            likes: 132,
            comments: [
                {
                    user: "Kavya",
                    text: "The 3D effects are excellent!"
                }
            ],
            saves: 29,
            views: 250,
            type: "creative",
            badge: "Featured",
            github: "https://github.com/",
            story:
                "This project explores how Three.js can be used to create interactive 3D environments directly in the browser."
        },

        {
            id: 6,
            title: "Blogify — Markdown CMS",
            description:
                "A simple and fast markdown based blogging platform.",
            category: "Web Development",
            level: "Intermediate",
            language: "JavaScript",
            technologies: [
                "Next.js",
                "Tailwind",
                "Supabase",
                "CMS"
            ],
            creator: "Priya Singh",
            role: "Web Developer",
            time: "6 days ago",
            likes: 89,
            comments: [
                {
                    user: "Meera",
                    text: "Simple and practical."
                }
            ],
            saves: 18,
            views: 160,
            type: "web",
            badge: "",
            github: "https://github.com/",
            story:
                "Blogify provides creators with a lightweight platform for publishing markdown content."
        }

    ];


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const projectGrid =
        document.getElementById("projectGrid");

    const searchInput =
        document.getElementById("searchInput");

    const searchBtn =
        document.getElementById("searchBtn");

    const categoryFilter =
        document.getElementById("categoryFilter");

    const levelFilter =
        document.getElementById("levelFilter");

    const languageFilter =
        document.getElementById("languageFilter");

    const sortFilter =
        document.getElementById("sortFilter");

    const categoryTabs =
        document.getElementById("categoryTabs");

    const resultCount =
        document.getElementById("resultCount");

    const emptyState =
        document.getElementById("emptyState");

    const clearFilters =
        document.getElementById("clearFilters");

    const modalBackdrop =
        document.getElementById("modalBackdrop");

    const modal =
        document.getElementById("modal");

    const modalClose =
        document.getElementById("modalClose");

    const modalContent =
        document.getElementById("modalContent");

    const toast =
        document.getElementById("toast");

    const profileButton =
        document.getElementById("profileButton");

    const profileMenu =
        document.getElementById("profileMenu");


    /* =====================================================
       USER STATE
    ===================================================== */

    let userData = JSON.parse(
        localStorage.getItem("skillconnectUserData")
    ) || {

        projectsShared: 4,
        profileViews: 256,
        opportunities: 12,
        peopleReached: 1200,

        likedProjects: [],
        savedProjects: []

    };


    /* =====================================================
       SAVE DATA
    ===================================================== */

    function saveProjects() {

        localStorage.setItem(
            "skillconnectProjects",
            JSON.stringify(projects)
        );

    }


    function saveUserData() {

        localStorage.setItem(
            "skillconnectUserData",
            JSON.stringify(userData)
        );

    }


    /* =====================================================
       TOAST
    ===================================================== */

    let toastTimer;

    function showToast(message) {

        if (!toast) return;

        toast.textContent = message;

        toast.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {

            toast.classList.remove("show");

        }, 2500);

    }


    /* =====================================================
       MODAL
    ===================================================== */

    function openModal(content) {

        modalContent.innerHTML = content;

        modalBackdrop.classList.add("show");

        document.body.style.overflow = "hidden";

    }


    function closeModal() {

        modalBackdrop.classList.remove("show");

        document.body.style.overflow = "";

        modalContent.innerHTML = "";

    }


    modalClose.addEventListener(
        "click",
        closeModal
    );


    modalBackdrop.addEventListener(
        "click",
        (event) => {

            if (event.target === modalBackdrop) {

                closeModal();

            }

        }
    );


    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {

                closeModal();

            }

        }
    );


    /* =====================================================
       PROJECT THUMBNAIL
    ===================================================== */

    function getProjectIcon(project) {

        const icons = {

            web: "💻",

            mobile: "📱",

            ai: "🤖",

            design: "🎨",

            data: "📊",

            creative: "🌐",

            hardware: "⚙️"

        };

        return icons[project.type] || "💻";

    }


    /* =====================================================
       RENDER PROJECTS
    ===================================================== */

    function renderProjects(list = projects) {

        projectGrid.innerHTML = "";

        resultCount.textContent =
            `${list.length} project${list.length !== 1 ? "s" : ""}`;


        if (list.length === 0) {

            emptyState.classList.remove("hidden");

            return;

        }

        emptyState.classList.add("hidden");


        list.forEach(project => {

            const liked =
                userData.likedProjects.includes(project.id);

            const saved =
                userData.savedProjects.includes(project.id);


            const card =
                document.createElement("article");

            card.className = "project-card";

            card.dataset.id = project.id;


            const badgeHTML =
                project.badge
                    ? `
                        <span class="tag ${
                            project.badge === "Open Source"
                                ? "green"
                                : project.badge === "AI"
                                    ? "ai-tag"
                                    : ""
                        }">
                            ${project.badge}
                        </span>
                    `
                    : "";


            card.innerHTML = `

                <div class="thumb ${project.type}">

                    ${badgeHTML}

                    <div class="mock-ui">

                        <div class="mock-top"></div>

                        <div class="mock-row">

                            <div class="mock-box"></div>

                            <div class="mock-box"></div>

                        </div>

                    </div>

                </div>


                <div class="card-body">

                    <h3 class="card-title">
                        ${escapeHTML(project.title)}
                    </h3>


                    <p class="card-desc">
                        ${escapeHTML(project.description)}
                    </p>


                    <div class="chips">

                        ${project.technologies
                            .map(
                                tech =>
                                    `<span class="chip">
                                        ${escapeHTML(tech)}
                                    </span>`
                            )
                            .join("")
                        }

                    </div>


                    <div class="creator-line">

                        <div class="mini-avatar">
                            ${getInitials(project.creator)}
                        </div>

                        <div>

                            <b>
                                ${escapeHTML(project.creator)}
                            </b>

                            <small>
                                ${escapeHTML(project.time)}
                                •
                                ${escapeHTML(project.role)}
                            </small>

                        </div>

                    </div>


                    <div class="card-footer">

                        <button
                            class="card-action like-btn ${
                                liked ? "liked" : ""
                            }"
                            data-action="like"
                            data-id="${project.id}">

                            ${liked ? "♥" : "♡"}
                            <span>${project.likes}</span>

                        </button>


                        <button
                            class="card-action comment-btn"
                            data-action="comment"
                            data-id="${project.id}">

                            ◯
                            <span>
                                ${project.comments.length}
                            </span>

                        </button>


                        <button
                            class="card-action save-btn ${
                                saved ? "saved" : ""
                            }"
                            data-action="save"
                            data-id="${project.id}">

                            ${saved ? "★" : "☆"}

                        </button>


                        <button
                            class="view-btn"
                            data-action="view"
                            data-id="${project.id}">

                            View

                        </button>

                    </div>

                </div>

            `;


            projectGrid.appendChild(card);

        });

    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(value) {

        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");

    }


    /* =====================================================
       INITIALS
    ===================================================== */

    function getInitials(name) {

        return name
            .split(" ")
            .map(word => word[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();

    }


    /* =====================================================
       FILTER PROJECTS
    ===================================================== */

    function filterProjects() {

        const search =
            searchInput.value
                .trim()
                .toLowerCase();

        const category =
            categoryFilter.value;

        const level =
            levelFilter.value;

        const language =
            languageFilter.value;

        const sort =
            sortFilter.value;


        let filtered =
            projects.filter(project => {

                const searchableText = [

                    project.title,

                    project.description,

                    project.category,

                    project.level,

                    project.language,

                    project.creator,

                    ...project.technologies

                ]
                    .join(" ")
                    .toLowerCase();


                const matchesSearch =
                    !search ||
                    searchableText.includes(search);


                const matchesCategory =
                    category === "all" ||
                    project.category === category;


                const matchesLevel =
                    level === "all" ||
                    project.level === level;


                const matchesLanguage =
                    language === "all" ||
                    project.language === language;


                return (
                    matchesSearch &&
                    matchesCategory &&
                    matchesLevel &&
                    matchesLanguage
                );

            });


        /* SORT */

        if (sort === "likes") {

            filtered.sort(
                (a, b) =>
                    b.likes - a.likes
            );

        }


        if (sort === "comments") {

            filtered.sort(
                (a, b) =>
                    b.comments.length -
                    a.comments.length
            );

        }


        if (sort === "views") {

            filtered.sort(
                (a, b) =>
                    b.views - a.views
            );

        }


        if (sort === "latest") {

            filtered.sort(
                (a, b) =>
                    b.id - a.id
            );

        }


        renderProjects(filtered);

    }


    /* =====================================================
       SEARCH
    ===================================================== */

    searchInput.addEventListener(
        "input",
        filterProjects
    );


    searchBtn.addEventListener(
        "click",
        () => {

            filterProjects();

            searchInput.focus();

            showToast(
                "Search results updated"
            );

        }
    );


    searchInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                filterProjects();

                showToast(
                    "Searching projects..."
                );

            }

        }
    );


    /* =====================================================
       FILTER EVENTS
    ===================================================== */

    [
        categoryFilter,
        levelFilter,
        languageFilter,
        sortFilter

    ].forEach(element => {

        element.addEventListener(
            "change",
            filterProjects
        );

    });


    /* =====================================================
       CATEGORY TABS
    ===================================================== */

    categoryTabs.addEventListener(
        "click",
        event => {

            const tab =
                event.target.closest(".tab");

            if (!tab) return;


            document
                .querySelectorAll(".tab")
                .forEach(button => {

                    button.classList.remove(
                        "active"
                    );

                });


            tab.classList.add("active");


            const category =
                tab.dataset.category;


            categoryFilter.value =
                category === "all"
                    ? "all"
                    : category;


            filterProjects();

        }
    );


    /* =====================================================
       CLEAR FILTERS
    ===================================================== */

    clearFilters.addEventListener(
        "click",
        () => {

            searchInput.value = "";

            categoryFilter.value = "all";

            levelFilter.value = "all";

            languageFilter.value = "all";

            sortFilter.value = "latest";


            document
                .querySelectorAll(".tab")
                .forEach(button => {

                    button.classList.remove(
                        "active"
                    );

                });


            document
                .querySelector('.tab[data-category="all"]')
                ?.classList.add("active");


            filterProjects();

            showToast(
                "All filters cleared"
            );

        }
    );


    /* =====================================================
       PROJECT CARD ACTIONS
    ===================================================== */

    projectGrid.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-action]"
                );

            if (!button) return;


            const id =
                Number(button.dataset.id);

            const action =
                button.dataset.action;


            if (action === "like") {

                toggleLike(id);

            }


            if (action === "save") {

                toggleSave(id);

            }


            if (action === "comment") {

                openProject(id, true);

            }


            if (action === "view") {

                openProject(id);

            }

        }
    );


    /* =====================================================
       LIKE PROJECT
    ===================================================== */

    function toggleLike(id) {

        const project =
            projects.find(
                item => item.id === id
            );

        if (!project) return;


        const index =
            userData.likedProjects.indexOf(id);


        if (index === -1) {

            userData.likedProjects.push(id);

            project.likes++;

            showToast(
                "❤️ Project liked"
            );

        } else {

            userData.likedProjects.splice(
                index,
                1
            );

            project.likes--;

            showToast(
                "Like removed"
            );

        }


        saveProjects();

        saveUserData();

        filterProjects();

        updateImpact();

    }


    /* =====================================================
       SAVE PROJECT
    ===================================================== */

    function toggleSave(id) {

        const index =
            userData.savedProjects.indexOf(id);


        if (index === -1) {

            userData.savedProjects.push(id);

            showToast(
                "🔖 Project saved"
            );

        } else {

            userData.savedProjects.splice(
                index,
                1
            );

            showToast(
                "Project removed from saved"
            );

        }


        saveUserData();

        filterProjects();

    }


    /* =====================================================
       OPEN PROJECT
    ===================================================== */

    function openProject(
        id,
        focusComment = false
    ) {

        const project =
            projects.find(
                item => item.id === id
            );

        if (!project) return;


        project.views++;

        userData.profileViews++;

        saveProjects();

        saveUserData();


        const liked =
            userData.likedProjects.includes(
                project.id
            );


        const saved =
            userData.savedProjects.includes(
                project.id
            );


        openModal(`

            <div class="view-project">

                <div class="big-thumb">

                    ${getProjectIcon(project)}

                </div>


                <div>

                    <span class="chip">
                        ${escapeHTML(project.category)}
                    </span>

                    <span class="chip">
                        ${escapeHTML(project.level)}
                    </span>

                </div>


                <h2>
                    ${escapeHTML(project.title)}
                </h2>


                <p>
                    ${escapeHTML(project.description)}
                </p>


                <div class="chips">

                    ${project.technologies
                        .map(
                            tech =>
                                `<span class="chip">
                                    ${escapeHTML(tech)}
                                </span>`
                        )
                        .join("")
                    }

                </div>


                <div class="creator-line">

                    <div class="mini-avatar">

                        ${getInitials(project.creator)}

                    </div>

                    <div>

                        <b>
                            ${escapeHTML(project.creator)}
                        </b>

                        <small>
                            ${escapeHTML(project.role)}
                        </small>

                    </div>

                </div>


                <div class="card-footer">

                    <button
                        class="card-action ${
                            liked ? "liked" : ""
                        }"
                        id="modalLikeBtn">

                        ${liked ? "♥" : "♡"}

                        ${project.likes}

                    </button>


                    <button
                        class="card-action ${
                            saved ? "saved" : ""
                        }"
                        id="modalSaveBtn">

                        ${saved ? "★ Saved" : "☆ Save"}

                    </button>

                </div>


                <a
                    href="${escapeHTML(project.github)}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="github-link">

                    ◉ Open GitHub

                </a>


                <div>

                    <h3>
                        Project Story
                    </h3>

                    <p>
                        ${escapeHTML(project.story)}
                    </p>

                </div>


                <div>

                    <h3>
                        Comments
                    </h3>


                    <div
                        class="comment-list"
                        id="commentList">

                        ${renderComments(project)}

                    </div>


                    <form
                        class="comment-form"
                        id="commentForm">

                        <input
                            type="text"
                            id="commentInput"
                            placeholder="Write a comment..."
                            maxlength="200"
                            required
                        >

                        <button type="submit">
                            ➤
                        </button>

                    </form>

                </div>

            </div>

        `);


        document
            .getElementById("modalLikeBtn")
            ?.addEventListener(
                "click",
                () => {

                    toggleLike(project.id);

                    openProject(
                        project.id
                    );

                }
            );


        document
            .getElementById("modalSaveBtn")
            ?.addEventListener(
                "click",
                () => {

                    toggleSave(project.id);

                    openProject(
                        project.id
                    );

                }
            );


        document
            .getElementById("commentForm")
            ?.addEventListener(
                "submit",
                event => {

                    event.preventDefault();

                    const input =
                        document.getElementById(
                            "commentInput"
                        );


                    const text =
                        input.value.trim();


                    if (!text) return;


                    project.comments.push({

                        user: "Aniket",
                        text: text

                    });


                    saveProjects();

                    showToast(
                        "💬 Comment added"
                    );


                    openProject(
                        project.id
                    );

                }
            );


        if (focusComment) {

            setTimeout(() => {

                document
                    .getElementById("commentInput")
                    ?.focus();

            }, 100);

        }

    }


    /* =====================================================
       COMMENTS
    ===================================================== */

    function renderComments(project) {

        if (!project.comments.length) {

            return `
                <p>
                    No comments yet. Be the first!
                </p>
            `;

        }


        return project.comments
            .map(comment => {

                return `

                    <div class="comment">

                        <b>
                            ${escapeHTML(comment.user)}
                        </b>

                        <p>
                            ${escapeHTML(comment.text)}
                        </p>

                    </div>

                `;

            })
            .join("");

    }


    /* =====================================================
       PROFILE DROPDOWN
    ===================================================== */

    profileButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            profileMenu.classList.toggle(
                "open"
            );

        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                !profileMenu.contains(event.target) &&
                !profileButton.contains(event.target)
            ) {

                profileMenu.classList.remove(
                    "open"
                );

            }

        }
    );


    /* =====================================================
       PROFILE MENU ACTIONS
    ===================================================== */

    profileMenu.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "[data-profile-action]"
                );

            if (!button) return;


            const action =
                button.dataset.profileAction;


            profileMenu.classList.remove(
                "open"
            );


            if (action === "profile") {

                showToast(
                    "Opening your profile..."
                );

            }


            if (action === "settings") {

                showToast(
                    "Opening settings..."
                );

            }


            if (action === "saved") {

                showSavedProjects();

            }


            if (action === "logout") {

                showToast(
                    "You have been logged out"
                );

                setTimeout(() => {

                    localStorage.removeItem(
                        "skillconnectUserData"
                    );

                }, 800);

            }

        }
    );


    /* =====================================================
       SAVED PROJECTS
    ===================================================== */

    function showSavedProjects() {

        const saved =
            projects.filter(project =>
                userData.savedProjects.includes(
                    project.id
                )
            );


        if (!saved.length) {

            openModal(`

                <h2>
                    Saved Projects
                </h2>

                <p>
                    You haven't saved any projects yet.
                </p>

            `);

            return;

        }


        openModal(`

            <h2>
                Saved Projects
            </h2>

            <p>
                Your bookmarked projects.
            </p>

            <div class="comment-list">

                ${saved.map(project => `

                    <button
                        class="quick-action saved-open"
                        data-id="${project.id}">

                        <div>

                            <b>
                                ${escapeHTML(project.title)}
                            </b>

                            <small>
                                ${escapeHTML(project.creator)}
                            </small>

                        </div>

                    </button>

                `).join("")}

            </div>

        `);


        document
            .querySelectorAll(".saved-open")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        closeModal();

                        openProject(
                            Number(
                                button.dataset.id
                            )
                        );

                    }
                );

            });

    }


    /* =====================================================
       SHARE PROJECT
    ===================================================== */

    function openShareProjectModal() {

        openModal(`

            <h2>
                🚀 Share Your Project
            </h2>

            <p>
                Showcase your project to the SkillConnect community.
            </p>


            <form id="shareProjectForm">


                <div class="form-group">

                    <label>
                        Project Name
                    </label>

                    <input
                        type="text"
                        id="newProjectTitle"
                        placeholder="e.g. AI Resume Analyzer"
                        required
                    >

                </div>


                <div class="form-group">

                    <label>
                        Description
                    </label>

                    <textarea
                        id="newProjectDescription"
                        placeholder="Describe your project..."
                        required
                    ></textarea>

                </div>


                <div class="form-group">

                    <label>
                        Category
                    </label>

                    <select id="newProjectCategory">

                        <option>
                            Web Development
                        </option>

                        <option>
                            Mobile Apps
                        </option>

                        <option>
                            AI/ML
                        </option>

                        <option>
                            Design
                        </option>

                        <option>
                            Data Science
                        </option>

                        <option>
                            Creative
                        </option>

                        <option>
                            Hardware
                        </option>

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Level
                    </label>

                    <select id="newProjectLevel">

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
                        Main Language
                    </label>

                    <input
                        type="text"
                        id="newProjectLanguage"
                        placeholder="JavaScript"
                        required
                    >

                </div>


                <div class="form-group">

                    <label>
                        Technologies
                    </label>

                    <input
                        type="text"
                        id="newProjectTech"
                        placeholder="React, Node.js, MongoDB"
                    >

                </div>


                <div class="form-group">

                    <label>
                        GitHub URL
                    </label>

                    <input
                        type="url"
                        id="newProjectGithub"
                        placeholder="https://github.com/..."
                    >

                </div>


                <button
                    type="submit"
                    class="modal-submit">

                    Publish Project

                </button>


            </form>

        `);


        document
            .getElementById("shareProjectForm")
            .addEventListener(
                "submit",
                event => {

                    event.preventDefault();


                    const title =
                        document.getElementById(
                            "newProjectTitle"
                        ).value.trim();


                    const description =
                        document.getElementById(
                            "newProjectDescription"
                        ).value.trim();


                    const category =
                        document.getElementById(
                            "newProjectCategory"
                        ).value;


                    const level =
                        document.getElementById(
                            "newProjectLevel"
                        ).value;


                    const language =
                        document.getElementById(
                            "newProjectLanguage"
                        ).value.trim();


                    const tech =
                        document.getElementById(
                            "newProjectTech"
                        ).value
                        .split(",")
                        .map(item =>
                            item.trim()
                        )
                        .filter(Boolean);


                    const github =
                        document.getElementById(
                            "newProjectGithub"
                        ).value.trim();


                    const newProject = {

                        id:
                            Date.now(),

                        title,

                        description,

                        category,

                        level,

                        language,

                        technologies:
                            tech.length
                                ? tech
                                : [language],

                        creator:
                            "Aniket Deshmukh",

                        role:
                            "Creator",

                        time:
                            "Just now",

                        likes: 0,

                        comments: [],

                        saves: 0,

                        views: 0,

                        type:
                            getProjectType(
                                category
                            ),

                        badge:
                            "New",

                        github:
                            github ||
                            "https://github.com/",

                        story:
                            "A new project shared by Aniket Deshmukh."

                    };


                    projects.unshift(
                        newProject
                    );


                    userData.projectsShared++;


                    saveProjects();

                    saveUserData();


                    closeModal();

                    filterProjects();

                    updateImpact();


                    showToast(
                        "🎉 Project published successfully!"
                    );

                }
            );

    }


    /* =====================================================
       PROJECT TYPE
    ===================================================== */

    function getProjectType(category) {

        const types = {

            "Web Development": "web",

            "Mobile Apps": "mobile",

            "AI/ML": "ai",

            "Design": "design",

            "Data Science": "data",

            "Creative": "creative",

            "Hardware": "hardware"

        };

        return types[category] || "web";

    }


    /* =====================================================
       GITHUB LINK
    ===================================================== */

    function openGithubModal() {

        openModal(`

            <h2>
                ◉ Add GitHub Link
            </h2>

            <p>
                Connect your GitHub repository to your SkillConnect profile.
            </p>


            <form id="githubForm">

                <div class="form-group">

                    <label>
                        GitHub Repository URL
                    </label>

                    <input
                        type="url"
                        id="githubInput"
                        placeholder="https://github.com/username/project"
                        required
                    >

                </div>


                <button
                    class="modal-submit"
                    type="submit">

                    Connect GitHub

                </button>

            </form>

        `);


        document
            .getElementById("githubForm")
            .addEventListener(
                "submit",
                event => {

                    event.preventDefault();


                    const url =
                        document.getElementById(
                            "githubInput"
                        ).value.trim();


                    if (
                        !url.includes(
                            "github.com"
                        )
                    ) {

                        showToast(
                            "Please enter a valid GitHub URL"
                        );

                        return;

                    }


                    localStorage.setItem(
                        "skillconnectGithub",
                        url
                    );


                    closeModal();


                    showToast(
                        "🐙 GitHub repository connected!"
                    );

                }
            );

    }


    /* =====================================================
       PROJECT STORY
    ===================================================== */

    function openStoryModal() {

        openModal(`

            <h2>
                ✍️ Write a Project Story
            </h2>

            <p>
                Tell people how you created your project.
            </p>


            <form id="storyForm">

                <div class="form-group">

                    <label>
                        Project
                    </label>

                    <select id="storyProject">

                        ${projects.map(project => `

                            <option
                                value="${project.id}">

                                ${escapeHTML(
                                    project.title
                                )}

                            </option>

                        `).join("")}

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Your Story
                    </label>

                    <textarea
                        id="storyText"
                        placeholder="Tell your project journey..."
                        required
                    ></textarea>

                </div>


                <button
                    class="modal-submit"
                    type="submit">

                    Publish Story

                </button>

            </form>

        `);


        document
            .getElementById("storyForm")
            .addEventListener(
                "submit",
                event => {

                    event.preventDefault();


                    const id =
                        Number(
                            document.getElementById(
                                "storyProject"
                            ).value
                        );


                    const story =
                        document.getElementById(
                            "storyText"
                        ).value.trim();


                    const project =
                        projects.find(
                            item =>
                                item.id === id
                        );


                    if (project) {

                        project.story =
                            story;

                        saveProjects();

                        closeModal();

                        showToast(
                            "✍️ Project story published!"
                        );

                    }

                }
            );

    }


    /* =====================================================
       QUICK ACTION BUTTONS
    ===================================================== */

    document
        .getElementById("quickShare")
        ?.addEventListener(
            "click",
            openShareProjectModal
        );


    document
        .getElementById("heroShareBtn")
        ?.addEventListener(
            "click",
            openShareProjectModal
        );


    document
        .getElementById("sidePostBtn")
        ?.addEventListener(
            "click",
            openShareProjectModal
        );


    document
        .getElementById("quickGithub")
        ?.addEventListener(
            "click",
            openGithubModal
        );


    document
        .getElementById("quickStory")
        ?.addEventListener(
            "click",
            openStoryModal
        );


    /* =====================================================
       HOW IT WORKS
    ===================================================== */

    document
        .getElementById("howBtn")
        ?.addEventListener(
            "click",
            () => {

                openModal(`

                    <h2>
                        🚀 How Project Gallery Works
                    </h2>

                    <div class="comment-list">

                        <div class="comment">

                            <b>01 — Share</b>

                            <p>
                                Publish your projects and showcase your skills.
                            </p>

                        </div>


                        <div class="comment">

                            <b>02 — Get Discovered</b>

                            <p>
                                Learners, developers and employers can discover your work.
                            </p>

                        </div>


                        <div class="comment">

                            <b>03 — Connect</b>

                            <p>
                                People can like, comment, save and view your projects.
                            </p>

                        </div>


                        <div class="comment">

                            <b>04 — Get Opportunities</b>

                            <p>
                                Your projects can help you find collaborators, mentors and jobs.
                            </p>

                        </div>

                    </div>

                `);

            }
        );


    /* =====================================================
       IMPACT SECTION
    ===================================================== */

    function updateImpact() {

        const projectsElement =
            document.getElementById(
                "impactProjects"
            );

        const viewsElement =
            document.getElementById(
                "impactViews"
            );

        const opportunitiesElement =
            document.getElementById(
                "impactOpportunities"
            );

        const reachedElement =
            document.getElementById(
                "impactReached"
            );


        if (projectsElement) {

            projectsElement.textContent =
                userData.projectsShared;

        }


        if (viewsElement) {

            viewsElement.textContent =
                formatNumber(
                    userData.profileViews
                );

        }


        if (opportunitiesElement) {

            opportunitiesElement.textContent =
                userData.opportunities;

        }


        if (reachedElement) {

            reachedElement.textContent =
                formatNumber(
                    userData.peopleReached
                );

        }

    }


    function formatNumber(number) {

        if (number >= 1000) {

            return (
                (number / 1000)
                    .toFixed(
                        number >= 10000
                            ? 0
                            : 1
                    )
                    .replace(".0", "")
                + "K"
            );

        }

        return number;

    }


    /* =====================================================
       VIEW PROFILE
    ===================================================== */

    document
        .getElementById("viewProfileBtn")
        ?.addEventListener(
            "click",
            () => {

                openModal(`

                    <h2>
                        👤 Aniket Deshmukh
                    </h2>

                    <p>
                        Learner • Creator • Full Stack Developer
                    </p>


                    <div class="comment-list">

                        <div class="comment">

                            <b>
                                Projects
                            </b>

                            <p>
                                ${userData.projectsShared}
                                projects shared
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                Reach
                            </b>

                            <p>
                                ${formatNumber(
                                    userData.peopleReached
                                )}
                                people reached
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                Opportunities
                            </b>

                            <p>
                                ${userData.opportunities}
                                opportunities
                            </p>

                        </div>

                    </div>

                `);

            }
        );


    /* =====================================================
       VIEW ALL CREATORS
    ===================================================== */

    document
        .getElementById("viewAllCreators")
        ?.addEventListener(
            "click",
            () => {

                openModal(`

                    <h2>
                        🏆 Top Project Creators
                    </h2>

                    <div class="comment-list">

                        <div class="comment">
                            <b>🥇 Meera Joshi</b>
                            <p>UI/UX • 24 projects</p>
                        </div>

                        <div class="comment">
                            <b>🥈 Arjun Verma</b>
                            <p>Full Stack • 18 projects</p>
                        </div>

                        <div class="comment">
                            <b>🥉 Kavya Nair</b>
                            <p>AI/ML • 16 projects</p>
                        </div>

                        <div class="comment">
                            <b>4. Rohan Gupta</b>
                            <p>App Dev • 14 projects</p>
                        </div>

                        <div class="comment">
                            <b>5. Isha Malik</b>
                            <p>Design • 13 projects</p>
                        </div>

                    </div>

                `);

            }
        );


    /* =====================================================
       EXPLORE JOBS
    ===================================================== */

    document
        .getElementById("exploreJobs")
        ?.addEventListener(
            "click",
            () => {

                openModal(`

                    <h2>
                        💼 Opportunities
                    </h2>

                    <p>
                        Based on your projects and skills, these opportunities could be a good match.
                    </p>


                    <div class="comment-list">

                        <div class="comment">

                            <b>
                                Junior Full Stack Developer
                            </b>

                            <p>
                                JavaScript • React • FastAPI
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                AI/ML Intern
                            </b>

                            <p>
                                Python • TensorFlow • OpenCV
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                Frontend Developer
                            </b>

                            <p>
                                HTML • CSS • JavaScript
                            </p>

                        </div>

                    </div>

                `);

            }
        );


    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    document
        .getElementById("notificationBtn")
        ?.addEventListener(
            "click",
            () => {

                openModal(`

                    <h2>
                        🔔 Notifications
                    </h2>


                    <div class="comment-list">

                        <div class="comment">

                            <b>
                                ❤️ Your project received a like
                            </b>

                            <p>
                                Someone liked SkillSwap.
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                💬 New comment
                            </b>

                            <p>
                                Someone commented on your project.
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                💼 New opportunity
                            </b>

                            <p>
                                A company viewed your profile.
                            </p>

                        </div>


                        <div class="comment">

                            <b>
                                👀 Profile views increased
                            </b>

                            <p>
                                Your profile is getting noticed.
                            </p>

                        </div>

                    </div>

                `);

            }
        );


    /* =====================================================
       NAVIGATION DEMO
    ===================================================== */

    document
        .querySelectorAll(".nav-item")
        .forEach(item => {

            item.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    const page =
                        item
                            .querySelector("span")
                            ?.textContent
                            .trim();


                    if (
                        page &&
                        page !== "Project Gallery"
                    ) {

                        showToast(
                            `${page} page selected`
                        );

                    }

                }
            );

        });


    /* =====================================================
       KEYBOARD SHORTCUT
    ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            if (
                (event.ctrlKey ||
                    event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();

                searchInput.focus();

            }

        }
    );


    /* =====================================================
       INITIAL LOAD
    ===================================================== */

    updateImpact();

    renderProjects(projects);


});