/* =========================================================
   SKILLSHARE — EXPLORE.JS
   Search + Filters + Hover Effects + Scroll Animations
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       0. API CLIENT
       ===================================================== */
    const API = window.SkillShareAPI;

    /* =====================================================
       1. SCROLL PROGRESS BAR
    ===================================================== */

    const progressBar = document.querySelector(".scroll-progress");

    function updateScrollProgress() {

        if (!progressBar) return;

        const scrollTop = window.scrollY;

        const pageHeight =
            document.documentElement.scrollHeight -
            window.innerHeight;

        const progress =
            pageHeight > 0
                ? (scrollTop / pageHeight) * 100
                : 0;

        progressBar.style.width = `${progress}%`;
    }

    window.addEventListener("scroll", updateScrollProgress);

    updateScrollProgress();


    /* =====================================================
       2. MOUSE GLOW EFFECT
    ===================================================== */

    const cursorGlow = document.querySelector(".cursor-glow");

    if (cursorGlow) {

        document.addEventListener("mousemove", (event) => {

            cursorGlow.style.left = `${event.clientX}px`;
            cursorGlow.style.top = `${event.clientY}px`;

        });

    }


    /* =====================================================
       3. SCROLL REVEAL ANIMATION
    ===================================================== */

    const revealElements =
        document.querySelectorAll(".reveal, .reveal-item");

    const revealObserver =
        new IntersectionObserver(
            (entries) => {

                entries.forEach((entry) => {

                    if (entry.isIntersecting) {

                        entry.target.classList.add("visible");

                        revealObserver.unobserve(entry.target);

                    }

                });

            },
            {
                threshold: 0.12
            }
        );

    revealElements.forEach((element) => {
        revealObserver.observe(element);
    });


    /* =====================================================
       4. STAGGER SKILL CARD ANIMATION
    ===================================================== */

    const skillCards =
        document.querySelectorAll(".skill-card");

    skillCards.forEach((card, index) => {

        card.style.transitionDelay =
            `${(index % 4) * 80}ms`;

        card.classList.add("reveal-item");

    });


    /* =====================================================
       5. CATEGORY FILTER
    ===================================================== */

    const categoryButtons =
        document.querySelectorAll(".category");

    categoryButtons.forEach((button) => {

        button.addEventListener("click", () => {

            categoryButtons.forEach((btn) => {
                btn.classList.remove("active");
            });

            button.classList.add("active");

            const category =
                button.dataset.category ||
                button.textContent.trim();

            filterSkills(category);

        });

    });


    function filterSkills(category) {

        const cards =
            document.querySelectorAll(".skill-card");

        cards.forEach((card, index) => {

            const cardCategory =
                card.dataset.category;

            const title =
                card.querySelector("h3")?.textContent
                    .toLowerCase() || "";

            const searchCategory =
                category.toLowerCase();

            const isAll =
                searchCategory.includes("all");

            const matches =
                isAll ||
                !cardCategory ||
                cardCategory.toLowerCase()
                    .includes(searchCategory) ||
                title.includes(searchCategory);

            if (matches) {

                card.classList.remove("hidden");

                setTimeout(() => {
                    card.classList.remove("filter-hide");
                }, index * 30);

            } else {

                card.classList.add("filter-hide");

                setTimeout(() => {
                    card.classList.add("hidden");
                }, 250);

            }

        });

    }


    /* =====================================================
       6. SEARCH SKILLS
    ===================================================== */

    const searchInput =
        document.querySelector(".search-box input");

    const searchButton =
        document.querySelector(".search-box button");


    function searchSkills() {

        if (!searchInput) return;

        // When a skill's learning resources are open, the search box
        // filters resources (see LR wiring) — not the hidden skill grid.
        if (LR.skill) return;

        const searchValue =
            searchInput.value
                .trim()
                .toLowerCase();

        const cards =
            document.querySelectorAll(".skill-card");

        let found = 0;

        cards.forEach((card) => {

            const title =
                card.querySelector("h3")
                    ?.textContent
                    .toLowerCase() || "";

            const category =
                card.dataset.category
                    ?.toLowerCase() || "";

            const text =
                card.textContent.toLowerCase();

            const matches =
                searchValue === "" ||
                title.includes(searchValue) ||
                category.includes(searchValue) ||
                text.includes(searchValue);

            if (matches) {

                card.classList.remove("hidden");

                setTimeout(() => {
                    card.classList.remove("filter-hide");
                }, 20);

                found++;

            } else {

                card.classList.add("filter-hide");

                setTimeout(() => {
                    card.classList.add("hidden");
                }, 250);

            }

        });

        showSearchMessage(found);

    }


    function showSearchMessage(count) {

        let message =
            document.querySelector(".search-message");

        if (!message) {

            message =
                document.createElement("div");

            message.className =
                "search-message";

            message.style.marginTop = "15px";
            message.style.color = "#8f93aa";
            message.style.fontSize = "13px";

            const searchBox =
                document.querySelector(".search-box");

            if (searchBox) {
                searchBox.after(message);
            }

        }

        if (searchInput.value.trim() === "") {

            message.textContent = "";

        } else if (count === 0) {

            message.textContent =
                "No skills found. Try another search.";

        } else {

            message.textContent =
                `${count} skill${count > 1 ? "s" : ""} found`;

        }

    }


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            searchSkills
        );

    }


    if (searchInput) {

        searchInput.addEventListener(
            "keydown",
            (event) => {

                if (event.key === "Enter") {
                    searchSkills();
                }

            }
        );

        searchInput.addEventListener(
            "input",
            () => {

                if (searchInput.value.trim() === "") {
                    searchSkills();
                }

            }
        );

    }


    /* =====================================================
       7. HEART / FAVORITE BUTTON
    ===================================================== */

    const hearts =
        document.querySelectorAll(".heart");

    hearts.forEach((heart) => {

        heart.addEventListener("click", (event) => {

            event.preventDefault();
            event.stopPropagation();

            heart.classList.toggle("liked");

            if (heart.classList.contains("liked")) {

                heart.innerHTML = "♥";

                showToast("Skill added to bookmarks ❤️");

            } else {

                heart.innerHTML = "♡";

                showToast("Removed from bookmarks");

            }

        });

    });


    /* =====================================================
       8. BUTTON RIPPLE EFFECT
    ===================================================== */

    const buttons =
        document.querySelectorAll(
            "button, .primary-btn, .outline-btn"
        );

    buttons.forEach((button) => {

        button.addEventListener("click", function (event) {

            const ripple =
                document.createElement("span");

            ripple.className = "ripple";

            const rect =
                this.getBoundingClientRect();

            const size =
                Math.max(
                    rect.width,
                    rect.height
                );

            ripple.style.width =
                `${size}px`;

            ripple.style.height =
                `${size}px`;

            ripple.style.left =
                `${event.clientX - rect.left - size / 2}px`;

            ripple.style.top =
                `${event.clientY - rect.top - size / 2}px`;

            this.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 600);

        });

    });


    /* =====================================================
       9. 3D CARD TILT EFFECT
    ===================================================== */

    skillCards.forEach((card) => {

        card.addEventListener(
            "mousemove",
            (event) => {

                const rect =
                    card.getBoundingClientRect();

                const x =
                    event.clientX - rect.left;

                const y =
                    event.clientY - rect.top;

                const centerX =
                    rect.width / 2;

                const centerY =
                    rect.height / 2;

                const rotateX =
                    ((y - centerY) / centerY) * -4;

                const rotateY =
                    ((x - centerX) / centerX) * 4;

                card.style.transform =
                    `perspective(800px)
                     rotateX(${rotateX}deg)
                     rotateY(${rotateY}deg)
                     translateY(-8px)`;

            }
        );


        card.addEventListener(
            "mouseleave",
            () => {

                card.style.transform =
                    "";

            }
        );

    });


    /* =====================================================
       10. SHARE YOUR SKILL BUTTON
    ===================================================== */

    const shareButtons =
        document.querySelectorAll(
            ".share-btn, .primary-btn"
        );

    shareButtons.forEach((button) => {

        button.addEventListener("click", () => {

            const text =
                button.textContent
                    .toLowerCase();

            if (text.includes("share")) {

                showToast(
                    "Opening skill sharing form..."
                );

            }

        });

    });


    /* =====================================================
       11. CLEAR FILTERS
    ===================================================== */

    const clearButtons =
        document.querySelectorAll(
            ".filters button"
        );

    clearButtons.forEach((button) => {

        if (
            button.textContent
                .toLowerCase()
                .includes("clear")
        ) {

            button.addEventListener(
                "click",
                clearFilters
            );

        }

    });


    function clearFilters() {

        if (searchInput) {
            searchInput.value = "";
        }

        categoryButtons.forEach((button, index) => {

            button.classList.remove("active");

            if (index === 0) {
                button.classList.add("active");
            }

        });

        skillCards.forEach((card) => {

            card.classList.remove(
                "hidden",
                "filter-hide"
            );

        });

        showSearchMessage(0);

        showToast("Filters cleared");

    }


    /* =====================================================
       12. TOAST NOTIFICATION
    ===================================================== */

    function showToast(message) {

        let toast =
            document.querySelector(".toast");

        if (!toast) {

            toast =
                document.createElement("div");

            toast.className = "toast";

            document.body.appendChild(toast);

        }

        toast.textContent = message;

        toast.classList.add("show");

        clearTimeout(toast.hideTimer);

        toast.hideTimer =
            setTimeout(() => {

                toast.classList.remove("show");

            }, 2200);

    }


    /* =====================================================
       13. KEYBOARD SHORTCUT — SEARCH
    ===================================================== */

    document.addEventListener(
        "keydown",
        (event) => {

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();

                searchInput?.focus();

            }

            if (
                event.key === "/" &&
                document.activeElement !== searchInput
            ) {

                event.preventDefault();

                searchInput?.focus();

            }

        }
    );


    /* =====================================================
       14. SMOOTH SCROLL FOR INTERNAL LINKS
    ===================================================== */

    document.querySelectorAll(
        'a[href^="#"]'
    ).forEach((link) => {

        link.addEventListener(
            "click",
            (event) => {

                const targetId =
                    link.getAttribute("href");

                if (
                    targetId &&
                    targetId !== "#"
                ) {

                    const target =
                        document.querySelector(
                            targetId
                        );

                    if (target) {

                        event.preventDefault();

                        target.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });

                    }

                }

            }
        );

    });


    /* =====================================================
       15. NAV ACTIVE STATE
    ===================================================== */

    const navLinks =
        document.querySelectorAll(".topnav a");

    navLinks.forEach((link) => {

        link.addEventListener("click", () => {

            navLinks.forEach((item) => {
                item.classList.remove("active");
            });

            link.classList.add("active");

        });

    });


    /* =====================================================
       16. PARALLAX HERO EFFECT
    ===================================================== */

    const heroArt =
        document.querySelector(".hero-art");

    if (heroArt) {

        window.addEventListener(
            "scroll",
            () => {

                const scroll =
                    window.scrollY;

                if (scroll < 600) {

                    heroArt.style.transform =
                        `translateY(${scroll * 0.08}px)`;

                }

            }
        );

    }


    /* =====================================================
       16b. LEARNING RESOURCES (real PostgreSQL content)
       Data source: /api/learning-resources (seeded with
       real, publicly available videos + courses from
       trusted providers). No dummy values.
    ===================================================== */

    const LR = {
        skill: null,          // currently selected skill (null = all)
        difficulty: "all",
        provider: "all",
        type: "all",
        search: "",
        sort: "az",
        cache: [],            // all resources (for skill counts)
        myLearning: null,     // authenticated user's learning records
    };

    const lrEl = (id) => document.getElementById(id);

    const skillGridEl = lrEl("skillGrid");
    const skillsLoadingEl = lrEl("skillsLoading");
    const resourceSectionEl = lrEl("resourceSection");
    const resourceSkillNameEl = lrEl("resourceSkillName");
    const backToSkillsEl = lrEl("backToSkills");
    const learningResourcesEl = lrEl("learningResources");
    const resourceOverviewEl = lrEl("resourceOverview");
    const difficultyTabsEl = lrEl("difficultyTabs");
    const videoGridEl = lrEl("videoGrid");
    const courseGridEl = lrEl("courseGrid");
    const levelFilterEl = lrEl("levelFilter");
    const providerFilterEl = lrEl("providerFilter");
    const typeFilterEl = lrEl("typeFilter");
    const sortSelectEl = lrEl("sortSelect");
    const clearFiltersEl = lrEl("clearFilters");
    const skillSearchEl = lrEl("skillSearch");
    const searchBtnEl = lrEl("searchBtn");

    // Popular Skills header (hidden while browsing a skill)
    const popularHeaderEl = document.querySelector(
        ".skills-area .section-title:not(.learning-resources-title)"
    );

    function lrEscape(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function lrToast(message, isError) {
        let toast = document.getElementById("lrToast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "lrToast";
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = "lr-toast show" + (isError ? " error" : "");
        clearTimeout(lrToast._t);
        lrToast._t = setTimeout(() => toast.classList.remove("show"), 3200);
    }

    function lrRequireAuth() {
        const token =
            (window.Config && Config.getToken && Config.getToken()) ||
            localStorage.getItem("skillshare_token") ||
            localStorage.getItem("token");
        return Boolean(token);
    }

    /* -----------------------------------------------------
       Skill grid — one card per skill that has real resources
    ----------------------------------------------------- */
    function lrRenderSkillGrid() {
        if (!skillGridEl) return;

        // Count real resources per skill from the cached fetch
        const counts = {};
        LR.cache.forEach((r) => {
            const skill = r.skill || "Other";
            if (!counts[skill]) counts[skill] = { total: 0, videos: 0, courses: 0 };
            counts[skill].total += 1;
            if ((r.resource_type || "").toLowerCase() === "video") counts[skill].videos += 1;
            else counts[skill].courses += 1;
        });

        const skills = Object.keys(counts).sort((a, b) => a.localeCompare(b));

        if (!skills.length) {
            skillGridEl.innerHTML =
                '<div class="empty-state">No learning resources are available yet. Please check back soon.</div>';
            return;
        }

        skillGridEl.innerHTML = skills
            .map((skill) => {
                const c = counts[skill];
                return (
                    '<button class="skill-card lr-skill-card" type="button" data-skill="' +
                    lrEscape(skill) + '">' +
                    '<div class="skill-card-top">' +
                    '<span class="skill-card-icon">' + lrEscape(skill.charAt(0).toUpperCase()) + '</span>' +
                    '<span class="lr-count-badge">' + c.total + ' resources</span>' +
                    '</div>' +
                    '<h3>' + lrEscape(skill) + '</h3>' +
                    '<p class="lr-skill-meta">' + c.videos + ' video' + (c.videos === 1 ? "" : "s") +
                    ' &middot; ' + c.courses + ' course' + (c.courses === 1 ? "" : "s") + '</p>' +
                    '<span class="lr-open-hint">Browse resources &rarr;</span>' +
                    '</button>'
                );
            })
            .join("");

        skillGridEl.querySelectorAll(".lr-skill-card").forEach((card) => {
            card.addEventListener("click", () => lrOpenSkill(card.dataset.skill));
        });
    }

    /* -----------------------------------------------------
       Open a skill's learning resources
    ----------------------------------------------------- */
    function lrOpenSkill(skill) {
        LR.skill = skill;
        LR.search = "";
        if (skillSearchEl) skillSearchEl.value = "";

        if (resourceSkillNameEl) resourceSkillNameEl.textContent = skill;
        if (resourceSectionEl) resourceSectionEl.hidden = false;
        if (learningResourcesEl) learningResourcesEl.hidden = false;
        if (skillGridEl) skillGridEl.hidden = true;
        if (skillsLoadingEl) skillsLoadingEl.hidden = true;
        if (popularHeaderEl) popularHeaderEl.hidden = true;

        lrRenderResources();
        learningResourcesEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function lrBackToSkills() {
        LR.skill = null;
        LR.search = "";
        if (skillSearchEl) skillSearchEl.value = "";
        if (resourceSectionEl) resourceSectionEl.hidden = true;
        if (learningResourcesEl) learningResourcesEl.hidden = true;
        if (skillGridEl) skillGridEl.hidden = false;
        if (popularHeaderEl) popularHeaderEl.hidden = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }


    /* -----------------------------------------------------
       Resource card builder (uses ONLY real DB fields)
    ----------------------------------------------------- */
    function lrResourceCard(r) {
        const isVideo = (r.resource_type || "").toLowerCase() === "video";
        const initials = (r.provider || "?").charAt(0).toUpperCase();
        const thumb = r.thumbnail_url
            ? '<img src="' + lrEscape(r.thumbnail_url) + '" alt="' + lrEscape(r.title) + '" loading="lazy">'
            : '<span class="lr-thumb-initial">' + lrEscape(initials) + '</span>';

        const meta = [];
        if (r.provider) meta.push(lrEscape(r.provider));
        if (r.difficulty) meta.push('<em class="lr-diff ' + lrDifficultyClass(r.difficulty) + '">' + lrEscape(r.difficulty) + '</em>');
        if (r.estimated_duration) meta.push(lrEscape(r.estimated_duration));
        if (r.topic) meta.push(lrEscape(r.topic));

        return (
            '<article class="resource-card">' +
            '<div class="resource-thumb lr-provider-thumb">' + thumb + '</div>' +
            '<div class="resource-body">' +
            '<span class="lr-provider-badge">' + lrEscape(r.provider || "Unknown provider") + '</span>' +
            '<h4 class="resource-title">' + lrEscape(r.title) + '</h4>' +
            (r.description ? '<p class="resource-desc">' + lrEscape(r.description) + '</p>' : "") +
            '<div class="lr-resource-meta">' + meta.map((m) => '<span>' + m + '</span>').join("") + '</div>' +
            '<div class="lr-resource-actions">' +
            '<a class="lr-open-btn" href="' + lrEscape(r.url) + '" target="_blank" rel="noopener noreferrer">' +
            (isVideo ? "▶ Watch" : "Start Course") + '</a>' +
            '<button class="lr-start-btn" type="button" data-id="' + Number(r.id) + '" data-type="' + lrEscape(r.resource_type || "course") +
            '" data-skill="' + lrEscape(r.skill || "") +
            '" data-title="' + lrEscape(r.title) + '">+ My Learning</button>' +
            '</div>' +
            '</div>' +
            '</article>'
        );
    }

    function lrEmptyState(message) {
        return '<div class="empty-state lr-empty">' + lrEscape(message) + '</div>';
    }

    /* -----------------------------------------------------
       Fetch + render resources for current state
    ----------------------------------------------------- */
    async function lrRenderResources() {
        if (!videoGridEl || !courseGridEl) return;

        videoGridEl.innerHTML = '<div class="empty-state">Loading videos…</div>';
        courseGridEl.innerHTML = '<div class="empty-state">Loading courses…</div>';

        // Real user progress (only when authenticated — never faked)
        if (lrRequireAuth()) {
            try {
                LR.myLearning = await API.getMyLearning();
            } catch {
                LR.myLearning = null;
            }
        }

        try {
            const params = {};
            if (LR.skill) params.skill = LR.skill;
            if (LR.type !== "all") params.resource_type = LR.type;
            if (LR.difficulty !== "all") params.difficulty = LR.difficulty;
            if (LR.provider !== "all") params.provider = LR.provider;
            if (LR.search) params.search = LR.search;

            const data = await API.getLearningResources(params);
            const resources = lrSortResources(data.resources || []);

            // Overview line: real counts + real user progress
            const videos = resources.filter((r) => (r.resource_type || "").toLowerCase() === "video");
            const courses = resources.filter((r) => (r.resource_type || "").toLowerCase() !== "video");

            let overview = resources.length
                ? resources.length + " learning resource" + (resources.length === 1 ? "" : "s") +
                  " from trusted providers" +
                  " — " + videos.length + " video" + (videos.length === 1 ? "" : "s") + ", " +
                  courses.length + " course" + (courses.length === 1 ? "" : "s") + "."
                : "No resources match your filters yet.";

            const learning = LR.myLearning;
            if (LR.skill && learning && Array.isArray(learning.skills)) {
                const mine = learning.skills.find(
                    (s) => ((s.skill || s.name) || "").toLowerCase() === LR.skill.toLowerCase()
                );
                overview += mine
                    ? " Your progress: " + mine.progress + "%."
                    : " Your progress: not started yet.";
            }

            if (resourceOverviewEl) resourceOverviewEl.textContent = overview;

            // Split into Passive Learning (videos) and Structured Courses
            videoGridEl.innerHTML = videos.length
                ? videos.map(lrResourceCard).join("")
                : lrEmptyState(
                    LR.skill
                        ? "No videos for this skill at the selected level yet."
                        : "No videos match your filters."
                );
            courseGridEl.innerHTML = courses.length
                ? courses.map(lrResourceCard).join("")
                : lrEmptyState(
                    LR.skill
                        ? "No courses for this skill at the selected level yet."
                        : "No courses match your filters."
                );

            wireStartButtons();
        } catch (err) {
            console.error("Failed to load learning resources:", err);
            videoGridEl.innerHTML = lrEmptyState("Could not load learning resources. Is the backend running?");
            courseGridEl.innerHTML = lrEmptyState("Could not load learning resources. Is the backend running?");
        }
    }


    function lrDifficultyClass(difficulty) {
        const d = (difficulty || "").toLowerCase();
        if (d === "beginner") return "beginner";
        if (d === "intermediate") return "intermediate";
        if (d === "advanced") return "advanced";
        return "beginner";
    }

    function lrSortResources(list) {
        const sorted = [...list];
        if (LR.sort === "za") {
            sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        } else if (LR.sort === "provider") {
            sorted.sort((a, b) =>
                (a.provider || "").localeCompare(b.provider || "") ||
                (a.title || "").localeCompare(b.title || "")
            );
        } else {
            sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        }
        return sorted;
    }

    /* -----------------------------------------------------
       "+ My Learning" — track a real resource (no fake progress)
       Uses the real resource_id so My Learning can later show
       started / in_progress / completed per resource.
    ----------------------------------------------------- */
    function wireStartButtons() {
        document.querySelectorAll(".lr-start-btn").forEach((btn) => {
            btn.addEventListener("click", async () => {
                if (!lrRequireAuth()) {
                    lrToast("Please log in to track your learning.", true);
                    return;
                }
                const skill = btn.dataset.skill;
                const title = btn.dataset.title;
                const resourceId = parseInt(btn.dataset.id || "", 10);
                const resourceType = btn.dataset.type || "course";
                if (!skill) return;

                                btn.disabled = true;
                btn.textContent = "Adding…";
                try {
                    if (Number.isFinite(resourceId)) {
                        // Use dedicated start endpoint when resource_id available
                        LR.myLearning = await API.startLearning(resourceId);
                    } else {
                        // Fallback: add by skill name (no resource_id)
                        LR.myLearning = await API.addOrUpdateLearning({
                            skill_name: skill,
                            resource_title: title,
                            resource_type: resourceType,
                            progress_percentage: 0,
                            status: "started",
                        });
                    }
                    lrToast('"' + title + '" added to My Learning (0%).');
                    lrRenderResources(); // refresh the real progress line
                } catch (err) {
                    lrToast(
                        (err && err.message) || "Could not add to My Learning.",
                        true
                    );
                    btn.disabled = false;
                    btn.textContent = "+ My Learning";
                }
            });
        });
    }

    /* -----------------------------------------------------
       Difficulty tabs (Beginner / Intermediate / Advanced)
    ----------------------------------------------------- */
    function lrRenderDifficultyTabs() {
        if (!difficultyTabsEl) return;
        const tabs = [
            ["all", "All Levels"],
            ["beginner", "Beginner"],
            ["intermediate", "Intermediate"],
            ["advanced", "Advanced"],
        ];
        difficultyTabsEl.innerHTML = tabs
            .map(
                ([value, label]) =>
                    '<button class="topic-tab lr-diff-tab' +
                    (LR.difficulty === value ? " active" : "") +
                    '" type="button" data-diff="' + value + '">' +
                    label +
                    "</button>"
            )
            .join("");

        difficultyTabsEl.querySelectorAll(".lr-diff-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
                LR.difficulty = tab.dataset.diff;
                if (levelFilterEl) levelFilterEl.value = LR.difficulty;
                lrRenderDifficultyTabs();
                lrRenderResources();
            });
        });
    }

    /* -----------------------------------------------------
       Provider dropdown — real providers from the database
    ----------------------------------------------------- */
    async function lrPopulateProviders() {
        if (!providerFilterEl) return;
        try {
            const data = await API.getLearningProviders();
            const providers = data.providers || [];
            if (!providers.length) return;
            providerFilterEl.innerHTML =
                '<option value="all">All Providers</option>' +
                providers
                    .map(
                        (p) =>
                            '<option value="' + lrEscape(p) + '">' +
                            lrEscape(p) + "</option>"
                    )
                    .join("");
            providerFilterEl.value = LR.provider;
        } catch {
            /* keep the static fallback options */
        }
    }

    /* -----------------------------------------------------
       Apply difficulty/provider/type/search to the cache
    ----------------------------------------------------- */
    function lrFilteredCache() {
        const term = (LR.search || "").toLowerCase();
        return LR.cache.filter((r) => {
            if (LR.difficulty !== "all" &&
                (r.difficulty || "").toLowerCase() !== LR.difficulty) return false;
            if (LR.provider !== "all" && r.provider !== LR.provider) return false;
            if (LR.type !== "all") {
                const isVideo = (r.resource_type || "").toLowerCase() === "video";
                if (LR.type === "video" && !isVideo) return false;
                if (LR.type === "course" && isVideo) return false;
            }
            if (term) {
                const haystack = (
                    (r.title || "") + " " + (r.description || "") + " " +
                    (r.topic || "") + " " + (r.skill || "") + " " +
                    (r.provider || "")
                ).toLowerCase();
                if (!haystack.includes(term)) return false;
            }
            return true;
        });
    }

    /* -----------------------------------------------------
       Initialization — load real resources and wire controls
    ----------------------------------------------------- */
    (async function lrInit() {

        // 1. Fetch ALL real resources once (skill counts + cache)
        try {
            const data = await API.getLearningResources({});
            LR.cache = data.resources || [];
        } catch (err) {
            console.error("Failed to load learning resources:", err);
            LR.cache = [];
        }

        if (skillsLoadingEl) skillsLoadingEl.hidden = true;
        lrRenderSkillGrid();

        // 2. Difficulty tabs + real provider list
        lrRenderDifficultyTabs();
        lrPopulateProviders();

        // 3. Back to skills
        backToSkillsEl?.addEventListener("click", lrBackToSkills);

        // 4. Sidebar filters (server-backed via lrRenderResources)
        levelFilterEl?.addEventListener("change", () => {
            LR.difficulty = levelFilterEl.value || "all";
            lrRenderDifficultyTabs();
            lrRenderResources();
        });

        providerFilterEl?.addEventListener("change", () => {
            LR.provider = providerFilterEl.value || "all";
            lrRenderResources();
        });

        typeFilterEl?.addEventListener("change", () => {
            LR.type = typeFilterEl.value || "all";
            lrRenderResources();
        });

        sortSelectEl?.addEventListener("change", () => {
            LR.sort = sortSelectEl.value || "az";
            lrRenderResources();
        });

        // 5. Clear All — reset the learning-resource filters too
        clearFiltersEl?.addEventListener("click", () => {
            LR.difficulty = "all";
            LR.provider = "all";
            LR.type = "all";
            LR.search = "";
            LR.sort = "az";
            if (levelFilterEl) levelFilterEl.value = "all";
            if (providerFilterEl) providerFilterEl.value = "all";
            if (typeFilterEl) typeFilterEl.value = "all";
            if (sortSelectEl) sortSelectEl.value = "az";
            lrRenderDifficultyTabs();
            if (LR.skill) lrRenderResources();
        });

        // 6. Resource search (debounced; filters resources while a skill is open)
        let searchTimer = null;

        function applyResourceSearch() {
            LR.search = (skillSearchEl?.value || "").trim();
            if (LR.skill) lrRenderResources();
        }

        skillSearchEl?.addEventListener("input", () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(applyResourceSearch, 350);
        });

        searchBtnEl?.addEventListener("click", () => {
            clearTimeout(searchTimer);
            applyResourceSearch();
        });

    })();



    setTimeout(() => {

        document
            .querySelectorAll(".hero-copy")
            .forEach((element) => {

                element.style.opacity = "1";

                element.style.transform =
                    "translateY(0)";

            });

    }, 100);


    console.log(
        "SkillShare Explore page loaded successfully 🚀"
    );

});