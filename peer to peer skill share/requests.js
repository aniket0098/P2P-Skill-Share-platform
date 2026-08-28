/* =========================================================
   SKILLSHARE — SESSION REQUESTS
   Advanced Request Management System
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const tabs = document.querySelectorAll(".tabs button");
    const panels = document.querySelectorAll(".tab-panel");

    const toast = document.getElementById("toast");

    const createButton =
        document.querySelector(".page-heading .primary");


    /* =====================================================
       STATE
    ===================================================== */

    let currentTab = "incoming";

    let requestStore = {
        incoming: [],
        outgoing: [],
        past: []
    };


    /* =====================================================
       LOAD EXISTING REQUESTS
    ===================================================== */

    function loadRequests() {

        const incoming =
            document.querySelector("#incoming");

        const outgoing =
            document.querySelector("#outgoing");

        const past =
            document.querySelector("#past");


        requestStore.incoming =
            incoming
                ? [...incoming.querySelectorAll(".request")]
                : [];


        requestStore.outgoing =
            outgoing
                ? [...outgoing.querySelectorAll(".request")]
                : [];


        requestStore.past =
            past
                ? [...past.querySelectorAll(".request")]
                : [];
    }


    loadRequests();


    /* =====================================================
       TAB SYSTEM
    ===================================================== */

    tabs.forEach(tab => {

        tab.addEventListener("click", () => {

            const target =
                tab.dataset.tab;

            if (!target) return;

            switchTab(target);
        });

    });


    function switchTab(target) {

        currentTab = target;


        tabs.forEach(tab => {

            const active =
                tab.dataset.tab === target;

            tab.classList.toggle(
                "active",
                active
            );
        });


        panels.forEach(panel => {

            const active =
                panel.id === target;

            panel.classList.toggle(
                "active",
                active
            );
        });


        updateSearchAndFilters();

        window.history.replaceState(
            null,
            "",
            `#${target}`
        );
    }


    /* =====================================================
       OPEN TAB FROM URL HASH
    ===================================================== */

    const hash =
        window.location.hash
            .replace("#", "");

    if (
        hash === "incoming" ||
        hash === "outgoing" ||
        hash === "past"
    ) {
        switchTab(hash);
    }


    /* =====================================================
       ADD SEARCH + FILTER TOOLS
    ===================================================== */

    const tabsContainer =
        document.querySelector(".tabs");


    const tools =
        document.createElement("div");

    tools.className =
        "request-tools";


    tools.innerHTML = `
        <div class="request-search">
            <input
                type="search"
                id="requestSearch"
                placeholder="Search requests..."
                autocomplete="off"
            >
        </div>

        <select
            class="request-filter"
            id="requestFilter"
            aria-label="Filter requests"
        >
            <option value="all">All requests</option>
            <option value="online">Online</option>
            <option value="learning">Learning</option>
            <option value="teaching">Teaching</option>
        </select>
    `;


    if (tabsContainer) {
        tabsContainer.after(tools);
    }


    const searchInput =
        document.getElementById("requestSearch");

    const filterSelect =
        document.getElementById("requestFilter");


    /* =====================================================
       SEARCH
    ===================================================== */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            filterRequests
        );
    }


    if (filterSelect) {

        filterSelect.addEventListener(
            "change",
            filterRequests
        );
    }


    function filterRequests() {

        const search =
            searchInput
                ? searchInput.value
                    .trim()
                    .toLowerCase()
                : "";


        const filter =
            filterSelect
                ? filterSelect.value
                : "all";


        const panel =
            document.getElementById(currentTab);


        if (!panel) return;


        const cards =
            panel.querySelectorAll(".request");


        let visible = 0;


        cards.forEach(card => {

            const text =
                card.textContent.toLowerCase();


            const matchesSearch =
                !search ||
                text.includes(search);


            const matchesFilter =
                filter === "all" ||
                text.includes(filter) ||
                (
                    filter === "online" &&
                    text.includes("online")
                );


            const shouldShow =
                matchesSearch &&
                matchesFilter;


            card.style.display =
                shouldShow
                    ? ""
                    : "none";


            if (shouldShow) {
                visible++;
            }
        });


        updateNoResults(panel, visible);
    }


    /* =====================================================
       NO SEARCH RESULTS
    ===================================================== */

    function updateNoResults(panel, count) {

        let noResults =
            panel.querySelector(".no-results");


        if (count === 0) {

            if (!noResults) {

                noResults =
                    document.createElement("div");

                noResults.className =
                    "empty card no-results";


                noResults.innerHTML = `
                    <div class="empty-icon">⌕</div>
                    <h2>No matching requests</h2>
                    <p>
                        Try another name, skill,
                        or filter.
                    </p>
                `;

                panel.appendChild(noResults);
            }

            noResults.style.display =
                "flex";

        } else if (noResults) {

            noResults.style.display =
                "none";
        }
    }


    /* =====================================================
       ACCEPT / DECLINE
    ===================================================== */

    document.addEventListener("click", event => {

        const actionButton =
            event.target.closest(
                "[data-action]"
            );


        if (!actionButton) return;


        const action =
            actionButton.dataset.action;


        const card =
            actionButton.closest(".request");


        if (!card) return;


        const title =
            card.querySelector("h2")
                ?.textContent
                .trim() ||
            "this request";


        if (action === "accept") {

            openConfirmation({
                title: "Accept request?",
                message:
                    `Accept "${title}" and move it to your active sessions?`,
                confirmText: "Accept",
                type: "confirm",
                onConfirm: () => {
                    acceptRequest(card);
                }
            });

        }


        if (action === "decline") {

            openConfirmation({
                title: "Decline request?",
                message:
                    `Are you sure you want to decline "${title}"?`,
                confirmText: "Decline",
                type: "danger",
                onConfirm: () => {
                    declineRequest(card);
                }
            });
        }

    });


    /* =====================================================
       ACCEPT REQUEST
    ===================================================== */

    function acceptRequest(card) {

        card.classList.add("accepted");


        const name =
            card.querySelector("h2")
                ?.textContent
                .trim() ||
            "Request";


        showToast(
            "✓ Request accepted successfully",
            "success"
        );


        setTimeout(() => {

            moveToPast(card, "Accepted");

        }, 480);


        saveAction({
            type: "accepted",
            title: name,
            time: Date.now()
        });
    }


    /* =====================================================
       DECLINE REQUEST
    ===================================================== */

    function declineRequest(card) {

        card.classList.add("declined");


        const name =
            card.querySelector("h2")
                ?.textContent
                .trim() ||
            "Request";


        showToast(
            "Request declined",
            "error"
        );


        setTimeout(() => {

            moveToPast(card, "Declined");

        }, 480);


        saveAction({
            type: "declined",
            title: name,
            time: Date.now()
        });
    }


    /* =====================================================
       MOVE REQUEST TO PAST
    ===================================================== */

    function moveToPast(card, status) {

        const pastPanel =
            document.getElementById("past");


        if (!pastPanel) return;


        const empty =
            pastPanel.querySelector(".empty");


        if (
            empty &&
            !empty.classList.contains("no-results")
        ) {
            empty.remove();
        }


        card.classList.remove(
            "accepted",
            "declined"
        );


        const actions =
            card.querySelector(
                ".request-actions"
            );


        if (actions) {
            actions.remove();
        }


        let statusElement =
            card.querySelector(".status");


        if (!statusElement) {

            statusElement =
                document.createElement("span");

            card.appendChild(
                statusElement
            );
        }


        statusElement.className =
            `status ${status.toLowerCase()
            }`;


        statusElement.textContent =
            status;


        pastPanel.appendChild(card);


        loadRequests();

        updateCounters();

        switchTab("past");
    }


    /* =====================================================
       CONFIRMATION MODAL
    ===================================================== */

    function openConfirmation(options) {

        closeConfirmation();


        const modal =
            document.createElement("div");


        modal.className =
            "request-modal";


        modal.innerHTML = `
            <div
                class="request-modal-box"
                role="dialog"
                aria-modal="true"
            >

                <div class="modal-icon">
                    ${options.type === "danger" ? "!" : "✓"}
                </div>

                <h3>
                    ${escapeHTML(options.title)}
                </h3>

                <p>
                    ${escapeHTML(options.message)}
                </p>

                <div class="modal-actions">

                    <button
                        class="modal-btn"
                        data-modal-cancel
                    >
                        Cancel
                    </button>

                    <button
                        class="modal-btn ${options.type === "danger"
                ? "danger"
                : "confirm"
            }"
                        data-modal-confirm
                    >
                        ${escapeHTML(options.confirmText)}
                    </button>

                </div>

            </div>
        `;


        document.body.appendChild(modal);


        requestAnimationFrame(() => {
            modal.classList.add("show");
        });


        const cancel =
            modal.querySelector(
                "[data-modal-cancel]"
            );


        const confirm =
            modal.querySelector(
                "[data-modal-confirm]"
            );


        cancel.addEventListener(
            "click",
            closeConfirmation
        );


        confirm.addEventListener(
            "click",
            () => {

                options.onConfirm();

                closeConfirmation();
            }
        );


        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {
                    closeConfirmation();
                }
            }
        );


        document.addEventListener(
            "keydown",
            escapeModal
        );


        function escapeModal(event) {

            if (event.key === "Escape") {

                closeConfirmation();

                document.removeEventListener(
                    "keydown",
                    escapeModal
                );
            }
        }


        setTimeout(() => {
            confirm.focus();
        }, 100);
    }


    function closeConfirmation() {

        const modal =
            document.querySelector(
                ".request-modal"
            );


        if (!modal) return;


        modal.classList.remove("show");


        setTimeout(() => {

            if (modal.parentNode) {
                modal.remove();
            }

        }, 250);
    }


    /* =====================================================
       TOAST
    ===================================================== */

    let toastTimer;


    function showToast(
        message,
        type = "info"
    ) {

        if (!toast) return;


        clearTimeout(toastTimer);


        toast.className =
            `toast show ${type}`;


        toast.innerHTML = `
            <span>
                ${type === "success"
                ? "✓"
                : type === "error"
                    ? "!"
                    : "i"
            }
            </span>

            <span>
                ${escapeHTML(message)}
            </span>
        `;


        toastTimer =
            setTimeout(() => {

                toast.classList.remove(
                    "show"
                );

            }, 3000);
    }


    /* =====================================================
       TAB COUNTERS
    ===================================================== */

    function updateCounters() {

        const incomingPanel =
            document.getElementById(
                "incoming"
            );


        if (!incomingPanel) return;


        const count =
            incomingPanel.querySelectorAll(
                ".request"
            ).length;


        const incomingTab =
            document.querySelector(
                '[data-tab="incoming"]'
            );


        if (!incomingTab) return;


        let badge =
            incomingTab.querySelector("span");


        if (!badge) {

            badge =
                document.createElement("span");

            incomingTab.appendChild(
                badge
            );
        }


        badge.textContent = count;
    }


    updateCounters();


    /* =====================================================
       CREATE SESSION BUTTON
    ===================================================== */

    if (createButton) {

        createButton.addEventListener(
            "click",
            () => {

                createButton.style.transform =
                    "translateY(-1px) scale(.98)";

                setTimeout(() => {

                    createButton.style.transform =
                        "";

                }, 130);
            }
        );
    }


    /* =====================================================
       ACTIVE NAVIGATION
    ===================================================== */

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    document
        .querySelectorAll(".app-nav a")
        .forEach(link => {

            const href =
                link
                    .getAttribute("href")
                    ?.split("/")
                    .pop()
                    .toLowerCase();


            if (href === currentPage) {

                link.style.color =
                    "var(--primary)";

                link.style.background =
                    "rgba(99,91,255,.07)";
            }
        });


    /* =====================================================
       BUTTON RIPPLE
    ===================================================== */

    document.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    "button"
                );


            if (!button) return;


            if (
                button.closest(".request-modal")
            ) {
                return;
            }


            const rect =
                button.getBoundingClientRect();


            const ripple =
                document.createElement("span");


            const size =
                Math.max(
                    rect.width,
                    rect.height
                );


            ripple.style.position =
                "absolute";

            ripple.style.width =
                `${size}px`;

            ripple.style.height =
                `${size}px`;

            ripple.style.left =
                `${event.clientX - rect.left - size / 2}px`;

            ripple.style.top =
                `${event.clientY - rect.top - size / 2}px`;

            ripple.style.borderRadius =
                "50%";

            ripple.style.background =
                "rgba(255,255,255,.25)";

            ripple.style.transform =
                "scale(0)";

            ripple.style.pointerEvents =
                "none";

            ripple.style.animation =
                "requestRipple .55s ease-out";


            if (
                getComputedStyle(button)
                    .position === "static"
            ) {
                button.style.position =
                    "relative";
            }


            button.style.overflow =
                "hidden";


            button.appendChild(
                ripple
            );


            setTimeout(() => {

                ripple.remove();

            }, 600);
        }
    );


    /* =====================================================
       RIPPLE CSS
    ===================================================== */

    const rippleStyle =
        document.createElement("style");


    rippleStyle.textContent = `
        @keyframes requestRipple {
            to {
                transform: scale(2.5);
                opacity: 0;
            }
        }
    `;


    document.head.appendChild(
        rippleStyle
    );


    /* =====================================================
       LOCAL STORAGE
       ===================================================== */

    function saveAction(action) {

        try {

            const existing =
                JSON.parse(
                    localStorage.getItem(
                        "skillshare_request_actions"
                    )
                ) || [];


            existing.push(action);


            localStorage.setItem(
                "skillshare_request_actions",
                JSON.stringify(existing)
            );

        } catch (error) {

            console.warn(
                "Could not save request action.",
                error
            );
        }
    }


    /* =====================================================
       KEYBOARD SHORTCUTS
    ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.target.matches(
                    "input, textarea, select"
                )
            ) {
                return;
            }


            if (event.key === "1") {
                switchTab("incoming");
            }


            if (event.key === "2") {
                switchTab("outgoing");
            }


            if (event.key === "3") {
                switchTab("past");
            }
        }
    );


    /* =====================================================
       UPDATE SEARCH / FILTER
    ===================================================== */

    function updateSearchAndFilters() {

        if (searchInput) {
            searchInput.value = "";
        }

        if (filterSelect) {
            filterSelect.value = "all";
        }


        document
            .querySelectorAll(".request")
            .forEach(card => {
                card.style.display = "";
            });


        document
            .querySelectorAll(".no-results")
            .forEach(item => {
                item.style.display = "none";
            });
    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(value) {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    /* =====================================================
       INITIALIZE
    ===================================================== */

    updateCounters();

});