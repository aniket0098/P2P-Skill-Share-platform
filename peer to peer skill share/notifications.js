/* =========================================================
   SKILLSHARE - NOTIFICATIONS (Stage 32 repair)

   Wired to the REAL single notifications store (PostgreSQL, JWT
   owner-scoped):
     GET  /api/notifications        -> items + unread_count
     POST /api/notifications/{id}/read
     POST /api/notifications/read-all

   The old static-DOM / localStorage behavior is gone: every row shown
   here is a row the backend created for THIS user (application status
   changes, Innovation Lab activity, invites, platform messages).
   ========================================================= */
document.addEventListener("DOMContentLoaded", function () {
    "use strict";

    var listEl = document.querySelector(".cards");
    var markReadBtn = document.getElementById("markRead");
    var subtitle = document.getElementById("notifSubtitle");
    var toastEl = document.getElementById("toast");
    if (!listEl) return;

    var items = [];
    var loading = false;
    var toastTimer = null;

    var TYPE_ICONS = {
        application_status: "fa-solid fa-briefcase",
        innovation: "fa-solid fa-lightbulb",
        innovation_invite: "fa-solid fa-user-group",
        innovation_feedback: "fa-solid fa-comment-dots",
        general: "fa-solid fa-bell"
    };

    function esc(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function toast(message, type) {
        if (!toastEl) return;
        clearTimeout(toastTimer);
        toastEl.className = "toast show " + (type || "info");
        toastEl.textContent = message;
        toastTimer = setTimeout(function () {
            toastEl.classList.remove("show");
        }, 3200);
    }

    function timeAgo(iso) {
        if (!iso) return "";
        var then = new Date(iso);
        if (isNaN(then.getTime())) return "";
        var seconds = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
        if (seconds < 60) return "Just now";
        var minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + "m ago";
        var hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + "h ago";
        var days = Math.floor(hours / 24);
        if (days < 30) return days + "d ago";
        return then.toLocaleDateString();
    }

    function unreadCount() {
        return items.filter(function (n) { return !n.is_read; }).length;
    }

    function updateHeader() {
        var unread = unreadCount();
        if (subtitle) {
            if (!items.length) {
                subtitle.textContent = "Stay up to date with your skill-sharing activity.";
            } else if (unread) {
                subtitle.textContent = unread + " unread of " + items.length +
                    (items.length === 1 ? " notification." : " notifications.");
            } else {
                subtitle.textContent = "You are all caught up (" + items.length +
                    (items.length === 1 ? " notification)." : " notifications).");
            }
        }
        if (markReadBtn) markReadBtn.disabled = loading || unread === 0;
    }

    function skeleton() {
        listEl.setAttribute("aria-busy", "true");
        listEl.innerHTML =
            '<div class="empty-state">Loading your notifications&hellip;</div>';
        if (markReadBtn) markReadBtn.disabled = true;
    }

    function emptyState() {
        listEl.innerHTML =
            '<div class="empty-state">You are all caught up. New notifications appear ' +
            'here as soon as something happens on the platform.</div>';
    }

    function errorState(message) {
        listEl.innerHTML =
            '<div class="empty-state">' + esc(message) +
            ' <button type="button" class="outline" id="notifRetry">Retry</button></div>';
        var retry = document.getElementById("notifRetry");
        if (retry) retry.addEventListener("click", load);
    }

    function itemHtml(n) {
        var icon = TYPE_ICONS[n.type] || TYPE_ICONS.general;
        var unread = !n.is_read;
        return '<article class="notification-item ' + (unread ? "unread" : "read") + '"' +
            ' data-id="' + esc(n.id) + '" tabindex="0" role="button"' +
            ' aria-label="' + (unread ? "Unread notification: " : "Notification: ") +
            esc(n.title) + '">' +
            '<div class="note-icon" aria-hidden="true"><i class="' + icon + '"></i></div>' +
            '<div class="note-content">' +
            '<h2>' + esc(n.title) + '</h2>' +
            (n.message ? '<p>' + esc(n.message) + '</p>' : "") +
            '<time datetime="' + esc(n.created_at || "") + '">' +
            esc(timeAgo(n.created_at)) + '</time>' +
            '</div>' +
            (unread ? '<span class="dot" aria-hidden="true"></span>' : '<span></span>') +
            '</article>';
    }

    function render() {
        listEl.setAttribute("aria-busy", "false");
        if (!items.length) {
            emptyState();
            updateHeader();
            return;
        }
        listEl.innerHTML = items.map(itemHtml).join("");
        updateHeader();
    }

    function findItem(id) {
        for (var i = 0; i < items.length; i++) {
            if (String(items[i].id) === String(id)) return items[i];
        }
        return null;
    }

    function openItem(n, card) {
        if (!n) return;
        var go = function () {
            if (n.link) window.location.href = n.link;
        };
        if (n.is_read) {
            go();
            return;
        }
        /* Optimistic local read + server confirmation; a failed confirm
           is corrected on the next load (never blocks navigation). */
        n.is_read = true;
        card.classList.remove("unread");
        card.classList.add("read");
        var dot = card.querySelector(".dot");
        if (dot) dot.remove();
        updateHeader();
        window.SkillShareAPI.markNotificationRead(n.id).then(go).catch(go);
    }

    function cardActivate(target) {
        var card = target && target.closest ? target.closest(".notification-item") : null;
        if (!card) return null;
        return card;
    }

    listEl.addEventListener("click", function (event) {
        var card = cardActivate(event.target);
        if (!card) return;
        openItem(findItem(card.getAttribute("data-id")), card);
    });

    listEl.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var card = cardActivate(event.target);
        if (!card) return;
        event.preventDefault();
        openItem(findItem(card.getAttribute("data-id")), card);
    });

    if (markReadBtn) {
        markReadBtn.addEventListener("click", function () {
            if (markReadBtn.disabled || loading) return;
            markReadBtn.disabled = true;
            window.SkillShareAPI.markAllNotificationsRead().then(function () {
                items.forEach(function (n) { n.is_read = true; });
                render();
                toast("All notifications marked as read.", "success");
            }).catch(function (error) {
                updateHeader();
                toast((error && (error.detail || error.message)) ||
                    "Could not update notifications.", "error");
            });
        });
    }

    function load() {
        if (loading) return;
        loading = true;
        skeleton();
        if (window.SkillShareAuth && window.SkillShareAuth.requireUser) {
            /* 401 redirects are handled globally by auth.js. */
            window.SkillShareAuth.requireUser().catch(function () { /* handled */ });
        }
        window.SkillShareAPI.getNotifications({ limit: 50 }).then(function (res) {
            items = (res && res.items) || [];
            loading = false;
            render();
        }).catch(function (error) {
            loading = false;
            if (error && error.status === 401) return;
            listEl.setAttribute("aria-busy", "false");
            errorState((error && (error.detail || error.message)) ||
                "Could not load notifications. Check your connection.");
            updateHeader();
        });
    }

    load();
});