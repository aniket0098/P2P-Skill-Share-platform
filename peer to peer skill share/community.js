/* =========================================================
   SKILLSHARE COMMUNITY PAGE
   Advanced Interactive JavaScript
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
       ===================================================== */

    const body = document.body;

    const searchInput =
        document.querySelector(".community-search input") ||
        document.querySelector("#communitySearch") ||
        document.querySelector('input[placeholder*="Search"]');

    const discussionItems =
        document.querySelectorAll(".discussion-item");

    const filterButtons =
        document.querySelectorAll(".filter-btn, .category-btn");

    const modalOverlay =
        document.querySelector(".modal-overlay");

    const createPostBtn =
        document.querySelector("#createPostBtn") ||
        document.querySelector(".create-post-btn");

    const startDiscussionBtn =
        document.querySelector("#startDiscussionBtn") ||
        document.querySelector(".start-discussion-btn");

    const closeModalButtons =
        document.querySelectorAll(".close-modal");

    const themeButton =
        document.querySelector("#themeToggle") ||
        document.querySelector(".theme-toggle");

    const notificationButton =
        document.querySelector("#notificationBtn") ||
        document.querySelector(".notification-btn");

    const scrollTopButton =
        document.querySelector("#scrollTop") ||
        document.querySelector(".scroll-top");


    /* =====================================================
       SCROLL REVEAL
       ===================================================== */

    const revealElements = document.querySelectorAll(
        ".reveal, " +
        ".discussion-card, " +
        ".stat-card, " +
        ".side-card, " +
        ".event-card, " +
        ".contributor-card"
    );

    revealElements.forEach((element, index) => {

        element.style.opacity = "0";
        element.style.transform = "translateY(35px)";
        element.style.transition =
            "opacity .7s ease, transform .7s cubic-bezier(.2,.8,.2,1)";

        element.style.transitionDelay =
            `${Math.min(index * 0.04, 0.35)}s`;
    });


    const revealObserver = new IntersectionObserver(
        (entries, observer) => {

            entries.forEach(entry => {

                if (!entry.isIntersecting) return;

                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";

                observer.unobserve(entry.target);
            });

        },
        {
            threshold: 0.12,
            rootMargin: "0px 0px -40px 0px"
        }
    );


    revealElements.forEach(element => {
        revealObserver.observe(element);
    });


    /* =====================================================
       3D CARD TILT
       ===================================================== */

    const tiltCards = document.querySelectorAll(
        ".discussion-card, " +
        ".stat-card, " +
        ".event-card, " +
        ".contributor-card, " +
        ".community-card"
    );


    tiltCards.forEach(card => {

        card.addEventListener("mousemove", event => {

            const rect = card.getBoundingClientRect();

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
                `perspective(900px)
                 rotateX(${rotateX}deg)
                 rotateY(${rotateY}deg)
                 translateY(-5px)`;
        });


        card.addEventListener("mouseleave", () => {

            card.style.transform =
                "perspective(900px) rotateX(0) rotateY(0) translateY(0)";
        });

    });


    /* =====================================================
       MOUSE FOLLOWING GLOW
       ===================================================== */

    const glow = document.createElement("div");

    glow.className = "mouse-glow";

    glow.style.cssText = `
        position: fixed;
        width: 320px;
        height: 320px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 0;
        background: radial-gradient(
            circle,
            rgba(124,58,237,.13) 0%,
            rgba(59,130,246,.06) 35%,
            transparent 70%
        );
        transform: translate(-50%, -50%);
        left: 50%;
        top: 50%;
        transition: left .08s linear, top .08s linear;
    `;

    body.appendChild(glow);


    document.addEventListener("mousemove", event => {

        glow.style.left = `${event.clientX}px`;
        glow.style.top = `${event.clientY}px`;

    });


    /* =====================================================
       SEARCH
       ===================================================== */

    if (searchInput) {

        searchInput.addEventListener("input", () => {

            const query =
                searchInput.value
                    .toLowerCase()
                    .trim();


            discussionItems.forEach(item => {

                const text =
                    item.textContent.toLowerCase();

                if (text.includes(query)) {

                    item.style.display = "";

                    requestAnimationFrame(() => {
                        item.style.opacity = "1";
                        item.style.transform = "translateY(0)";
                    });

                } else {

                    item.style.opacity = "0";
                    item.style.transform = "scale(.97)";

                    setTimeout(() => {

                        if (
                            !item.textContent
                                .toLowerCase()
                                .includes(query)
                        ) {
                            item.style.display = "none";
                        }

                    }, 250);
                }

            });

        });

    }


    /* =====================================================
       DISCUSSION FILTERS
       ===================================================== */

    filterButtons.forEach(button => {

        button.addEventListener("click", () => {

            filterButtons.forEach(btn => {
                btn.classList.remove("active");
            });

            button.classList.add("active");

            const filter =
                button.dataset.filter ||
                button.textContent
                    .trim()
                    .toLowerCase();


            discussionItems.forEach(item => {

                const category =
                    item.dataset.category ||
                    item.textContent.toLowerCase();


                if (
                    filter === "all" ||
                    filter === "all discussions" ||
                    category.includes(filter)
                ) {

                    item.style.display = "flex";

                    setTimeout(() => {
                        item.style.opacity = "1";
                        item.style.transform = "translateX(0)";
                    }, 20);

                } else {

                    item.style.opacity = "0";
                    item.style.transform = "translateX(-15px)";

                    setTimeout(() => {
                        item.style.display = "none";
                    }, 250);

                }

            });

        });

    });


    /* =====================================================
       RIPPLE EFFECT
       ===================================================== */

    const rippleButtons = document.querySelectorAll(
        "button, .btn, .primary-btn, .secondary-btn"
    );


    rippleButtons.forEach(button => {

        button.addEventListener("click", event => {

            const ripple =
                document.createElement("span");

            ripple.className = "ripple";

            const rect =
                button.getBoundingClientRect();

            ripple.style.left =
                `${event.clientX - rect.left}px`;

            ripple.style.top =
                `${event.clientY - rect.top}px`;

            button.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 700);

        });

    });


    /* =====================================================
       ANIMATED COUNTERS
       ===================================================== */

    const counters =
        document.querySelectorAll("[data-count]");


    function animateCounter(counter) {

        const target =
            parseFloat(counter.dataset.count);

        const suffix =
            counter.dataset.suffix || "";

        const duration = 1500;

        const startTime =
            performance.now();


        function update(currentTime) {

            const progress =
                Math.min(
                    (currentTime - startTime) / duration,
                    1
                );


            const eased =
                1 - Math.pow(1 - progress, 3);

            const value =
                target * eased;


            if (target >= 1000) {

                counter.textContent =
                    formatNumber(value) + suffix;

            } else {

                counter.textContent =
                    Math.floor(value) + suffix;
            }


            if (progress < 1) {

                requestAnimationFrame(update);

            } else {

                counter.textContent =
                    formatNumber(target) + suffix;
            }
        }


        requestAnimationFrame(update);
    }


    function formatNumber(number) {

        if (number >= 1000000) {
            return (number / 1000000)
                .toFixed(1)
                .replace(".0", "") + "M";
        }

        if (number >= 1000) {
            return (number / 1000)
                .toFixed(1)
                .replace(".0", "") + "K";
        }

        return Math.floor(number);
    }


    const counterObserver =
        new IntersectionObserver(
            entries => {

                entries.forEach(entry => {

                    if (!entry.isIntersecting) return;

                    animateCounter(entry.target);

                    counterObserver.unobserve(
                        entry.target
                    );

                });

            },
            {
                threshold: 0.7
            }
        );


    counters.forEach(counter => {
        counterObserver.observe(counter);
    });


    /* =====================================================
       LIKE / UPVOTE SYSTEM
       ===================================================== */

    document
        .querySelectorAll(
            ".like-btn, .upvote-btn, .heart-btn"
        )
        .forEach(button => {

            button.addEventListener("click", event => {

                event.stopPropagation();

                button.classList.toggle("liked");


                let countElement =
                    button.querySelector(".count");


                if (!countElement) {

                    countElement =
                        button.parentElement
                            ?.querySelector(".count");
                }


                if (countElement) {

                    let count =
                        parseInt(
                            countElement.textContent
                        ) || 0;


                    if (button.classList.contains("liked")) {

                        count++;

                    } else {

                        count--;
                    }


                    countElement.textContent =
                        count;
                }


                createHeartEffect(button);

            });

        });


    function createHeartEffect(button) {

        const heart =
            document.createElement("span");

        heart.innerHTML = "♥";

        heart.style.cssText = `
            position:absolute;
            pointer-events:none;
            font-size:22px;
            color:#ec4899;
            animation:heartFloat .8s ease forwards;
            z-index:999;
        `;


        const rect =
            button.getBoundingClientRect();

        heart.style.left =
            `${rect.left + rect.width / 2}px`;

        heart.style.top =
            `${rect.top}px`;


        document.body.appendChild(heart);


        setTimeout(() => {
            heart.remove();
        }, 800);
    }


    /* =====================================================
       MODAL SYSTEM
       ===================================================== */

    function openModal(type = "post") {

        if (!modalOverlay) return;

        modalOverlay.classList.add("active");

        body.classList.add("modal-open");


        const title =
            modalOverlay.querySelector(".modal-title");

        if (title) {

            title.textContent =
                type === "discussion"
                    ? "Start a Discussion"
                    : "Create a Post";
        }


        const textarea =
            modalOverlay.querySelector("textarea");

        if (textarea) {
            textarea.focus();
        }

    }


    function closeModal() {

        if (!modalOverlay) return;

        modalOverlay.classList.remove("active");

        body.classList.remove("modal-open");
    }


    if (createPostBtn) {

        createPostBtn.addEventListener(
            "click",
            () => openModal("post")
        );
    }


    if (startDiscussionBtn) {

        startDiscussionBtn.addEventListener(
            "click",
            () => openModal("discussion")
        );
    }


    closeModalButtons.forEach(button => {

        button.addEventListener(
            "click",
            closeModal
        );

    });


    if (modalOverlay) {

        modalOverlay.addEventListener(
            "click",
            event => {

                if (
                    event.target === modalOverlay
                ) {
                    closeModal();
                }

            }
        );

    }


    document.addEventListener(
        "keydown",
        event => {

            if (event.key === "Escape") {
                closeModal();
            }

        }
    );


    /* =====================================================
       CREATE POST FORM
       ===================================================== */

    const postForm =
        document.querySelector("#postForm") ||
        document.querySelector(".post-form");


    if (postForm) {

        postForm.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                const textarea =
                    postForm.querySelector("textarea");

                if (
                    textarea &&
                    textarea.value.trim() === ""
                ) {

                    textarea.classList.add("shake");

                    setTimeout(() => {
                        textarea.classList.remove("shake");
                    }, 500);

                    return;
                }


                showToast(
                    "🎉 Your post has been published!"
                );


                postForm.reset();

                closeModal();

            }
        );

    }


    /* =====================================================
       TOAST NOTIFICATION
       ===================================================== */

    function showToast(message) {

        const toast =
            document.createElement("div");

        toast.className = "community-toast";

        toast.innerHTML = `
            <span>${message}</span>
            <button aria-label="Close">×</button>
        `;


        toast.style.cssText = `
            position:fixed;
            right:25px;
            bottom:25px;
            z-index:10000;
            display:flex;
            align-items:center;
            gap:18px;
            padding:16px 20px;
            border:1px solid rgba(139,92,246,.35);
            border-radius:14px;
            background:rgba(10,10,30,.92);
            backdrop-filter:blur(18px);
            color:white;
            box-shadow:0 20px 60px rgba(0,0,0,.4);
            animation:toastIn .45s ease forwards;
        `;


        toast
            .querySelector("button")
            .addEventListener(
                "click",
                () => toast.remove()
            );


        document.body.appendChild(toast);


        setTimeout(() => {

            toast.style.animation =
                "toastOut .4s ease forwards";

            setTimeout(
                () => toast.remove(),
                400
            );

        }, 3500);

    }


    /* =====================================================
       NOTIFICATION EFFECT
       ===================================================== */

    if (notificationButton) {

        notificationButton.addEventListener(
            "click",
            () => {

                notificationButton.classList.add(
                    "notification-shake"
                );


                showToast(
                    "🔔 You're all caught up!"
                );


                setTimeout(() => {

                    notificationButton.classList.remove(
                        "notification-shake"
                    );

                }, 600);

            }
        );

    }


    /* =====================================================
       THEME TOGGLE
       ===================================================== */

    if (themeButton) {

        themeButton.addEventListener(
            "click",
            () => {

                body.classList.toggle("light-mode");

                const isLight =
                    body.classList.contains(
                        "light-mode"
                    );


                localStorage.setItem(
                    "skillshare-theme",
                    isLight
                        ? "light"
                        : "dark"
                );


                showToast(
                    isLight
                        ? "☀️ Light mode enabled"
                        : "🌙 Dark mode enabled"
                );

            }
        );

    }


    const savedTheme =
        localStorage.getItem(
            "skillshare-theme"
        );


    if (savedTheme === "light") {

        body.classList.add("light-mode");
    }


    /* =====================================================
       SCROLL TO TOP
       ===================================================== */

    if (scrollTopButton) {

        window.addEventListener(
            "scroll",
            () => {

                if (window.scrollY > 500) {

                    scrollTopButton.classList.add(
                        "show"
                    );

                } else {

                    scrollTopButton.classList.remove(
                        "show"
                    );

                }

            }
        );


        scrollTopButton.addEventListener(
            "click",
            () => {

                window.scrollTo({
                    top: 0,
                    behavior: "smooth"
                });

            }
        );

    }


    /* =====================================================
       PARALLAX HERO
       ===================================================== */

    const heroVisual =
        document.querySelector(".community-hero-visual");


    if (heroVisual) {

        window.addEventListener(
            "scroll",
            () => {

                const scroll =
                    window.scrollY;

                heroVisual.style.transform =
                    `translateY(${scroll * 0.12}px)`;

            },
            {
                passive: true
            }
        );

    }


    /* =====================================================
       ACTIVE NAVIGATION
       ===================================================== */

    const navLinks =
        document.querySelectorAll(
            ".nav-link, .sidebar-link"
        );


    navLinks.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                navLinks.forEach(item => {
                    item.classList.remove("active");
                });

                link.classList.add("active");

            }
        );

    });


    /* =====================================================
       SIDEBAR MOBILE
       ===================================================== */

    const menuButton =
        document.querySelector(
            ".mobile-menu-btn"
        );

    const sidebar =
        document.querySelector(
            ".sidebar"
        );


    if (menuButton && sidebar) {

        menuButton.addEventListener(
            "click",
            () => {

                sidebar.classList.toggle(
                    "mobile-open"
                );

            }
        );

    }


    /* =====================================================
       EVENT CARD CLICK
       ===================================================== */

    document
        .querySelectorAll(".event-card")
        .forEach(card => {

            card.addEventListener(
                "click",
                () => {

                    card.classList.add(
                        "event-selected"
                    );


                    showToast(
                        "📅 Event selected!"
                    );

                }
            );

        });


    /* =====================================================
       DISCUSSION CARD CLICK
       ===================================================== */

    discussionItems.forEach(item => {

        item.addEventListener(
            "click",
            event => {

                if (
                    event.target.closest(
                        "button"
                    )
                ) return;


                item.classList.add(
                    "discussion-open"
                );


                setTimeout(() => {

                    item.classList.remove(
                        "discussion-open"
                    );

                }, 500);

            }
        );

    });


    /* =====================================================
       NAVBAR SCROLL EFFECT
       ===================================================== */

    const navbar =
        document.querySelector(
            ".navbar"
        ) ||
        document.querySelector(
            "header"
        );


    if (navbar) {

        window.addEventListener(
            "scroll",
            () => {

                if (window.scrollY > 30) {

                    navbar.classList.add(
                        "navbar-scrolled"
                    );

                } else {

                    navbar.classList.remove(
                        "navbar-scrolled"
                    );

                }

            },
            {
                passive: true
            }
        );

    }


    /* =====================================================
       IMAGE LAZY LOAD EFFECT
       ===================================================== */

    const images =
        document.querySelectorAll(
            "img"
        );


    images.forEach(img => {

        img.style.opacity = "0";

        img.style.transition =
            "opacity .6s ease";


        if (img.complete) {

            img.style.opacity = "1";

        } else {

            img.addEventListener(
                "load",
                () => {
                    img.style.opacity = "1";
                }
            );

        }

    });


    /* =====================================================
       RANDOM PARTICLES
       ===================================================== */

    const particleContainer =
        document.querySelector(
            ".particles"
        );


    if (particleContainer) {

        for (let i = 0; i < 30; i++) {

            const particle =
                document.createElement("span");

            particle.className =
                "floating-particle";


            particle.style.left =
                `${Math.random() * 100}%`;

            particle.style.top =
                `${Math.random() * 100}%`;

            particle.style.animationDelay =
                `${Math.random() * 5}s`;

            particle.style.animationDuration =
                `${4 + Math.random() * 6}s`;


            particleContainer.appendChild(
                particle
            );

        }

    }


    /* =====================================================
       KEYBOARD SHORTCUT
       ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            // CTRL + K focuses search
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();

                if (searchInput) {

                    searchInput.focus();

                    searchInput.select();
                }

            }

        }
    );


    /* =====================================================
       PAGE LOADED
       ===================================================== */

    setTimeout(() => {

        body.classList.add(
            "page-loaded"
        );

    }, 100);


});