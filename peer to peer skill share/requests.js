/* =========================================================
   SKILLSHARE - CONNECTIONS PAGE
   Fully database-backed: every card, counter and status on
   this page comes from the FastAPI + PostgreSQL backend via
   the authenticated API client (JWT bearer token).
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const API = window.SkillShareAPI;

    /* AUTH GUARD */
    if (!API || !API.getToken()) {
        window.location.href = "login.html";
        return;
    }

    const $ = (id) => document.getElementById(id);

    const refreshBtn = $("refreshBtn");
    const bellBtn = $("bellBtn");
    const bellCount = $("bellCount");
    const headerAvatar = $("headerAvatar");
    const headerUserName = $("headerUserName");
    const peopleSearch = $("peopleSearch");
    const searchSpinner = $("searchSpinner");
    const searchClear = $("peopleSearchClear");
    const searchResults = $("searchResults");
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const counts = {
        incoming: $("incomingCount"),
        sent: $("sentCount"),
        connections: $("connectionsCount"),
    };
    const grids = {
        all: $("allPeopleResults"),
        incoming: $("incomingResults"),
        sent: $("sentResults"),
        connections: $("connectionsResults"),
    };
    const sentPanelHead = document.querySelector("#panel-sent .panel-head");
    const toastContainer = $("toastContainer");
    const profileModal = $("profileModal");
    const modalBody = $("modalBody");
    const modalClose = $("modalClose");
    const confirmModal = $("confirmModal");
    const confirmTitle = $("confirmTitle");
    const confirmText = $("confirmText");
    const confirmOk = $("confirmOk");
    const confirmCancel = $("confirmCancel");

    /* =====================================================
       STATE
    ===================================================== */

    const state = {
        me: null,           // current user (from /me, DB-backed)
        requests: [],       // every request touching me (DB rows)
        connections: [],    // accepted connections (DB rows)
        discover: [],       // people for the All tab (DB rows)
        sentFilter: "all",
        activeTab: "all",
        searchSeq: 0,
        discoverSeq: 0,
        loaded: false,
    };

    /* =====================================================
       SMALL HELPERS
    ===================================================== */

    function escapeHtml(value) {
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function initialsOf(name) {
        const parts = String(name || "?").trim().split(/\s+/);
        return ((parts[0] || "?")[0] +
            (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
    }

    function avatarHtml(user, extra) {
        const cls = "avatar" + (extra ? " " + extra : "");
        const name = user && user.name ? user.name : "?";
        if (user && user.avatar && String(user.avatar).trim() !== "") {
            return '<span class="' + cls + '"><img src="' + escapeHtml(user.avatar) +
                '" alt="" onerror="this.remove()"></span>';
        }
        return '<span class="' + cls + '" aria-hidden="true">' +
            escapeHtml(initialsOf(name)) + "</span>";
    }

    function formatDate(iso) {
        if (!iso) return "";
        try {
            return new Date(iso).toLocaleDateString(undefined, {
                month: "short", day: "numeric", year: "numeric",
            });
        } catch (e) { return ""; }
    }

    function chipsHtml(list, limit) {
        const items = String(list || "").split(",").map(s => s.trim()).filter(Boolean);
        if (!items.length) return "";
        const shown = items.slice(0, limit || 4);
        const rest = items.length - shown.length;
        return '<div class="chip-row">' +
            shown.map(s => '<span class="chip skill">' + escapeHtml(s) + "</span>").join("") +
            (rest > 0 ? '<span class="chip">+' + rest + "</span>" : "") + "</div>";
    }

    function publicIdLabel(publicId) {
        const code = publicId ? String(publicId).replace(/^SC-?/i, "") : "";
        return code
            ? '<span class="card-idcode">ID: ' + escapeHtml(code) + "</span>"
            : "";
    }

    function setBtnLoading(btn, on) {
        if (!btn) return;
        if (on) btn.classList.add("loading");
        else btn.classList.remove("loading");
    }

    /* Map failures to friendly text; raw detail only for 400/409. */
    function friendlyError(err) {
        const status = err && err.status;
        if (status === 0) return "Cannot reach the server. Check your connection and try again.";
        if (status === 401) return "Your session has expired. Please log in again.";
        if (status === 403) return "You don't have permission to do that.";
        if (status === 404) return "That item no longer exists.";
        if (status === 409 || status === 400) {
            return (err && err.detail) ? String(err.detail) : "That action isn't allowed right now.";
        }
        if (status === 422) return "The request was invalid. Please try again.";
        if (status && status >= 500) return "Server error. Please try again in a moment.";
        return (err && err.detail) ? String(err.detail) : "Something went wrong. Please try again.";
    }

    /* =====================================================
       TOASTS
    ===================================================== */

    function toast(type, title, message) {
        const el = document.createElement("div");
        el.className = "toast toast-" + type;
        el.setAttribute("role", type === "error" ? "alert" : "status");
        const icon = type === "success" ? "&#10003;" : type === "error" ? "!" : "i";
        el.innerHTML =
            '<span class="toast-icon" aria-hidden="true">' + icon + "</span>" +
            '<div><p class="toast-title">' + escapeHtml(title) + "</p>" +
            (message ? '<p class="toast-msg">' + escapeHtml(message) + "</p>" : "") + "</div>";
        toastContainer.appendChild(el);
        setTimeout(() => {
            el.classList.add("leaving");
            el.addEventListener("animationend", () => el.remove(), { once: true });
        }, 4600);
    }

    /* =====================================================
       CONFIRM DIALOG (destructive actions)
    ===================================================== */

    let confirmResolve = null;

    function confirmDialog(opts) {
        confirmTitle.textContent = opts.title || "Are you sure?";
        confirmText.textContent = opts.text || "";
        confirmOk.textContent = opts.okLabel || "Confirm";
        confirmModal.hidden = false;
        confirmCancel.focus();
        return new Promise((resolve) => { confirmResolve = resolve; });
    }

    function settleConfirm(result) {
        if (!confirmModal.hidden) {
            confirmModal.hidden = true;
            if (confirmResolve) { confirmResolve(result); confirmResolve = null; }
        }
    }

    confirmOk.addEventListener("click", () => settleConfirm(true));
    confirmCancel.addEventListener("click", () => settleConfirm(false));
    confirmModal.addEventListener("click", (e) => {
        if (e.target === confirmModal) settleConfirm(false);
    });


    /* =====================================================
       CURRENT USER (from /me - live database row)
    ===================================================== */

    function renderHeader() {
        if (!state.me) return;
        const name = state.me.name || "User";
        headerUserName.textContent = name;
        headerAvatar.innerHTML = state.me.avatar_url
            ? '<img src="' + escapeHtml(state.me.avatar_url) + '" alt="" onerror="this.remove()">'
            : escapeHtml(initialsOf(name));
    }

    async function loadMe() {
        try {
            const res = await API.getMe();
            state.me = res && res.user ? res.user : API.getUser();
        } catch (err) {
            if (err.status !== 401) {
                // Fall back to the cached session user (still real data).
                state.me = API.getUser();
            }
        }
        renderHeader();
    }

    document.addEventListener("skillshare:auth-expired", () => {
        toast("error", "Session expired", "Please log in again.");
        setTimeout(() => { window.location.href = "login.html"; }, 1200);
    });

    /* =====================================================
       COUNTERS (real values from the database)
    ===================================================== */

    function updateCounters() {
        const incoming = state.requests.filter(
            r => r.direction === "received" && r.status === "pending"
        ).length;
        const sent = state.requests.filter(
            r => r.direction === "sent" && r.status === "pending"
        ).length;
        const connections = state.connections.length;

        counts.incoming.textContent = incoming;
        counts.sent.textContent = sent;
        counts.connections.textContent = connections;

        bellCount.textContent = incoming;
        bellCount.classList.toggle("zero", incoming === 0);
    }

    /* =====================================================
       EMPTY STATES + SKELETONS
    ===================================================== */

    function emptyState(icon, title, hint) {
        return '<div class="empty-state"><div class="empty-icon" aria-hidden="true">' +
            icon + "</div><h3>" + escapeHtml(title) + "</h3><p>" +
            escapeHtml(hint) + "</p></div>";
    }

    function skeletons(n) {
        let html = "";
        for (let i = 0; i < (n || 3); i++) {
            html += '<div class="card skeleton">' +
                '<div class="sk-row"><span class="sk sk-avatar"></span>' +
                '<div class="sk-lines"><span class="sk sk-line" style="width:60%"></span>' +
                '<span class="sk sk-line short"></span></div></div>' +
                '<span class="sk sk-line" style="width:80%"></span>' +
                '<div class="sk-btns"><span class="sk sk-btn"></span><span class="sk sk-btn"></span></div>' +
                "</div>";
        }
        return html;
    }

    /* =====================================================
       TABS
    ===================================================== */

    function switchTab(tabName) {
        state.activeTab = tabName;
        tabs.forEach(t => {
            const active = t.dataset.tab === tabName;
            t.classList.toggle("active", active);
            t.setAttribute("aria-selected", active ? "true" : "false");
        });
        document.querySelectorAll(".tab-panel").forEach(p => {
            p.classList.toggle("active", p.id === "panel-" + tabName);
        });
        // Lazily load discover people the first time the tab is shown.
        if (tabName === "all" && !state.discover.length && state.loaded) {
            loadDiscover();
        }
    }

    tabs.forEach(t => {
        t.addEventListener("click", () => switchTab(t.dataset.tab));
    });

    bellBtn.addEventListener("click", () => switchTab("incoming"));

    /* =====================================================
       CORE DATA LOAD (requests + connections from PostgreSQL)
    ===================================================== */

    async function loadData(withSkeletons) {
        if (withSkeletons) {
            grids.incoming.innerHTML = skeletons(3);
            grids.sent.innerHTML = skeletons(3);
            grids.connections.innerHTML = skeletons(3);
        }
        try {
            const [reqRes, connRes] = await Promise.all([
                API.listRequests(),
                API.getConnections(),
            ]);
            state.requests = (reqRes && reqRes.requests) || [];
            state.connections = (connRes && connRes.connections) || [];
            state.loaded = true;
            renderIncoming();
            renderSent();
            renderConnections();
            updateCounters();
            if (state.activeTab === "all" && !state.discover.length) {
                loadDiscover();
            }
        } catch (err) {
            if (err.status !== 401) {
                toast("error", "Could not load your data", friendlyError(err));
                [grids.incoming, grids.sent, grids.connections].forEach(g => {
                    g.innerHTML = emptyState("&#9888;", "Couldn't load", friendlyError(err));
                });
            }
        }
    }

    refreshBtn.addEventListener("click", async () => {
        refreshBtn.classList.add("spinning");
        await Promise.all([loadData(false), loadDiscover(true)]);
        refreshBtn.classList.remove("spinning");
        toast("info", "Refreshed", "Latest data loaded from the server.");
    });

    /* =====================================================
       CARD RENDERERS (all data = real DB records)
    ===================================================== */

    function profileBtnHtml(userId) {
        return '<button type="button" class="btn btn-ghost" data-act="profile" ' +
            'data-user-id="' + userId + '">View Profile</button>';
    }

    /* One card per relationship state (spec #7). */
    function personCard(user) {
        const rel = (user && user.relationship) || { relationship: "none" };
        let actions = "";
        let pill = "";

        if (rel.relationship === "self") {
            pill = '<span class="rel-pill self">This is you</span>';
            actions = '<button type="button" class="btn btn-ghost" disabled>This is you</button>';
        } else if (rel.relationship === "connected") {
            pill = '<span class="rel-pill connected">Connected &#10003;</span>';
            actions =
                '<button type="button" class="btn btn-ghost" data-act="profile" data-user-id="' +
                user.id + '">View Profile</button>' +
                '<a class="btn btn-primary" href="messages.html?user=' + user.id + '">Message</a>';
        } else if (rel.relationship === "pending") {
            pill = '<span class="rel-pill pending">Pending</span>';
            if (rel.direction === "sent") {
                actions =
                    '<button type="button" class="btn btn-success" disabled>Request Sent &#10003;</button>' +
                    '<button type="button" class="btn btn-danger" data-act="cancel" data-request-id="' +
                    rel.request_id + '">Cancel</button>';
            } else {
                actions =
                    '<button type="button" class="btn btn-success" data-act="accept" data-request-id="' +
                    rel.request_id + '">Accept</button>' +
                    '<button type="button" class="btn btn-danger" data-act="decline" data-request-id="' +
                    rel.request_id + '">Decline</button>';
            }
        } else {
            pill = '<span class="rel-pill none">Not connected</span>';
            actions = '<button type="button" class="btn btn-primary" data-act="connect" ' +
                'data-user-id="' + user.id + '">Connect</button>' + profileBtnHtml(user.id);
        }

        return '<article class="card" data-user-card="' + user.id + '">' +
            '<div class="card-top">' + avatarHtml(user) +
            '<div style="min-width:0">' +
            '<h3 class="card-name"><span>' + escapeHtml(user.name) + "</span>" + pill + "</h3>" +
            '<span class="card-sub">ID: <span class="card-idcode">' +
            escapeHtml(String(user.public_id || "").replace(/^SC-?/i, "")) +
            "</span></span></div></div>" +
            (user.bio ? '<p class="card-bio">' + escapeHtml(user.bio) + "</p>" : "") +
            chipsHtml(user.skills) +
            '<div class="card-actions">' + actions + "</div></article>";
    }

    function requestCard(req, kind) {
        const other = kind === "incoming" ? req.sender : req.receiver;
        const date = formatDate(req.created_at);
        let badge = "";
        let actions = "";

        if (kind === "incoming") {
            actions =
                '<button type="button" class="btn btn-success" data-act="accept" data-request-id="' +
                req.id + '">Accept</button>' +
                '<button type="button" class="btn btn-danger" data-act="decline" data-request-id="' +
                req.id + '">Decline</button>' +
                profileBtnHtml(other ? other.id : "");
        } else {
            badge = '<span class="status-badge ' + escapeHtml(req.status) + '">' +
                escapeHtml(req.status) + "</span>";
            if (req.status === "pending") {
                actions = '<button type="button" class="btn btn-danger" data-act="cancel" ' +
                    'data-request-id="' + req.id + '">Cancel Request</button>' +
                    profileBtnHtml(other ? other.id : "");
            } else {
                actions = profileBtnHtml(other ? other.id : "");
            }
        }

        return '<article class="card">' +
            '<div class="card-top">' + avatarHtml(other || {}) +
            '<div style="min-width:0">' +
            '<h3 class="card-name"><span>' + escapeHtml(other ? other.name : "Unknown user") +
            "</span>" + (badge || pillForIncoming(req.status)) + "</h3>" +
            '<span class="card-sub">ID: <span class="card-idcode">' +
            escapeHtml(String((other && other.public_id) || "").replace(/^SC-?/i, "")) +
            "</span></span></div></div>" +
            (other && other.bio ? '<p class="card-bio">' + escapeHtml(other.bio) + "</p>" : "") +
            chipsHtml(other && other.skills) +
            (req.message ? '<p class="req-message">&ldquo;' + escapeHtml(req.message) + '&rdquo;</p>' : "") +
            '<div class="card-meta"><span>' + (kind === "incoming" ? "Received" : "Sent") +
            " " + escapeHtml(date) + "</span></div>" +
            '<div class="card-actions">' + actions + "</div></article>";
    }

    function pillForIncoming(status) {
        return status === "pending"
            ? '<span class="status-badge pending">pending</span>'
            : '<span class="status-badge ' + escapeHtml(status) + '">' +
              escapeHtml(status) + "</span>";
    }

    function connectionCard(conn) {
        const u = conn.user || {};
        const convId = conn.conversation_id;
        return '<article class="card">' +
            '<div class="card-top">' + avatarHtml(u) +
            '<div style="min-width:0">' +
            '<h3 class="card-name"><span>' + escapeHtml(u.name || "Unknown") + "</span>" +
            '<span class="rel-pill connected">Connected &#10003;</span></h3>' +
            '<span class="card-sub">ID: <span class="card-idcode">' +
            escapeHtml(String(u.public_id || "").replace(/^SC-?/i, "")) +
            "</span></span></div></div>" +
            (u.bio ? '<p class="card-bio">' + escapeHtml(u.bio) + "</p>" : "") +
            chipsHtml(u.skills) +
            (conn.connected_since
                ? '<div class="card-meta">Connected since ' +
                  escapeHtml(formatDate(conn.connected_since)) + "</div>"
                : "") +
            '<div class="card-actions">' +
            profileBtnHtml(u.id) +
            '<a class="btn btn-primary" href="messages.html' +
            (convId ? "?user=" + u.id : "") + '">Message</a>' +
            "</div></article>";
    }

    /* =====================================================
       PANEL RENDERING
    ===================================================== */

    function renderIncoming() {
        const rows = state.requests.filter(
            r => r.direction === "received" && r.status === "pending"
        );
        grids.incoming.innerHTML = rows.length
            ? rows.map(r => requestCard(r, "incoming")).join("")
            : emptyState("&#128230;", "You're all caught up",
                "No incoming connection requests right now. When someone sends you a request it will appear here.");
    }

    function renderSent() {
        const rows = state.requests.filter(r => r.direction === "sent")
            .filter(r => state.sentFilter === "all" || r.status === state.sentFilter);
        grids.sent.innerHTML = rows.length
            ? rows.map(r => requestCard(r, "sent")).join("")
            : emptyState("&#128140;", state.sentFilter === "all"
                ? "You're all caught up"
                : "No " + state.sentFilter + " requests",
                state.sentFilter === "all"
                    ? "You haven't sent any connection requests yet. Use the search above to find people."
                    : "No requests with this status. Switch filters to see more.");
    }

    function renderConnections() {
        grids.connections.innerHTML = state.connections.length
            ? state.connections.map(connectionCard).join("")
            : emptyState("&#129309;", "You're all caught up",
                "No connections yet. Accept a request or send one to start building your network.");
    }

    /* Real status filtering (on DB-fetched data, never fake). */
    function buildSentFilters() {
        const wrap = document.createElement("div");
        wrap.className = "filter-chips";
        wrap.setAttribute("role", "group");
        wrap.setAttribute("aria-label", "Filter sent requests by status");
        const options = ["all", "pending", "accepted", "rejected", "cancelled"];
        wrap.innerHTML = options.map(o =>
            '<button type="button" class="filter-chip" data-filter="' + o + '">' +
            (o === "all" ? "All" : o.charAt(0).toUpperCase() + o.slice(1)) +
            "</button>").join("");
        sentPanelHead.appendChild(wrap);
        wrap.addEventListener("click", (e) => {
            const chip = e.target.closest(".filter-chip");
            if (!chip) return;
            state.sentFilter = chip.dataset.filter;
            wrap.querySelectorAll(".filter-chip").forEach(c =>
                c.classList.toggle("active", c === chip));
            renderSent();
        });
        wrap.querySelector('[data-filter="all"]').classList.add("active");
    }

    /* =====================================================
       ACTIONS (event delegation on every grid)
    ===================================================== */

    async function handleAction(btn) {
        const act = btn.dataset.act;
        if (btn.classList.contains("loading") || btn.disabled) return;

        /* --- Connect: sender is derived from the JWT server-side;
           the frontend only ever sends the receiver id. --- */
        if (act === "connect") {
            const userId = btn.dataset.userId;
            const toName = nameOf(btn);
            setBtnLoading(btn, true);
            try {
                await API.sendRequest(userId);
                btn.outerHTML =
                    '<button type="button" class="btn btn-success" disabled>Request Sent &#10003;</button>';
                toast("success", "Request sent", "Connection request sent" + toName + ".");
                await loadData(false);
            } catch (err) {
                setBtnLoading(btn, false);
                if (err.status !== 401) {
                    toast("error", "Couldn't send request", friendlyError(err));
                }
            }
            return;
        }

        if (act === "accept") {
            setBtnLoading(btn, true);
            try {
                const res = await API.acceptRequest(btn.dataset.requestId);
                const other = res && res.request && res.request.sender;
                toast("success", "Request accepted",
                    (other && other.name ? other.name + " is now" : "You're now") +
                    " connected with you.");
                await loadData(false);
            } catch (err) {
                setBtnLoading(btn, false);
                if (err.status !== 401) {
                    toast("error", "Couldn't accept request", friendlyError(err));
                }
            }
            return;
        }

        if (act === "decline") {
            setBtnLoading(btn, true);
            try {
                await API.rejectRequest(btn.dataset.requestId);
                toast("info", "Request declined", "The request was removed from your list.");
                await loadData(false);
            } catch (err) {
                setBtnLoading(btn, false);
                if (err.status !== 401) {
                    toast("error", "Couldn't decline request", friendlyError(err));
                }
            }
            return;
        }

        if (act === "cancel") {
            const ok = await confirmDialog({
                title: "Cancel this request?",
                text: "The other person will no longer see your pending request.",
                okLabel: "Cancel Request",
            });
            if (!ok) return;
            setBtnLoading(btn, true);
            try {
                await API.cancelRequest(btn.dataset.requestId);
                toast("success", "Request cancelled", "The pending request was withdrawn.");
                await loadData(false);
            } catch (err) {
                setBtnLoading(btn, false);
                if (err.status !== 401) {
                    toast("error", "Couldn't cancel request", friendlyError(err));
                }
            }
            return;
        }

        if (act === "profile") {
            openProfile(btn.dataset.userId);
        }
    }

    function nameOf(btn) {
        const card = btn.closest(".card");
        const nameEl = card && card.querySelector(".card-name span");
        return nameEl ? " to " + nameEl.textContent : "";
    }

    [grids.all, grids.incoming, grids.sent, grids.connections].forEach(grid => {
        grid.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-act]");
            if (btn && !btn.disabled && btn.tagName === "BUTTON") handleAction(btn);
        });
    });

    /* =====================================================
       SEARCH (debounced, against PostgreSQL via /api/users/search)
    ===================================================== */

    function searchItemHtml(u) {
        const rel = (u && u.relationship) || { relationship: "none" };
        let pill = '<span class="rel-pill none">Not connected</span>';
        if (rel.relationship === "self") pill = '<span class="rel-pill self">This is you</span>';
        else if (rel.relationship === "connected") {
            pill = '<span class="rel-pill connected">Connected</span>';
        } else if (rel.relationship === "pending") {
            pill = '<span class="rel-pill pending">' +
                (rel.direction === "sent" ? "Request sent" : "Wants to connect") + "</span>";
        }
        const skills = String(u.skills || "").split(",").map(s => s.trim())
            .filter(Boolean).slice(0, 2).join(" &#8226; ");
        return '<button type="button" class="search-item" data-act="profile" ' +
            'data-user-id="' + u.id + '">' +
            avatarHtml(u) +
            '<div class="search-item-main">' +
            '<div class="search-item-name"><span>' + escapeHtml(u.name) + "</span>" + pill + "</div>" +
            '<div class="search-item-meta">ID: ' +
            escapeHtml(String(u.public_id || "").replace(/^SC-?/i, "")) +
            (skills ? " &nbsp;&#8226;&nbsp; " + skills : "") + "</div>" +
            "</div></button>";
    }

    function renderSearchResults(users, query) {
        if (!users.length) {
            searchResults.innerHTML =
                '<div class="search-empty">No people found for "' +
                escapeHtml(query) + '". Try a different name, skill or ID.</div>';
            return;
        }
        searchResults.innerHTML = users.map(searchItemHtml).join("");
    }

    async function runSearch(query) {
        const seq = ++state.searchSeq;
        searchSpinner.hidden = false;
        try {
            const res = await API.searchUsers(query);
            if (seq !== state.searchSeq) return; // stale response, drop it
            renderSearchResults((res && res.users) || [], query);
        } catch (err) {
            if (seq === state.searchSeq && err.status !== 401) {
                searchResults.innerHTML =
                    '<div class="search-empty">' + escapeHtml(friendlyError(err)) + "</div>";
            }
        } finally {
            if (seq === state.searchSeq) searchSpinner.hidden = true;
        }
    }

    function closeSearch() {
        searchResults.hidden = true;
        searchResults.innerHTML = "";
    }

    peopleSearch.addEventListener("input", () => {
        const value = peopleSearch.value.trim();
        searchClear.hidden = value.length === 0;
        clearTimeout(runSearch._t);
        if (value.length < 2) {
            closeSearch();
            return;
        }
        runSearch._t = setTimeout(() => {
            searchResults.hidden = false;
            runSearch(value);
        }, 300); // debounce
    });

    searchClear.addEventListener("click", () => {
        peopleSearch.value = "";
        searchClear.hidden = true;
        closeSearch();
        peopleSearch.focus();
    });

    peopleSearch.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { closeSearch(); peopleSearch.blur(); }
        if (e.key === "Enter") {
            e.preventDefault();
            const first = searchResults.querySelector(".search-item");
            if (first && !searchResults.hidden) first.click();
        }
    });

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-wrap")) closeSearch();
    });

    /* Search result actions (delegated): open the profile modal. */
    searchResults.addEventListener("click", (e) => {
        const item = e.target.closest(".search-item");
        if (item) {
            closeSearch();
            openProfile(item.dataset.userId);
        }
    });

    /* =====================================================
       DISCOVER (All tab) - real users from the database
    ===================================================== */

    async function loadDiscover(silent) {
        const seq = ++state.discoverSeq;
        if (!silent && !grids.all.children.length) {
            grids.all.innerHTML = skeletons(6);
        }
        try {
            const res = await API.searchUsers("");
            if (seq !== state.discoverSeq) return;
            state.discover = (res && res.users) || [];
            grids.all.innerHTML = state.discover.length
                ? state.discover.map(personCard).join("")
                : emptyState("&#128100;", "No people yet",
                    "No other registered users were found. Invite people to join SkillShare!");
        } catch (err) {
            if (seq === state.discoverSeq && err.status !== 401) {
                grids.all.innerHTML = emptyState("&#9888;", "Couldn't load people",
                    friendlyError(err));
            }
        }
    }

    /* =====================================================
       PROFILE MODAL (real data from GET /api/users/{id})
    ===================================================== */

    function relLine(rel) {
        if (rel.connected) return '<span class="rel-pill connected">Connected &#10003;</span>';
        if (rel.pending_request_id) {
            return '<span class="rel-pill pending">' +
                (rel.pending_direction === "sent"
                    ? "Request sent" : "Sent you a request") + "</span>";
        }
        return '<span class="rel-pill none">Not connected</span>';
    }

    async function openProfile(userId) {
        if (!userId) return;
        modalBody.innerHTML = skeletons(1);
        profileModal.hidden = false;
        modalClose.focus();
        try {
            const res = await API.getUserProfile(userId);
            const u = res.user || {};
            const rel = res.relationship || {};
            let actions = "";

            if (rel.connected) {
                actions = '<a class="btn btn-primary" href="messages.html' +
                    (rel.conversation_id ? "?user=" + u.id : "") + '">Message</a>';
            } else if (rel.pending_request_id) {
                actions = '<button type="button" class="btn btn-success" disabled>Request ' +
                    (rel.pending_direction === "sent" ? "Sent &#10003;" : "Received") + "</button>";
            } else {
                actions = '<button type="button" class="btn btn-primary" data-act="connect" ' +
                    'data-user-id="' + u.id + '">Connect</button>';
            }

            modalBody.innerHTML =
                '<div class="p-head">' + avatarHtml(u) +
                '<div><h3 class="p-name" id="modalName">' + escapeHtml(u.name) + "</h3>" +
                '<span class="p-id">ID: ' +
                escapeHtml(String(u.public_id || "").replace(/^SC-?/i, "")) + "</span> " +
                relLine(rel) + "</div></div>" +
                (u.bio ? '<p class="p-bio">' + escapeHtml(u.bio) + "</p>" : "") +
                (u.skills
                    ? '<div class="p-section"><p class="p-label">Skills</p>' +
                      chipsHtml(u.skills, 8) + "</div>"
                    : "") +
                (u.interests
                    ? '<div class="p-section"><p class="p-label">Learning interests</p>' +
                      chipsHtml(u.interests, 8) + "</div>"
                    : "") +
                '<div class="p-actions">' + actions + "</div>";

            modalBody.querySelector('[data-act="connect"]')
                .addEventListener("click", (e) => handleAction(e.currentTarget));
        } catch (err) {
            profileModal.hidden = true;
            if (err.status !== 401) {
                toast("error", "Couldn't load profile", friendlyError(err));
            }
        }
    }

    function closeProfile() {
        profileModal.hidden = true;
        modalBody.innerHTML = "";
        peopleSearch.focus();
    }

    modalClose.addEventListener("click", closeProfile);
    profileModal.addEventListener("click", (e) => {
        if (e.target === profileModal) closeProfile();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (!confirmModal.hidden) { settleConfirm(false); return; }
        if (!profileModal.hidden) closeProfile();
    });

    /* =====================================================
       INIT
    ===================================================== */

    buildSentFilters();
    loadMe();
    loadData(true);
});
