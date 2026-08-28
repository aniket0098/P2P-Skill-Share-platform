/* =========================================================
   SKILLSHARE — HOW IT WORKS JS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       SCROLL REVEAL ANIMATION
       ===================================================== */

    const revealElements = document.querySelectorAll(".reveal");

    const revealObserver = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("visible");

                    // Optional: stop observing after animation
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
       STEP PROGRESS LINE
       ===================================================== */

    const steps = document.querySelector(".steps");

    if (steps) {

        const stepObserver = new IntersectionObserver(
            (entries) => {

                entries.forEach((entry) => {

                    if (entry.isIntersecting) {

                        setTimeout(() => {
                            steps.classList.add("ready");
                        }, 300);

                        stepObserver.unobserve(entry.target);
                    }

                });

            },
            {
                threshold: 0.25
            }
        );

        stepObserver.observe(steps);
    }


    /* =====================================================
       CURSOR GLOW
       ===================================================== */

    const cursorGlow =
        document.querySelector(".cursor-glow");

    if (cursorGlow) {

        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;

        let currentX = mouseX;
        let currentY = mouseY;

        window.addEventListener("pointermove", (event) => {

            mouseX = event.clientX;
            mouseY = event.clientY;

        });

        function animateCursor() {

            currentX += (mouseX - currentX) * 0.12;
            currentY += (mouseY - currentY) * 0.12;

            cursorGlow.style.left = `${currentX}px`;
            cursorGlow.style.top = `${currentY}px`;

            requestAnimationFrame(animateCursor);
        }

        animateCursor();
    }


    /* =====================================================
       NAVBAR SCROLL EFFECT
       ===================================================== */

    const navbar =
        document.querySelector(".topbar");

    function updateNavbar() {

        if (!navbar) return;

        if (window.scrollY > 20) {

            navbar.style.boxShadow =
                "0 12px 40px rgba(0, 0, 0, 0.28)";

        } else {

            navbar.style.boxShadow = "none";
        }
    }

    window.addEventListener(
        "scroll",
        updateNavbar,
        { passive: true }
    );

    updateNavbar();


    /* =====================================================
       ACTIVE NAVIGATION
       ===================================================== */

    const navLinks =
        document.querySelectorAll(".topbar nav a");

    navLinks.forEach((link) => {

        link.addEventListener("click", function () {

            navLinks.forEach((item) => {
                item.classList.remove("active");
            });

            this.classList.add("active");

        });

    });


    /* =====================================================
       STEP CARD MOUSE PARALLAX
       ===================================================== */

    const stepCards =
        document.querySelectorAll(".step-card");

    stepCards.forEach((card) => {

        card.addEventListener("mousemove", (event) => {

            const rect =
                card.getBoundingClientRect();

            const x =
                event.clientX - rect.left;

            const y =
                event.clientY - rect.top;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            const rotateX =
                ((y - centerY) / centerY) * -3;

            const rotateY =
                ((x - centerX) / centerX) * 3;

            card.style.transform =
                `translateY(-10px)
                 perspective(800px)
                 rotateX(${rotateX}deg)
                 rotateY(${rotateY}deg)`;

        });

        card.addEventListener("mouseleave", () => {

            card.style.transform =
                "translateY(0) perspective(800px) rotateX(0) rotateY(0)";

        });

    });


    /* =====================================================
       BUTTON RIPPLE EFFECT
       ===================================================== */

    const buttons =
        document.querySelectorAll(
            ".primary, .secondary, .icon-btn"
        );

    buttons.forEach((button) => {

        button.addEventListener("click", function (event) {

            const ripple =
                document.createElement("span");

            const rect =
                this.getBoundingClientRect();

            const size =
                Math.max(
                    rect.width,
                    rect.height
                );

            const x =
                event.clientX - rect.left - size / 2;

            const y =
                event.clientY - rect.top - size / 2;

            ripple.style.position = "absolute";
            ripple.style.width = `${size}px`;
            ripple.style.height = `${size}px`;
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            ripple.style.borderRadius = "50%";
            ripple.style.background =
                "rgba(255,255,255,0.25)";
            ripple.style.pointerEvents = "none";
            ripple.style.transform = "scale(0)";
            ripple.style.animation =
                "buttonRipple 0.6s ease-out";

            this.style.position = "relative";
            this.style.overflow = "hidden";

            this.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 600);

        });

    });


    /* =====================================================
       SMOOTH INTERNAL LINKS
       ===================================================== */

    document
        .querySelectorAll('a[href^="#"]')
        .forEach((link) => {

            link.addEventListener("click", (event) => {

                const targetId =
                    link.getAttribute("href");

                if (
                    !targetId ||
                    targetId === "#"
                ) {
                    return;
                }

                const target =
                    document.querySelector(targetId);

                if (!target) return;

                event.preventDefault();

                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            });

        });


    /* =====================================================
       TOAST SYSTEM
       ===================================================== */

    const toastElement =
        document.getElementById("toast");

    let toastTimer = null;

    window.toast = function (message) {

        if (!toastElement) return;

        toastElement.textContent = message;

        toastElement.classList.add("show");

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {

            toastElement.classList.remove("show");

        }, 2200);

    };


    /* =====================================================
       THEME BUTTON
       ===================================================== */

    const themeButton =
        document.getElementById("themeBtn");

    if (themeButton) {

        themeButton.addEventListener(
            "click",
            () => {

                document.body.classList.toggle("light");

                const lightMode =
                    document.body.classList.contains("light");

                themeButton.textContent =
                    lightMode ? "☀" : "☾";

                toast(
                    lightMode
                        ? "Light mode enabled"
                        : "Dark mode enabled"
                );

            }
        );

    }


    /* =====================================================
       STEP CARD CLICK
       ===================================================== */

    stepCards.forEach((card, index) => {

        card.addEventListener("click", () => {

            const stepNames = [
                "Discover Skills",
                "Connect",
                "Learn & Teach",
                "Review & Rate",
                "Grow Together"
            ];

            toast(
                `Step ${index + 1}: ${stepNames[index]}`
            );

        });

    });


    /* =====================================================
       BUTTON RIPPLE CSS
       ===================================================== */

    const rippleStyle =
        document.createElement("style");

    rippleStyle.textContent = `

        @keyframes buttonRipple {

            0% {
                transform: scale(0);
                opacity: 1;
            }

            100% {
                transform: scale(2.5);
                opacity: 0;
            }

        }

    `;

    document.head.appendChild(rippleStyle);


    /* =====================================================
       PAGE LOADED
       ===================================================== */

    setTimeout(() => {

        document.body.classList.add("page-loaded");

    }, 100);

});