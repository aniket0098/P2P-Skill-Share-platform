/* =========================================================
   SKILLSHARE — EXPLORE.JS
   Search + Filters + Hover Effects + Scroll Animations
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

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
       17. INITIAL ANIMATION
    ===================================================== */

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