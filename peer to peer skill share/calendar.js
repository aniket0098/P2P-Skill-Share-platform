/* =========================================================
   SKILLSHARE — CALENDAR JS
   Advanced calendar interactions
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* -----------------------------------------------------
       ELEMENTS
    ----------------------------------------------------- */

    const calendarTitle = document.querySelector(".calendar-head h2");
    const monthButtons = document.querySelectorAll(".month-nav button");
    const events = document.querySelectorAll(".event");
    const upcomingItems = document.querySelectorAll(".up");
    const createButton = document.querySelector(".primary");

    /* -----------------------------------------------------
       CURRENT DATE
    ----------------------------------------------------- */

    let currentDate = new Date(2026, 7, 1);

    const months = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
    ];

    /* -----------------------------------------------------
       UPDATE MONTH TITLE
    ----------------------------------------------------- */

    function updateCalendarTitle() {

        if (!calendarTitle) return;

        calendarTitle.textContent =
            `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

        calendarTitle.style.opacity = "0";
        calendarTitle.style.transform = "translateY(-5px)";

        requestAnimationFrame(() => {
            calendarTitle.style.transition =
                "opacity .25s ease, transform .25s ease";

            calendarTitle.style.opacity = "1";
            calendarTitle.style.transform = "translateY(0)";
        });
    }

    /* -----------------------------------------------------
       MONTH NAVIGATION
    ----------------------------------------------------- */

    if (monthButtons.length >= 2) {

        monthButtons[0].addEventListener("click", () => {

            currentDate.setMonth(currentDate.getMonth() - 1);

            updateCalendarTitle();

            showToast(
                `Showing ${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
            );
        });

        monthButtons[1].addEventListener("click", () => {

            currentDate.setMonth(currentDate.getMonth() + 1);

            updateCalendarTitle();

            showToast(
                `Showing ${months[currentDate.getMonth()]} ${currentDate.getFullYear()}`
            );
        });
    }

    /* -----------------------------------------------------
       EVENT DATA
    ----------------------------------------------------- */

    const eventData = [
        {
            title: "Figma for beginners",
            person: "Priya Sharma",
            time: "10:00 AM – 10:45 AM"
        },
        {
            title: "You teach: UI/UX basics",
            person: "Rohit Mehta",
            time: "2:00 PM – 3:00 PM"
        },
        {
            title: "Portfolio review",
            person: "Neha Kapoor",
            time: "6:00 PM – 6:30 PM"
        }
    ];

    /* -----------------------------------------------------
       EVENT CLICK
    ----------------------------------------------------- */

    events.forEach((event, index) => {

        event.setAttribute("tabindex", "0");
        event.setAttribute("role", "button");

        event.addEventListener("click", () => {

            events.forEach(item => {
                item.classList.remove("active");
            });

            upcomingItems.forEach(item => {
                item.classList.remove("active");
            });

            event.classList.add("active");

            if (upcomingItems[index]) {
                upcomingItems[index].classList.add("active");
            }

            const data = eventData[index];

            if (data) {
                showToast(
                    `${data.title} · ${data.time} · ${data.person}`
                );
            }
        });

        event.addEventListener("keydown", e => {

            if (e.key === "Enter" || e.key === " ") {

                e.preventDefault();
                event.click();
            }
        });

    });

    /* -----------------------------------------------------
       UPCOMING SESSION CLICK
    ----------------------------------------------------- */

    upcomingItems.forEach((item, index) => {

        item.setAttribute("tabindex", "0");
        item.setAttribute("role", "button");

        item.addEventListener("click", () => {

            upcomingItems.forEach(up => {
                up.classList.remove("active");
            });

            events.forEach(event => {
                event.classList.remove("active");
            });

            item.classList.add("active");

            if (events[index]) {
                events[index].classList.add("active");

                events[index].scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                    inline: "center"
                });
            }

            const data = eventData[index];

            if (data) {
                showToast(
                    `${data.title} selected`
                );
            }
        });

        item.addEventListener("keydown", e => {

            if (e.key === "Enter" || e.key === " ") {

                e.preventDefault();
                item.click();
            }
        });

    });

    /* -----------------------------------------------------
       CREATE SESSION BUTTON
    ----------------------------------------------------- */

    if (createButton) {

        createButton.addEventListener("click", () => {

            createButton.style.transform = "scale(.97)";

            setTimeout(() => {
                createButton.style.transform = "";
            }, 120);

        });
    }

    /* -----------------------------------------------------
       NAV ACTIVE STATE
    ----------------------------------------------------- */

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();

    document.querySelectorAll(".app-nav a").forEach(link => {

        const href =
            link.getAttribute("href")
                ?.split("/")
                .pop()
                .toLowerCase();

        if (href === currentPage) {

            link.style.color = "var(--primary)";
            link.style.background =
                "rgba(99, 91, 255, .07)";

            const underline =
                document.createElement("span");

            underline.style.position = "absolute";
            underline.style.left = "50%";
            underline.style.bottom = "3px";
            underline.style.width = "55%";
            underline.style.height = "2px";
            underline.style.borderRadius = "10px";
            underline.style.background =
                "var(--primary)";
            underline.style.transform =
                "translateX(-50%)";

            link.appendChild(underline);
        }
    });

    /* -----------------------------------------------------
       TOAST SYSTEM
    ----------------------------------------------------- */

    let toastTimer;

    function showToast(message) {

        let toast =
            document.querySelector(".calendar-toast");

        if (toast) {
            toast.remove();
        }

        toast = document.createElement("div");

        toast.className = "calendar-toast";

        toast.innerHTML = `
            <span>✓</span>
            <span>${escapeHTML(message)}</span>
        `;

        document.body.appendChild(toast);

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {

            toast.classList.add("hide");

            setTimeout(() => {
                toast.remove();
            }, 300);

        }, 2800);
    }

    /* -----------------------------------------------------
       SAFE HTML ESCAPE
    ----------------------------------------------------- */

    function escapeHTML(value) {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /* -----------------------------------------------------
       HORIZONTAL CALENDAR DRAG / SWIPE
    ----------------------------------------------------- */

    const calendar =
        document.querySelector(".calendar-scroll");

    if (calendar) {

        let isDown = false;
        let startX;
        let scrollLeft;

        calendar.addEventListener("mousedown", e => {

            if (e.target.closest(".event")) return;

            isDown = true;

            startX = e.pageX - calendar.offsetLeft;
            scrollLeft = calendar.scrollLeft;

            calendar.style.cursor = "grabbing";
        });

        calendar.addEventListener("mouseleave", () => {

            isDown = false;
            calendar.style.cursor = "";
        });

        calendar.addEventListener("mouseup", () => {

            isDown = false;
            calendar.style.cursor = "";
        });

        calendar.addEventListener("mousemove", e => {

            if (!isDown) return;

            e.preventDefault();

            const x =
                e.pageX - calendar.offsetLeft;

            const walk = (x - startX) * 1.2;

            calendar.scrollLeft =
                scrollLeft - walk;
        });
    }

    /* -----------------------------------------------------
       INITIALIZE
    ----------------------------------------------------- */

    updateCalendarTitle();

});