/* =========================================================
   SKILLSHARE — NOTIFICATIONS
   Advanced Notification Management
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";


    /* =====================================================
       ELEMENTS
       ===================================================== */

    const notificationList =
        document.querySelector(".cards");

    const markReadButton =
        document.getElementById("markRead");

    const toast =
        document.getElementById("toast");


    if (!notificationList) {
        return;
    }


    /* =====================================================
       STATE
       ===================================================== */

    let notifications = [];

    let toastTimer = null;

    let deletedNotification = null;


    /* =====================================================
       LOAD NOTIFICATIONS
       ===================================================== */

    function loadNotifications() {

        notifications = [
            ...notificationList.querySelectorAll(
                ".notification-item"
            )
        ];


        notifications.forEach(
            prepareNotification
        );


        restoreReadState();

        updateUnreadCount();

        addTools();

        updateEmptyState();
    }


    /* =====================================================
       PREPARE EACH NOTIFICATION
       ===================================================== */

    function prepareNotification(card, index) {

        if (!card.dataset.id) {
            card.dataset.id =
                `notification-${index + 1}`;
        }


        /*
         * Existing dot = unread
         */
        if (
            card.querySelector(".dot")
        ) {
            card.classList.add("unread");
        }


        /*
         * Make notification keyboard accessible
         */
        card.setAttribute(
            "tabindex",
            "0"
        );


        card.setAttribute(
            "role",
            "button"
        );


        /*
         * Add category automatically
         */
        const category =
            detectCategory(card);


        card.dataset.category =
            category;


        /*
         * Add action buttons
         */
        addNotificationActions(card);
    }


    /* =====================================================
       DETECT CATEGORY
       ===================================================== */

    function detectCategory(card) {

        const text =
            card.textContent.toLowerCase();


        if (
            text.includes("request") ||
            text.includes("session")
        ) {
            return "session";
        }


        if (
            text.includes("review") ||
            text.includes("feedback")
        ) {
            return "review";
        }


        if (
            text.includes("message") ||
            text.includes("chat")
        ) {
            return "message";
        }


        return "general";
    }


    /* =====================================================
       ADD ACTION BUTTONS
       ===================================================== */

    function addNotificationActions(card) {

        if (
            card.querySelector(
                ".notification-actions"
            )
        ) {
            return;
        }


        const actions =
            document.createElement("div");


        actions.className =
            "notification-actions";


        actions.innerHTML = `
            <button
                class="notification-action read-action"
                type="button"
                title="Mark as read"
                aria-label="Mark notification as read"
            >
                ✓
            </button>

            <button
                class="notification-action delete"
                type="button"
                title="Delete notification"
                aria-label="Delete notification"
            >
                ×
            </button>
        `;


        card.appendChild(actions);
    }


    /* =====================================================
       ADD SEARCH + FILTER
       ===================================================== */

    function addTools() {

        if (
            document.querySelector(
                ".notification-tools"
            )
        ) {
            return;
        }


        const tools =
            document.createElement("div");


        tools.className =
            "notification-tools";


        tools.innerHTML = `
            <div class="notification-search">

                <input
                    id="notificationSearch"
                    type="search"
                    placeholder="Search notifications..."
                    autocomplete="off"
                    aria-label="Search notifications"
                >

            </div>

            <select
                id="notificationFilter"
                class="notification-filter"
                aria-label="Filter notifications"
            >

                <option value="all">
                    All notifications
                </option>

                <option value="unread">
                    Unread
                </option>

                <option value="read">
                    Read
                </option>

                <option value="session">
                    Sessions
                </option>

                <option value="review">
                    Reviews
                </option>

                <option value="message">
                    Messages
                </option>

            </select>
        `;


        const heading =
            document.querySelector(
                ".page-heading"
            );


        heading.after(tools);


        const search =
            document.getElementById(
                "notificationSearch"
            );


        const filter =
            document.getElementById(
                "notificationFilter"
            );


        search.addEventListener(
            "input",
            applyFilters
        );


        filter.addEventListener(
            "change",
            applyFilters
        );
    }


    /* =====================================================
       FILTER
       ===================================================== */

    function applyFilters() {

        const search =
            document
                .getElementById(
                    "notificationSearch"
                )
                ?.value
                .trim()
                .toLowerCase() || "";


        const filter =
            document
                .getElementById(
                    "notificationFilter"
                )
                ?.value || "all";


        let visibleCount = 0;


        notifications.forEach(card => {

            const text =
                card.textContent.toLowerCase();


            const category =
                card.dataset.category;


            const isUnread =
                card.classList.contains(
                    "unread"
                );


            const matchesSearch =
                !search ||
                text.includes(search);


            let matchesFilter = true;


            if (filter === "unread") {
                matchesFilter = isUnread;
            }


            if (filter === "read") {
                matchesFilter = !isUnread;
            }


            if (
                [
                    "session",
                    "review",
                    "message"
                ].includes(filter)
            ) {
                matchesFilter =
                    category === filter;
            }


            const visible =
                matchesSearch &&
                matchesFilter;


            card.style.display =
                visible
                    ? ""
                    : "none";


            if (visible) {
                visibleCount++;
            }
        });


        updateSearchEmptyState(
            visibleCount
        );
    }


    /* =====================================================
       EMPTY SEARCH STATE
       ===================================================== */

    function updateSearchEmptyState(
        visibleCount
    ) {

        let empty =
            document.querySelector(
                ".search-empty"
            );


        if (visibleCount === 0) {

            if (!empty) {

                empty =
                    document.createElement(
                        "div"
                    );

                empty.className =
                    "notification-empty search-empty";


                empty.innerHTML = `
                    <div class="notification-empty-icon">
                        ⌕
                    </div>

                    <h2>
                        No notifications found
                    </h2>

                    <p>
                        Try changing your search
                        or notification filter.
                    </p>
                `;


                notificationList.appendChild(
                    empty
                );
            }


            empty.style.display =
                "flex";

        } else if (empty) {

            empty.style.display =
                "none";
        }
    }


    /* =====================================================
       CLICK HANDLER
       ===================================================== */

    document.addEventListener(
        "click",
        event => {

            const card =
                event.target.closest(
                    ".notification-item"
                );


            if (!card) {
                return;
            }


            /*
             * Delete
             */
            if (
                event.target.closest(
                    ".notification-action.delete"
                )
            ) {

                event.stopPropagation();

                deleteNotification(card);

                return;
            }


            /*
             * Mark read
             */
            if (
                event.target.closest(
                    ".read-action"
                )
            ) {

                event.stopPropagation();

                markAsRead(card);

                return;
            }


            /*
             * Notification itself
             */
            markAsRead(card);

            openNotification(card);
        }
    );


    /* =====================================================
       KEYBOARD INTERACTION
       ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            const card =
                event.target.closest(
                    ".notification-item"
                );


            if (!card) {
                return;
            }


            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                event.preventDefault();

                markAsRead(card);

                openNotification(card);
            }
        }
    );


    /* =====================================================
       MARK AS READ
       ===================================================== */

    function markAsRead(card) {

        if (
            !card.classList.contains(
                "unread"
            )
        ) {
            return;
        }


        card.classList.remove(
            "unread"
        );


        card.classList.add(
            "read"
        );


        const dot =
            card.querySelector(".dot");


        if (dot) {
            dot.remove();
        }


        const id =
            card.dataset.id;


        saveReadState(
            id,
            true
        );


        updateUnreadCount();

        showToast(
            "Notification marked as read.",
            "success"
        );
    }


    /* =====================================================
       MARK ALL READ
       ===================================================== */

    if (markReadButton) {

        markReadButton.addEventListener(
            "click",
            markAllAsRead
        );
    }


    function markAllAsRead() {

        const unread =
            notifications.filter(
                card =>
                    card.classList.contains(
                        "unread"
                    )
            );


        if (unread.length === 0) {

            showToast(
                "You're all caught up.",
                "info"
            );

            return;
        }


        unread.forEach(card => {

            card.classList.remove(
                "unread"
            );


            card.classList.add(
                "read"
            );


            const dot =
                card.querySelector(
                    ".dot"
                );


            if (dot) {
                dot.remove();
            }


            saveReadState(
                card.dataset.id,
                true
            );
        });


        updateUnreadCount();

        applyFilters();


        showToast(
            `${unread.length} notification${unread.length === 1
                ? ""
                : "s"
            } marked as read.`,
            "success"
        );
    }


    /* =====================================================
       DELETE
       ===================================================== */

    function deleteNotification(card) {

        const title =
            card.querySelector("h2")
                ?.textContent
                .trim() ||
            "Notification";


        deletedNotification = {
            card,
            parent: card.parentNode,
            nextSibling: card.nextSibling,
            title
        };


        card.classList.add(
            "removing"
        );


        setTimeout(() => {

            if (card.parentNode) {
                card.remove();
            }


            notifications =
                notifications.filter(
                    item =>
                        item !== card
                );


            updateUnreadCount();

            updateEmptyState();


            showUndoToast(
                "Notification deleted."
            );

        }, 400);
    }


    /* =====================================================
       UNDO DELETE
       ===================================================== */

    function showUndoToast(
        message
    ) {

        if (!toast) return;


        clearTimeout(
            toastTimer
        );


        toast.className =
            "toast show info";


        toast.innerHTML = `
            <span>✓</span>

            <span>
                ${escapeHTML(message)}
            </span>

            <button
                id="undoDelete"
                type="button"
                style="
                    margin-left:auto;
                    border:0;
                    background:transparent;
                    color:#a5b4fc;
                    font-weight:800;
                    cursor:pointer;
                "
            >
                Undo
            </button>
        `;


        const undo =
            document.getElementById(
                "undoDelete"
            );


        if (undo) {

            undo.addEventListener(
                "click",
                restoreDeleted
            );
        }


        toastTimer =
            setTimeout(() => {

                deletedNotification =
                    null;

                toast.classList.remove(
                    "show"
                );

            }, 5000);
    }


    /* =====================================================
       RESTORE DELETED
       ===================================================== */

    function restoreDeleted() {

        if (
            !deletedNotification
        ) {
            return;
        }


        const {
            card,
            parent,
            nextSibling
        } = deletedNotification;


        card.classList.remove(
            "removing"
        );


        if (
            nextSibling &&
            nextSibling.parentNode === parent
        ) {

            parent.insertBefore(
                card,
                nextSibling
            );

        } else {

            parent.appendChild(
                card
            );
        }


        notifications.push(
            card
        );


        updateUnreadCount();

        updateEmptyState();

        showToast(
            "Notification restored.",
            "success"
        );


        deletedNotification =
            null;
    }


    /* =====================================================
       OPEN NOTIFICATION
       ===================================================== */

    function openNotification(card) {

        const title =
            card.querySelector("h2")
                ?.textContent
                .trim() ||
            "Notification";


        const text =
            card.querySelector("p")
                ?.textContent
                .trim() ||
            "";


        showToast(
            title,
            "info"
        );


        /*
         * You can later replace this with
         * real application routing.
         *
         * Example:
         *
         * window.location.href =
         *     "requests.html";
         */


        if (
            title.toLowerCase()
                .includes("request")
        ) {

            setTimeout(() => {

                window.location.href =
                    "requests.html";

            }, 650);

        }
    }


    /* =====================================================
       UNREAD COUNT
       ===================================================== */

    function updateUnreadCount() {

        const count =
            notifications.filter(
                card =>
                    card.classList.contains(
                        "unread"
                    )
            ).length;


        document.title =
            count > 0
                ? `(${count}) Notifications | SkillShare`
                : "Notifications | SkillShare";


        updateNotificationBadge(
            count
        );
    }


    /* =====================================================
       HEADER NOTIFICATION BADGE
       ===================================================== */

    function updateNotificationBadge(
        count
    ) {

        let badge =
            document.querySelector(
                ".notification-count"
            );


        if (!badge) {

            badge =
                document.createElement(
                    "span"
                );

            badge.className =
                "notification-count";


            const style =
                document.createElement(
                    "style"
                );


            style.textContent = `
                .notification-count {
                    position: fixed;
                    top: 18px;
                    right: 82px;
                    z-index: 2000;

                    min-width: 19px;
                    height: 19px;

                    display: grid;
                    place-items: center;

                    padding: 0 5px;

                    color: white;

                    background: #ef4444;

                    border: 2px solid white;

                    border-radius: 50%;

                    font-size: 9px;
                    font-weight: 800;

                    box-shadow:
                        0 4px 12px
                        rgba(239,68,68,.25);

                    pointer-events: none;
                }

                @media(max-width:650px) {
                    .notification-count {
                        top: 12px;
                        right: 18px;
                    }
                }
            `;


            document.head.appendChild(
                style
            );


            document.body.appendChild(
                badge
            );
        }


        if (count > 0) {

            badge.textContent =
                count > 99
                    ? "99+"
                    : count;


            badge.style.display =
                "grid";

        } else {

            badge.style.display =
                "none";
        }
    }


    /* =====================================================
       EMPTY STATE
       ===================================================== */

    function updateEmptyState() {

        const existing =
            document.querySelector(
                ".notification-main-empty"
            );


        if (notifications.length === 0) {

            if (!existing) {

                const empty =
                    document.createElement(
                        "div"
                    );

                empty.className =
                    "notification-empty notification-main-empty";


                empty.innerHTML = `
                    <div class="notification-empty-icon">
                        ✓
                    </div>

                    <h2>
                        You're all caught up
                    </h2>

                    <p>
                        You don't have any notifications
                        right now.
                    </p>
                `;


                notificationList.appendChild(
                    empty
                );
            }

        } else if (existing) {

            existing.remove();
        }
    }


    /* =====================================================
       LOCAL STORAGE
       ===================================================== */

    function saveReadState(
        id,
        value
    ) {

        try {

            const state =
                JSON.parse(
                    localStorage.getItem(
                        "skillshare_notification_read"
                    )
                ) || {};


            state[id] =
                value;


            localStorage.setItem(
                "skillshare_notification_read",
                JSON.stringify(state)
            );

        } catch (error) {

            console.warn(
                "Unable to save notification state.",
                error
            );
        }
    }


    /* =====================================================
       RESTORE READ STATE
       ===================================================== */

    function restoreReadState() {

        try {

            const state =
                JSON.parse(
                    localStorage.getItem(
                        "skillshare_notification_read"
                    )
                ) || {};


            notifications.forEach(card => {

                const id =
                    card.dataset.id;


                if (state[id]) {

                    card.classList.remove(
                        "unread"
                    );

                    card.classList.add(
                        "read"
                    );


                    const dot =
                        card.querySelector(
                            ".dot"
                        );


                    if (dot) {
                        dot.remove();
                    }
                }
            });

        } catch (error) {

            console.warn(
                "Unable to restore notification state.",
                error
            );
        }
    }


    /* =====================================================
       TOAST
       ===================================================== */

    function showToast(
        message,
        type = "info"
    ) {

        if (!toast) {
            return;
        }


        clearTimeout(
            toastTimer
        );


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
       ESCAPE HTML
       ===================================================== */

    function escapeHTML(
        value
    ) {

        return String(value)
            .replace(
                /&/g,
                "&amp;"
            )
            .replace(
                /</g,
                "&lt;"
            )
            .replace(
                />/g,
                "&gt;"
            )
            .replace(
                /"/g,
                "&quot;"
            )
            .replace(
                /'/g,
                "&#039;"
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
        .querySelectorAll(
            ".app-nav a"
        )
        .forEach(link => {

            const href =
                link
                    .getAttribute("href")
                    ?.split("/")
                    .pop()
                    .toLowerCase();


            if (
                href === currentPage
            ) {

                link.style.color =
                    "var(--primary)";

                link.style.background =
                    "rgba(99,91,255,.07)";
            }
        });


    /* =====================================================
       INITIALIZE
       ===================================================== */

    loadNotifications();

});