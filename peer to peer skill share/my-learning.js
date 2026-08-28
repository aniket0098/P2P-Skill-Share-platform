/* =========================================================
   SKILLSHARE — MY LEARNING JAVASCRIPT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
    ===================================================== */

    const toast = document.getElementById("toast");
    const cursor = document.querySelector(".cursor");

    /* =====================================================
       TOAST SYSTEM
    ===================================================== */

    function showToast(message, duration = 2600) {

        if (!toast) return;

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(window.toastTimer);

        window.toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, duration);
    }

    window.showToast = showToast;


    /* =====================================================
       CURSOR GLOW
    ===================================================== */

    if (cursor && window.matchMedia("(pointer: fine)").matches) {

        let mouseX = 0;
        let mouseY = 0;

        let currentX = 0;
        let currentY = 0;

        document.addEventListener("mousemove", (event) => {
            mouseX = event.clientX;
            mouseY = event.clientY;
        });

        function animateCursor() {

            currentX += (mouseX - currentX) * 0.12;
            currentY += (mouseY - currentY) * 0.12;

            cursor.style.left = `${currentX}px`;
            cursor.style.top = `${currentY}px`;

            requestAnimationFrame(animateCursor);
        }

        animateCursor();
    }


    /* =====================================================
       SCROLL REVEAL
    ===================================================== */

    const revealElements = document.querySelectorAll(
        ".panel, .course, .completed article, .sessions article, .achievements"
    );

    revealElements.forEach((element, index) => {

        element.classList.add("reveal");

        element.style.transitionDelay =
            `${Math.min(index * 35, 250)}ms`;
    });


    const revealObserver = new IntersectionObserver(
        (entries, observer) => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("visible");

                    observer.unobserve(entry.target);
                }

            });

        },
        {
            threshold: 0.08
        }
    );


    revealElements.forEach(element => {
        revealObserver.observe(element);
    });


    /* =====================================================
       ACTIVE SIDEBAR NAVIGATION
    ===================================================== */

    const sideLinks = document.querySelectorAll(".side a");

    sideLinks.forEach(link => {

        link.addEventListener("click", function () {

            sideLinks.forEach(item => {
                item.classList.remove("active");
            });

            this.classList.add("active");

        });

    });


    /* =====================================================
       BUTTON RIPPLE EFFECT
    ===================================================== */

    document.querySelectorAll(".btn").forEach(button => {

        button.addEventListener("click", function (event) {

            const ripple = document.createElement("span");

            const rect = this.getBoundingClientRect();

            const size = Math.max(
                rect.width,
                rect.height
            );

            ripple.style.position = "absolute";
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;

            ripple.style.left =
                `${event.clientX - rect.left - size / 2}px`;

            ripple.style.top =
                `${event.clientY - rect.top - size / 2}px`;

            ripple.style.borderRadius = "50%";

            ripple.style.background =
                "rgba(255,255,255,0.22)";

            ripple.style.transform = "scale(0)";

            ripple.style.pointerEvents = "none";

            ripple.style.animation =
                "buttonRipple 0.65s ease-out";

            this.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 700);

        });

    });


    /* =====================================================
       ADD RIPPLE ANIMATION
    ===================================================== */

    const rippleStyle = document.createElement("style");

    rippleStyle.textContent = `
        @keyframes buttonRipple {
            to {
                transform: scale(2.8);
                opacity: 0;
            }
        }
    `;

    document.head.appendChild(rippleStyle);


    /* =====================================================
       PROGRESS BAR ANIMATION
    ===================================================== */

    const progressBars =
        document.querySelectorAll(".bar span");

    progressBars.forEach(bar => {

        const targetWidth =
            bar.dataset.progress ||
            bar.style.width ||
            "50%";

        bar.style.width = "0%";

        requestAnimationFrame(() => {

            setTimeout(() => {
                bar.style.width = targetWidth;
            }, 250);

        });

    });


    /* =====================================================
       XP BAR
    ===================================================== */

    const xpBar = document.querySelector(".xp span");

    if (xpBar) {

        const target =
            xpBar.dataset.progress || "82%";

        xpBar.style.width = "0%";

        setTimeout(() => {

            xpBar.style.transition =
                "width 1.4s cubic-bezier(.2,.8,.2,1)";

            xpBar.style.width = target;

        }, 500);
    }


    /* =====================================================
       NUMBER COUNTER ANIMATION
    ===================================================== */

    function animateNumber(element, target, duration = 1000) {

        if (!element) return;

        const startTime = performance.now();

        function update(currentTime) {

            const elapsed =
                currentTime - startTime;

            const progress =
                Math.min(elapsed / duration, 1);

            const eased =
                1 - Math.pow(1 - progress, 3);

            const value =
                Math.floor(target * eased);

            element.textContent = value;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                element.textContent = target;
            }
        }

        requestAnimationFrame(update);
    }


    /* =====================================================
       STAT COUNTERS
    ===================================================== */

    const metricNumbers =
        document.querySelectorAll(".metric b");

    metricNumbers.forEach(element => {

        const value =
            parseInt(element.textContent);

        if (!isNaN(value)) {

            element.textContent = "0";

            setTimeout(() => {
                animateNumber(element, value);
            }, 500);

        }

    });


    /* =====================================================
       STREAK COUNTER
    ===================================================== */

    const streakNumber =
        document.querySelector(".streak strong");

    if (streakNumber) {

        const value =
            parseInt(streakNumber.textContent);

        if (!isNaN(value)) {

            streakNumber.textContent = "0";

            setTimeout(() => {

                animateNumber(
                    streakNumber,
                    value,
                    900
                );

            }, 650);
        }
    }


    /* =====================================================
       COURSE CONTINUE BUTTONS
    ===================================================== */

    document.querySelectorAll(".course .btn")
        .forEach(button => {

            button.addEventListener("click", event => {

                event.preventDefault();

                const course =
                    button
                        .closest(".course")
                        ?.querySelector("strong")
                        ?.textContent ||
                    "your course";

                showToast(
                    `▶ Continuing "${course}"...`
                );

            });

        });


    /* =====================================================
       BROWSE NEW SKILLS
    ===================================================== */

    document.querySelectorAll(
        "[data-action='browse'], .browse-btn"
    ).forEach(button => {

        button.addEventListener("click", () => {

            showToast(
                "✨ Opening the skill marketplace..."
            );

        });

    });


    /* =====================================================
       SESSION JOIN BUTTONS
    ===================================================== */

    document.querySelectorAll(
        ".sessions .btn"
    ).forEach(button => {

        button.addEventListener("click", event => {

            event.preventDefault();

            const session =
                button
                    .closest("article")
                    ?.querySelector("b")
                    ?.textContent ||
                "session";

            showToast(
                `✓ You're joining "${session}"`
            );

            button.textContent = "Joined";

            button.style.background =
                "linear-gradient(135deg,#19b984,#26d69b)";

            button.disabled = true;

        });

    });


    /* =====================================================
       VIEW ALL LINKS
    ===================================================== */

    document.querySelectorAll(
        ".sectionhead a, .panel > a"
    ).forEach(link => {

        link.addEventListener("click", event => {

            const href =
                link.getAttribute("href");

            if (!href || href === "#") {

                event.preventDefault();

                showToast(
                    "📚 More learning content coming soon."
                );

            }

        });

    });


    /* =====================================================
       COURSE MENU
    ===================================================== */

    document.querySelectorAll(".course > i")
        .forEach(menu => {

            menu.addEventListener("click", () => {

                const course =
                    menu
                        .closest(".course")
                        ?.querySelector("strong")
                        ?.textContent ||
                    "Course";

                showToast(
                    `⚙ Options for ${course}`
                );

            });

        });


    /* =====================================================
       COMPLETED COURSE HOVER
    ===================================================== */

    document.querySelectorAll(
        ".completed article"
    ).forEach(card => {

        card.addEventListener("click", () => {

            const title =
                card.querySelector("b")
                    ?.textContent ||
                "Completed course";

            showToast(
                `🏆 ${title} — completed!`
            );

        });

    });


    /* =====================================================
       ACHIEVEMENT INTERACTIONS
    ===================================================== */

    document.querySelectorAll(
        ".ach div"
    ).forEach(achievement => {

        achievement.addEventListener(
            "click",
            () => {

                const title =
                    achievement.querySelector("b")
                        ?.textContent ||
                    "Achievement";

                showToast(
                    `🏆 ${title} achievement`
                );

            }
        );

    });


    /* =====================================================
       DAYS / STREAK
    ===================================================== */

    document.querySelectorAll(".days > *")
        .forEach(day => {

            day.addEventListener("click", () => {

                if (!day.classList.contains("active")) {

                    day.classList.add("active");

                    day.style.background =
                        "linear-gradient(135deg,#7130ff,#a247ff)";

                    day.style.color = "#fff";

                }

            });

        });


    /* =====================================================
       CARD 3D TILT EFFECT
    ===================================================== */

    const tiltCards = document.querySelectorAll(
        ".panel, .completed article"
    );

    tiltCards.forEach(card => {

        card.addEventListener("mousemove", event => {

            if (window.innerWidth < 900) return;

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
                ((y - centerY) / centerY) * -1.5;

            const rotateY =
                ((x - centerX) / centerX) * 1.5;

            card.style.transform =
                `perspective(900px)
                 rotateX(${rotateX}deg)
                 rotateY(${rotateY}deg)
                 translateY(-2px)`;

        });

        card.addEventListener("mouseleave", () => {

            card.style.transform = "";

        });

    });


    /* =====================================================
       HEADER SCROLL EFFECT
    ===================================================== */

    const topbar =
        document.querySelector(".topbar");

    window.addEventListener(
        "scroll",
        () => {

            if (!topbar) return;

            if (window.scrollY > 30) {

                topbar.style.background =
                    "rgba(4,8,25,0.94)";

                topbar.style.boxShadow =
                    "0 12px 35px rgba(0,0,0,0.25)";

            } else {

                topbar.style.background =
                    "rgba(4,8,25,0.84)";

                topbar.style.boxShadow =
                    "none";

            }

        },
        {
            passive: true
        }
    );


    /* =====================================================
       SMOOTH INTERNAL LINKS
    ===================================================== */

    document.querySelectorAll(
        'a[href^="#"]'
    ).forEach(link => {

        link.addEventListener("click", event => {

            const targetId =
                link.getAttribute("href");

            if (
                targetId &&
                targetId !== "#"
            ) {

                const target =
                    document.querySelector(targetId);

                if (target) {

                    event.preventDefault();

                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });

                }

            }

        });

    });


    /* =====================================================
       PAGE LOADED
    ===================================================== */

    setTimeout(() => {

        document.body.classList.add(
            "page-loaded"
        );

    }, 100);


    console.log(
        "%cSkillShare My Learning Loaded ✓",
        "color:#9b5cff;font-size:14px;font-weight:bold;"
    );

});