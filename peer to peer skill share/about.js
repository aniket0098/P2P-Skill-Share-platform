/* =========================================================
   SKILLSHARE — NO BUGS
   ABOUT US PAGE JAVASCRIPT
   ========================================================= */


/* =========================================================
   1. SELECT ELEMENTS
   ========================================================= */

const navbar = document.getElementById("navbar");
const progressBar = document.querySelector(".scroll-progress");
const cursorGlow = document.querySelector(".cursor-glow");
const menuToggle = document.querySelector(".menu-toggle");



/* =========================================================
   2. NAVBAR SCROLL EFFECT
   ========================================================= */

window.addEventListener("scroll", () => {

    const scrollPosition = window.scrollY;

    /*
        Add "scrolled" class after
        user scrolls down.
    */

    if (scrollPosition > 30) {

        navbar.classList.add("scrolled");

    } else {

        navbar.classList.remove("scrolled");

    }


    /* =====================================
       SCROLL PROGRESS BAR
       ===================================== */

    const documentHeight =
        document.documentElement.scrollHeight -
        window.innerHeight;

    const scrollPercentage =
        documentHeight > 0
            ? (scrollPosition / documentHeight) * 100
            : 0;

    progressBar.style.width =
        `${scrollPercentage}%`;

});



/* =========================================================
   3. CURSOR GLOW
   ========================================================= */

if (cursorGlow) {

    window.addEventListener("pointermove", (event) => {

        cursorGlow.animate(

            {
                left: `${event.clientX}px`,
                top: `${event.clientY}px`
            },

            {
                duration: 450,
                fill: "forwards"
            }

        );

    });

}



/* =========================================================
   4. MOBILE MENU
   ========================================================= */

if (menuToggle) {

    menuToggle.addEventListener("click", () => {

        const isOpen =
            navbar.classList.toggle("menu-open");

        menuToggle.setAttribute(
            "aria-expanded",
            isOpen
        );

    });

}


/*
    Close mobile menu when
    clicking navigation links.
*/

document
    .querySelectorAll(".nav-links a")
    .forEach(link => {

        link.addEventListener("click", () => {

            navbar.classList.remove(
                "menu-open"
            );

            if (menuToggle) {

                menuToggle.setAttribute(
                    "aria-expanded",
                    "false"
                );

            }

        });

    });



/* =========================================================
   5. SCROLL REVEAL ANIMATION
   ========================================================= */

const revealObserver =
    new IntersectionObserver(

        (entries, observer) => {

            entries.forEach(entry => {

                if (entry.isIntersecting) {

                    entry.target.classList.add(
                        "visible"
                    );

                    observer.unobserve(
                        entry.target
                    );

                }

            });

        },

        {
            threshold: 0.12,

            rootMargin:
                "0px 0px -40px 0px"
        }

    );


document
    .querySelectorAll(".reveal")
    .forEach(element => {

        revealObserver.observe(element);

    });



/* =========================================================
   6. ANIMATED STAT COUNTERS
   ========================================================= */

const counters =
    document.querySelectorAll(
        "[data-count]"
    );

/* ---------------------------------------------------------
   REAL PLATFORM STATISTICS
   The three counters (learners / skills / connections) are
   fed from the backend's public GET /api/stats endpoint —
   no hardcoded marketing numbers. If the backend is not
   reachable the counters simply remain at 0.
   --------------------------------------------------------- */

(async function loadPlatformStats() {

    const base = window.SKILLSHARE_API_BASE;

    if (!base) {
        return; // config.js not loaded — nothing to fetch from
    }

    const statKeys = {
        statLearners: "members",
        statSkills: "skills_offered",
        statConnections: "connections",
    };

    try {

        const response = await fetch(base + "/api/stats");

        if (!response.ok) {
            return;
        }

        const stats = await response.json();

        counters.forEach(counter => {

            const key = statKeys[counter.id];

            if (key && Number.isFinite(stats[key])) {
                counter.dataset.count = String(stats[key]);
                delete counter.dataset.suffix;
            }

        });

    } catch (error) {
        /* Backend unreachable — counters remain at 0. */
    }

})();

let countersStarted = false;


const counterSection =
    document.querySelector(".stats");


if (counterSection) {

    const counterObserver =
        new IntersectionObserver(

            (entries, observer) => {

                entries.forEach(entry => {

                    if (
                        entry.isIntersecting &&
                        !countersStarted
                    ) {

                        countersStarted = true;

                        startCounters();

                        observer.unobserve(
                            entry.target
                        );

                    }

                });

            },

            {
                threshold: 0.5
            }

        );


    counterObserver.observe(
        counterSection
    );

}


/*
    Counter animation function
*/

function startCounters() {

    counters.forEach(counter => {

        const target =
            Number(
                counter.dataset.count
            );

        const suffix =
            counter.dataset.suffix || "";

        const duration = 1400;

        const startTime =
            performance.now();


        function updateCounter(currentTime) {

            const elapsed =
                currentTime - startTime;

            const progress =
                Math.min(
                    elapsed / duration,
                    1
                );


            /*
                Ease-out animation
            */

            const eased =
                1 -
                Math.pow(
                    1 - progress,
                    3
                );


            const currentValue =
                Math.floor(
                    target * eased
                );


            counter.textContent =
                currentValue + suffix;


            if (progress < 1) {

                requestAnimationFrame(
                    updateCounter
                );

            } else {

                counter.textContent =
                    target + suffix;

            }

        }


        requestAnimationFrame(
            updateCounter
        );

    });

}



/* =========================================================
   7. 3D TILT EFFECT
   ========================================================= */

const tiltCards =
    document.querySelectorAll(
        ".tilt-card"
    );


tiltCards.forEach(card => {


    card.addEventListener(
        "pointermove",
        event => {

            /*
                Disable effect on
                small screens.
            */

            if (window.innerWidth < 800) {
                return;
            }


            const rect =
                card.getBoundingClientRect();


            const x =
                (event.clientX - rect.left)
                / rect.width;


            const y =
                (event.clientY - rect.top)
                / rect.height;


            const rotateY =
                (x - 0.5) * 10;


            const rotateX =
                (0.5 - y) * 10;


            card.style.transform =
                `perspective(900px)
                 rotateX(${rotateX}deg)
                 rotateY(${rotateY}deg)
                 translateY(-8px)`;


            /*
                Move internal glow.
            */

            const glowX =
                (x - 0.5) * 80;


            const glowY =
                (y - 0.5) * 80;


            card.style.setProperty(
                "--mx",
                `${glowX}px`
            );


            card.style.setProperty(
                "--my",
                `${glowY}px`
            );

        }
    );


    /*
        Reset card when
        mouse leaves.
    */

    card.addEventListener(
        "pointerleave",
        () => {

            card.style.transform = "";

            card.style.setProperty(
                "--mx",
                "0px"
            );

            card.style.setProperty(
                "--my",
                "0px"
            );

        }
    );

});



/* =========================================================
   8. MAGNETIC BUTTON EFFECT
   ========================================================= */

const magneticButtons =
    document.querySelectorAll(
        ".magnetic"
    );


magneticButtons.forEach(button => {


    button.addEventListener(
        "pointermove",
        event => {

            if (window.innerWidth < 800) {
                return;
            }


            const rect =
                button.getBoundingClientRect();


            const x =
                event.clientX -
                (rect.left + rect.width / 2);


            const y =
                event.clientY -
                (rect.top + rect.height / 2);


            button.style.transform =
                `translate(
                    ${x * 0.12}px,
                    ${y * 0.18}px
                )`;

        }
    );


    button.addEventListener(
        "pointerleave",
        () => {

            button.style.transform = "";

        }
    );

});



/* =========================================================
   9. BUTTON RIPPLE EFFECT
   ========================================================= */

document
    .querySelectorAll(".btn")
    .forEach(button => {

        button.addEventListener(
            "click",
            function (event) {

                /*
                    Create ripple element.
                */

                const ripple =
                    document.createElement(
                        "span"
                    );


                ripple.classList.add(
                    "button-ripple"
                );


                const rect =
                    button.getBoundingClientRect();


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


                button.appendChild(
                    ripple
                );


                setTimeout(() => {

                    ripple.remove();

                }, 650);

            }
        );

    });



/* =========================================================
   10. SMOOTH ANCHOR SCROLL
   ========================================================= */

document
    .querySelectorAll(
        'a[href^="#"]'
    )
    .forEach(link => {

        link.addEventListener(
            "click",
            event => {

                const targetID =
                    link.getAttribute(
                        "href"
                    );


                const target =
                    document.querySelector(
                        targetID
                    );


                if (!target) {
                    return;
                }


                event.preventDefault();


                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            }
        );

    });



/* =========================================================
   11. ACTIVE NAVIGATION
   ========================================================= */

const sections =
    document.querySelectorAll(
        "main section[id]"
    );


const navLinks =
    document.querySelectorAll(
        ".nav-links a"
    );


const sectionObserver =
    new IntersectionObserver(

        entries => {

            entries.forEach(entry => {

                if (
                    entry.isIntersecting
                ) {

                    const currentID =
                        entry.target.id;


                    navLinks.forEach(
                        link => {

                            link.classList.remove(
                                "active"
                            );


                            const linkTarget =
                                link.getAttribute(
                                    "href"
                                );


                            if (
                                linkTarget ===
                                `#${currentID}`
                            ) {

                                link.classList.add(
                                    "active"
                                );

                            }

                        }
                    );

                }

            });

        },

        {
            threshold: 0.35
        }

    );


sections.forEach(section => {

    sectionObserver.observe(
        section
    );

});



/* =========================================================
   12. HERO IMAGE PARALLAX
   ========================================================= */

const heroVisual =
    document.querySelector(
        ".hero-visual"
    );


if (heroVisual) {

    window.addEventListener(
        "scroll",
        () => {

            /*
                Disable on mobile.
            */

            if (window.innerWidth < 800) {
                return;
            }


            const scrollY =
                window.scrollY;


            const heroHeight =
                document.querySelector(
                    ".hero"
                ).offsetHeight;


            if (scrollY <= heroHeight) {

                const movement =
                    scrollY * 0.12;


                heroVisual.style.transform =
                    `translateY(${movement}px)`;

            }

        }
    );

}



/* =========================================================
   13. TEAM CARD SPOTLIGHT
   ========================================================= */

document
    .querySelectorAll(".team-card")
    .forEach(card => {

        card.addEventListener(
            "pointermove",
            event => {

                const rect =
                    card.getBoundingClientRect();


                const x =
                    event.clientX -
                    rect.left;


                const y =
                    event.clientY -
                    rect.top;


                card.style.setProperty(
                    "--mouse-x",
                    `${x}px`
                );


                card.style.setProperty(
                    "--mouse-y",
                    `${y}px`
                );

            }
        );

    });



/* =========================================================
   14. KEYBOARD ACCESSIBILITY
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        /*
            Escape closes
            mobile navigation.
        */

        if (
            event.key === "Escape"
        ) {

            navbar.classList.remove(
                "menu-open"
            );


            if (menuToggle) {

                menuToggle.setAttribute(
                    "aria-expanded",
                    "false"
                );

            }

        }

    }
);



/* =========================================================
   15. PAGE LOAD ANIMATION
   ========================================================= */

window.addEventListener(
    "load",
    () => {

        document.body.classList.add(
            "page-loaded"
        );

    }
);



/* =========================================================
   16. PREVENT IMAGE DRAG
   ========================================================= */

document
    .querySelectorAll("img")
    .forEach(image => {

        image.addEventListener(
            "dragstart",
            event => {

                event.preventDefault();

            }
        );

    });



/* =========================================================
   17. CONSOLE MESSAGE
   ========================================================= */

console.log(
    "%c SkillShare — No Bugs 🐞 ",
    "background:#7047ff;color:white;font-size:16px;font-weight:bold;padding:8px 15px;border-radius:8px;"
);

console.log(
    "About Us page loaded successfully."
);