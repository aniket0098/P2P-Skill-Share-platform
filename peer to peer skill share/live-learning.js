/* =====================================================
   SKILLSHARE - MY TEACHING
   FULL MODIFIED JAVASCRIPT
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

    /* =================================================
       INITIALIZE LUCIDE ICONS
    ================================================= */

    if (typeof lucide !== "undefined") {
        lucide.createIcons();
    }


    /* =================================================
       ELEMENTS
    ================================================= */

    const sidebar = document.querySelector(".sidebar");
    const mobileMenu = document.querySelector(".mobile-menu");

    const searchButton = document.querySelector(".search-btn");
    const searchOverlay = document.getElementById("searchOverlay");
    const closeSearch = document.getElementById("closeSearch");
    const searchInput = document.getElementById("searchInput");

    const toast = document.getElementById("toast");



    /* =================================================
       TOAST NOTIFICATION
    ================================================= */

    function showToast(message) {

        if (!toast) return;

        const toastText = toast.querySelector("span");

        if (toastText) {
            toastText.textContent = message;
        }

        toast.classList.add("show");

        clearTimeout(window.toastTimer);

        window.toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2800);
    }



    /* =================================================
       SCROLL REVEAL
    ================================================= */

    const revealElements =
        document.querySelectorAll(".reveal");

    const revealObserver =
        new IntersectionObserver(
            (entries) => {

                entries.forEach((entry) => {

                    if (entry.isIntersecting) {

                        entry.target.classList.add("visible");

                        revealObserver.unobserve(
                            entry.target
                        );

                    }

                });

            },
            {
                threshold: 0.08
            }
        );


    revealElements.forEach((element) => {
        revealObserver.observe(element);
    });



    /* =================================================
       ANIMATED COUNTERS
    ================================================= */

    const counters =
        document.querySelectorAll(".counter");

    let countersStarted = false;


    function animateCounters() {

        if (countersStarted) return;

        countersStarted = true;


        counters.forEach(counter => {

            const target =
                Number(counter.dataset.target);

            let current = 0;

            const duration = 1300;

            const increment =
                target / (duration / 16);


            function updateCounter() {

                current += increment;


                if (current >= target) {

                    counter.textContent =
                        target.toLocaleString();

                    return;
                }


                counter.textContent =
                    Math.floor(current)
                        .toLocaleString();


                requestAnimationFrame(
                    updateCounter
                );
            }


            updateCounter();

        });

    }


    const statsSection =
        document.querySelector(".stats-grid");


    if (statsSection) {

        const statsObserver =
            new IntersectionObserver(
                entries => {

                    if (
                        entries[0].isIntersecting
                    ) {

                        animateCounters();

                        statsObserver.disconnect();
                    }

                },
                {
                    threshold: 0.2
                }
            );


        statsObserver.observe(statsSection);

    }



    /* =================================================
       SIDEBAR NAVIGATION
       
       IMPORTANT:
       There is NO preventDefault() here.
       
       This allows:
       
       dashboard.html
       explore-skills.html
       my-learning.html
       my-teaching.html
       students.html
       reviews.html
       earnings.html
       requests.html
       messages.html
       calendar.html
       resources.html
       settings.html
       
       to open normally.
    ================================================= */

    const sideLinks =
        document.querySelectorAll(".side-link");


    sideLinks.forEach(link => {

        link.addEventListener("click", () => {

            /* Close mobile sidebar */

            if (
                window.innerWidth <= 800 &&
                sidebar
            ) {

                sidebar.classList.remove("open");

            }

            /*
             IMPORTANT:
             Don't use event.preventDefault().
             The browser will follow href normally.
            */

        });

    });



    /* =================================================
       MOBILE SIDEBAR
    ================================================= */

    if (mobileMenu && sidebar) {

        mobileMenu.addEventListener(
            "click",
            () => {

                sidebar.classList.toggle("open");

            }
        );

    }



    /* =================================================
       CLOSE MOBILE SIDEBAR WHEN CLICKING OUTSIDE
    ================================================= */

    document.addEventListener(
        "click",
        event => {

            if (
                window.innerWidth <= 800 &&
                sidebar &&
                mobileMenu &&
                sidebar.classList.contains("open")
            ) {

                if (
                    !sidebar.contains(event.target) &&
                    !mobileMenu.contains(event.target)
                ) {

                    sidebar.classList.remove("open");

                }

            }

        }
    );



    /* =================================================
       SEARCH
    ================================================= */

    function openSearch() {

        if (!searchOverlay) return;

        searchOverlay.classList.add("active");


        setTimeout(() => {

            if (searchInput) {
                searchInput.focus();
            }

        }, 100);

    }


    function hideSearch() {

        if (!searchOverlay) return;

        searchOverlay.classList.remove("active");


        if (searchInput) {
            searchInput.value = "";
        }


        /* Show all classes again */

        document
            .querySelectorAll(".class-item")
            .forEach(item => {

                item.style.display = "";

            });

    }


    if (searchButton) {

        searchButton.addEventListener(
            "click",
            openSearch
        );

    }


    if (closeSearch) {

        closeSearch.addEventListener(
            "click",
            hideSearch
        );

    }


    if (searchOverlay) {

        searchOverlay.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    searchOverlay
                ) {

                    hideSearch();

                }

            }
        );

    }



    /* =================================================
       ESCAPE KEY
    ================================================= */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape" &&
                searchOverlay &&
                searchOverlay.classList.contains(
                    "active"
                )
            ) {

                hideSearch();

            }

        }
    );



    /* =================================================
       SEARCH FILTER
    ================================================= */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                const query =
                    searchInput.value
                        .toLowerCase()
                        .trim();


                const classes =
                    document.querySelectorAll(
                        ".class-item"
                    );


                classes.forEach(item => {

                    const text =
                        item.textContent
                            .toLowerCase();


                    if (
                        query === "" ||
                        text.includes(query)
                    ) {

                        item.style.display = "";

                    } else {

                        item.style.display =
                            "none";

                    }

                });

            }
        );

    }



    /* =================================================
       CREATE NEW CLASS
    ================================================= */

    const createClassBtn =
        document.getElementById(
            "createClassBtn"
        );


    if (createClassBtn) {

        createClassBtn.addEventListener(
            "click",
            () => {

                showToast(
                    "Opening class creation..."
                );

            }
        );

    }



    /* =================================================
       SIDEBAR CREATE CLASS
    ================================================= */

    const smallCreate =
        document.querySelector(
            ".small-create-btn"
        );


    if (smallCreate) {

        smallCreate.addEventListener(
            "click",
            () => {

                showToast(
                    "Let's create your new class!"
                );

            }
        );

    }



    /* =================================================
       JOIN SESSION BUTTONS
    ================================================= */

    document
        .querySelectorAll(".join-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const oldText =
                        button.textContent;


                    button.textContent =
                        "Joined";


                    button.style.background =
                        "rgba(34,197,94,.2)";


                    button.style.color =
                        "#4ade80";


                    showToast(
                        "Session joined successfully!"
                    );


                    setTimeout(() => {

                        button.textContent =
                            oldText;

                        button.style.background =
                            "";

                        button.style.color =
                            "";

                    }, 2200);

                }
            );

        });



    /* =================================================
       CLASS MORE BUTTON
    ================================================= */

    document
        .querySelectorAll(".more-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    showToast(
                        "Class options opened"
                    );

                }
            );

        });



    /* =================================================
       VIEW ALL CLASSES
    ================================================= */

    const viewClasses =
        document.querySelector(
            ".ghost-btn"
        );


    if (viewClasses) {

        viewClasses.addEventListener(
            "click",
            () => {

                showToast(
                    "Showing all classes..."
                );

            }
        );

    }



    /* =================================================
       THEME SWITCHER
    ================================================= */

    const themeButton =
        document.querySelector(
            ".theme-btn"
        );


    let lightMode = false;


    if (themeButton) {

        themeButton.addEventListener(
            "click",
            () => {

                lightMode = !lightMode;


                if (lightMode) {

                    document.body.style.setProperty(
                        "--bg",
                        "#f4f5fb"
                    );

                    document.body.style.setProperty(
                        "--text",
                        "#161824"
                    );

                    document.body.style.setProperty(
                        "--muted",
                        "#697083"
                    );

                    document.body.style.setProperty(
                        "--panel",
                        "rgba(255,255,255,.85)"
                    );


                    themeButton.innerHTML =
                        `<i data-lucide="sun"></i>`;


                    showToast(
                        "Light mode enabled"
                    );

                } else {

                    document.body.style.setProperty(
                        "--bg",
                        "#030713"
                    );

                    document.body.style.setProperty(
                        "--text",
                        "#f5f7ff"
                    );

                    document.body.style.setProperty(
                        "--muted",
                        "#8d93a8"
                    );

                    document.body.style.setProperty(
                        "--panel",
                        "rgba(10,17,38,.78)"
                    );


                    themeButton.innerHTML =
                        `<i data-lucide="moon"></i>`;


                    showToast(
                        "Dark mode enabled"
                    );

                }


                if (typeof lucide !== "undefined") {
                    lucide.createIcons();
                }

            }
        );

    }



    /* =================================================
       PERIOD SELECT
    ================================================= */

    const periodSelect =
        document.getElementById(
            "periodSelect"
        );


    if (periodSelect) {

        periodSelect.addEventListener(
            "change",
            () => {

                showToast(
                    `Showing ${periodSelect.value.toLowerCase()} data`
                );

            }
        );

    }



    /* =================================================
       PROFILE
    ================================================= */

    const profile =
        document.querySelector(".profile");


    if (profile) {

        profile.addEventListener(
            "click",
            () => {

                showToast(
                    "Profile menu opened"
                );

            }
        );

    }



    /* =================================================
       RESOURCE ITEMS
    ================================================= */

    document
        .querySelectorAll(".resource")
        .forEach(resource => {

            resource.addEventListener(
                "click",
                () => {

                    const titleElement =
                        resource.querySelector(
                            "strong"
                        );


                    if (!titleElement) return;


                    const title =
                        titleElement.textContent;


                    showToast(
                        `${title} opened`
                    );

                }
            );

        });



    /* =================================================
       TOP NAVIGATION
       
       IMPORTANT:
       Only show notification here.
       Don't prevent normal links.
    ================================================= */

    document
        .querySelectorAll(".top-nav a")
        .forEach(link => {

            link.addEventListener(
                "click",
                () => {

                    /*
                    Do NOT use:
                    event.preventDefault();

                    If href contains a real page,
                    browser will navigate normally.
                    */

                }
            );

        });



    /* =================================================
       3D STAT CARD HOVER
    ================================================= */

    document
        .querySelectorAll(".stat-card")
        .forEach(card => {


            card.addEventListener(
                "mousemove",
                event => {

                    /*
                    Disable 3D effect on small
                    touch/mobile screens.
                    */

                    if (
                        window.innerWidth <= 800
                    ) {
                        return;
                    }


                    const rect =
                        card.getBoundingClientRect();


                    const x =
                        event.clientX -
                        rect.left;


                    const y =
                        event.clientY -
                        rect.top;


                    const rotateX =
                        ((y / rect.height) - 0.5) * -4;


                    const rotateY =
                        ((x / rect.width) - 0.5) * 4;


                    card.style.transform =
                        `
                        translateY(-5px)
                        rotateX(${rotateX}deg)
                        rotateY(${rotateY}deg)
                        `;

                }
            );


            card.addEventListener(
                "mouseleave",
                () => {

                    card.style.transform = "";

                }
            );

        });



    /* =================================================
       RIPPLE EFFECT
    ================================================= */

    document
        .querySelectorAll(
            ".create-btn, .join-btn, .small-create-btn"
        )
        .forEach(button => {


            button.addEventListener(
                "click",
                function (event) {

                    const ripple =
                        document.createElement(
                            "span"
                        );


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

                    ripple.style.position =
                        "absolute";

                    ripple.style.borderRadius =
                        "50%";

                    ripple.style.background =
                        "rgba(255,255,255,.18)";

                    ripple.style.pointerEvents =
                        "none";


                    ripple.style.left =
                        `
                        ${event.clientX -
                        rect.left -
                        size / 2
                        }px
                        `;


                    ripple.style.top =
                        `
                        ${event.clientY -
                        rect.top -
                        size / 2
                        }px
                        `;


                    ripple.style.transform =
                        "scale(0)";


                    ripple.style.animation =
                        "ripple .6s ease-out";


                    this.style.position =
                        "relative";


                    this.style.overflow =
                        "hidden";


                    this.appendChild(ripple);


                    setTimeout(() => {

                        ripple.remove();

                    }, 600);

                }
            );

        });



    /* =================================================
       ADD RIPPLE ANIMATION
    ================================================= */

    if (
        !document.getElementById(
            "ripple-animation"
        )
    ) {

        const rippleStyle =
            document.createElement("style");


        rippleStyle.id =
            "ripple-animation";


        rippleStyle.textContent = `
            @keyframes ripple {

                to {
                    transform: scale(2);
                    opacity: 0;
                }

            }
        `;


        document.head.appendChild(
            rippleStyle
        );

    }



    /* =================================================
       WINDOW RESIZE
    ================================================= */

    window.addEventListener(
        "resize",
        () => {

            /*
            Automatically close mobile
            sidebar when returning to desktop.
            */

            if (
                window.innerWidth > 800 &&
                sidebar
            ) {

                sidebar.classList.remove(
                    "open"
                );

            }

        }
    );



    /* =================================================
       PAGE LOADED
    ================================================= */

    console.log(
        "SkillShare My Teaching dashboard loaded successfully."
    );

});