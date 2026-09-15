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
        searchAborted: null,
    };

    /* Session-scoped search cache (lightweight, no sensitive data). */
    const SEARCH_CACHE = new Map();
    const SEARCH_CACHE_MAX = 40;
    const SEARCH_CACHE_TTL_MS = 60_000;
    const searchCache = {
        get(q) {
            const e = SEARCH_CACHE.get(q);
            if (!e) return null;
            if (Date.now() - e.t > SEARCH_CACHE_TTL_MS) {
                SEARCH_CACHE.delete(q);
                return null;
            }
            return e.data;
        },
        set(q, data) {
            if (SEARCH_CACHE.size >= SEARCH_CACHE_MAX) {
                for (const k of SEARCH_CACHE.keys()) { SEARCH_CACHE.delete(k); break; }
            }
            SEARCH_CACHE.set(q, { data, t: Date.now() });
        },
        clear() { SEARCH_CACHE.clear(); },
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

    /* "@username" line - rendered only when the DB row really has one. */
    function handleHtml(user) {
        const uname = user && user.username ? String(user.username).trim() : "";
        return uname ? '<span class="card-handle">@' + escapeHtml(uname) + "</span>" : "";
    }

    /* Public-ID + optional location line (both real columns of users). */
    function idLineHtml(user) {
        const code = escapeHtml(String((user && user.public_id) || "").replace(/^SC-?/i, ""));
        const loc = user && user.location
            ? " &middot; " + escapeHtml(user.location)
            : "";
        return '<span class="card-sub">ID: <span class="card-idcode">' + code +
            "</span>" + loc + "</span>";
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
            handleHtml(user) +
            idLineHtml(user) + "</div></div>" +
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
            handleHtml(other) + idLineHtml(other) + "</div></div>" +
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
            handleHtml(u) + idLineHtml(u) + "</div></div>" +
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
        // Real values only: username / public ID / skills come from the DB row.
        const meta = [];
        if (u.username) meta.push("@" + escapeHtml(u.username));
        meta.push("ID: " + escapeHtml(String(u.public_id || "").replace(/^SC-?/i, "")));
        if (skills) meta.push(skills);
        return '<button type="button" class="search-item" data-act="profile" ' +
            'data-user-id="' + u.id + '">' +
            avatarHtml(u) +
            '<div class="search-item-main">' +
            '<div class="search-item-name"><span>' + escapeHtml(u.name) + "</span>" + pill + "</div>" +
            '<div class="search-item-meta">' + meta.join(" &nbsp;&#8226;&nbsp; ") + "</div>" +
            "</div></button>";
    }

    function renderSearchResults(users, query) {
        if (!users.length) {
            searchResults.innerHTML =
                '<div class="search-empty">No accounts found<br>' +
                '<span class="search-empty-hint">Nothing matched &ldquo;' +
                escapeHtml(query) + "&rdquo;. Try another name or username.</span></div>";
            return;
        }
        searchResults.innerHTML =
            '<div class="search-results-head">Search results</div>' +
            users.map(searchItemHtml).join("");
    }

        async function runSearch(query, signal) {
        // Bump the version for EVERY query (cache hits included) so a slower
        // in-flight response can never overwrite a newer one.
        const seq = ++state.searchSeq;

        // Session cache: repeating "ani" -> "anik" -> "ani" is instant.
        const cached = searchCache.get(query);
        if (cached) {
            searchSpinner.hidden = true;
            renderSearchResults(cached.users, query);
            showSeeAll(query, !!cached.has_more);
            return cached.users;
        }

        searchSpinner.hidden = false;
        showSearching();
        try {
            const res = await API.searchUsers(query, 8, { signal });
            if ((signal && signal.aborted) || seq !== state.searchSeq) return null; // stale, drop
            const users = (res && res.users) || [];
            const hasMore = !!res.has_more;
            searchCache.set(query, { users, has_more: hasMore });
            renderSearchResults(users, query);
            showSeeAll(query, hasMore);
            return users;
        } catch (err) {
            // Aborted requests are expected (fast typing) - never surface them.
            if ((signal && signal.aborted) || (err && err.name === "AbortError")) return null;
            if (seq === state.searchSeq && err.status !== 401) {
                searchResults.innerHTML =
                    '<div class="search-empty">' + escapeHtml(friendlyError(err)) + "</div>";
            }
            return null;
        } finally {
            if (seq === state.searchSeq) searchSpinner.hidden = true;
        }
    }

    /* "Searching..." is only shown while a request is actually in flight. */
    function showSearching() {
        searchResults.innerHTML =
            '<div class="search-status" role="status">' +
            '<span class="search-status-dot" aria-hidden="true"></span>Searching&hellip;</div>';
    }

    /* "See all results" - only rendered when the backend says more exist. */
    function showSeeAll(query, show) {
        const existing = document.getElementById("searchSeeAll");
        if (existing) existing.remove();
        if (!show) return;
        const row = document.createElement("div");
        row.id = "searchSeeAll";
        row.className = "search-see-all";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "search-see-all-btn";
        btn.dataset.query = query;
        btn.innerHTML = "See all results for &ldquo;" + escapeHtml(query) + "&rdquo;";
        row.appendChild(btn);
        searchResults.appendChild(row);
    }

    /* Full result list (bounded by the backend limit of 50) in the All tab. */
    async function expandSearch(query) {
        closeSearch();
        switchTab("all");
        // switchTab may kick off a lazy "discover" load; invalidate it so it
        // can never overwrite these search results.
        state.discoverSeq++;
        grids.all.innerHTML = skeletons(4);
        try {
            const res = await API.searchUsers(query, 50);
            const users = (res && res.users) || [];
            grids.all.innerHTML = users.length
                ? '<div class="panel-note">Showing ' + users.length + " result" +
                  (users.length === 1 ? "" : "s") + " for &ldquo;" +
                  escapeHtml(query) + "&rdquo;</div>" +
                  users.map(personCard).join("")
                : emptyState("&#128269;", "No accounts found",
                    "No accounts match \"" + query + "\". Try another name or username.");
            document.getElementById("searchSeeAll")?.remove();
        } catch (err) {
            if (err.status !== 401) {
                grids.all.innerHTML = emptyState("&#9888;", "Couldn't search",
                    friendlyError(err));
            }
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

        // Cancel anything still in flight and invalidate its response version.
        if (state.searchAborted) {
            state.searchAborted.abort();
            state.searchAborted = null;
        }
        state.searchSeq++;

        if (value.length < 2) {
            searchSpinner.hidden = true;
            if (value.length === 1) {
                // Useful initial state: no pointless API call for 1 character.
                searchResults.hidden = false;
                searchResults.innerHTML =
                    '<div class="search-hint">Keep typing &mdash; enter at least 2 ' +
                    "characters to search people.</div>";
            } else {
                closeSearch();
            }
            return;
        }

        runSearch._t = setTimeout(() => {
            searchResults.hidden = false;
            const controller = new AbortController();
            state.searchAborted = controller;
            runSearch(value, controller.signal);
        }, 250); // short debounce (spec: 200-300ms), never 1s+
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

    /* Search result actions (delegated): profile modal + "see all". */
    searchResults.addEventListener("click", (e) => {
        const seeAll = e.target.closest(".search-see-all-btn");
        if (seeAll) {
            expandSearch(seeAll.dataset.query || peopleSearch.value.trim());
            return;
        }
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
            const res = await API.searchUsers("", 50);
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

    /* Skill strength bars: only rendered when the DB really stores a level. */
    const SKILL_LEVEL_PCT = {
        beginner: 35, novice: 35, basic: 45, elementary: 45,
        intermediate: 65, advanced: 85, expert: 100,
    };

    function titleCase(value) {
        return String(value || "").replace(/[_-]+/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function truncate(value, max) {
        const text = String(value || "").trim();
        return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
    }

    /* Loading state - the Requests page behind the modal stays usable. */
    function profileSkeleton() {
        return '<div class="p-loading" role="status">' +
            '<span class="p-spinner" aria-hidden="true"></span>Opening profile&hellip;</div>' +
            '<div class="p-head"><span class="sk sk-avatar"></span>' +
            '<div class="sk-lines"><span class="sk sk-line" style="width:45%"></span>' +
            '<span class="sk sk-line short"></span></div></div>' +
            '<span class="sk sk-line sk-block" style="width:92%"></span>' +
            '<span class="sk sk-line sk-block" style="width:68%"></span>' +
            '<div class="p-actions"><span class="sk sk-btn"></span>' +
            '<span class="sk sk-btn"></span></div>';
    }

    /* Skills: normalized UserSkill rows first, else the real users.skills CSV. */
    function profileSkillsHtml(res) {
        const detail = Array.isArray(res.skills_detail) ? res.skills_detail : [];
        if (detail.length) {
            return detail.map((s) => {
                const pct = SKILL_LEVEL_PCT[String(s.level || "").toLowerCase()] || 0;
                return '<div class="skill-item">' +
                    '<div class="skill-item-top"><span class="skill-name">' +
                    escapeHtml(s.name) + "</span>" +
                    (s.level ? '<span class="skill-level">' +
                        escapeHtml(titleCase(s.level)) + "</span>" : "") + "</div>" +
                    (pct ? '<div class="skill-bar"><span style="width:' + pct +
                        '%"></span></div>' : "") + "</div>";
            }).join("");
        }
        const csv = String((res.user && res.user.skills) || "").trim();
        if (!csv) return '<div class="p-empty">No skills added yet.</div>';
        return chipsHtml(csv, 12);
    }

    function profileEducationHtml(rows) {
        if (!rows.length) return '<div class="p-empty">No education added yet.</div>';
        return rows.map((e) => {
            const title = [e.degree, e.field_of_study].filter(Boolean).join(" &middot; ") ||
                titleCase(e.education_level) || "Education";
            const bits = [];
            if (e.institution_name) bits.push(escapeHtml(e.institution_name));
            if (e.cgpa) bits.push("CGPA " + escapeHtml(String(e.cgpa)));
            if (e.grade) bits.push("Grade " + escapeHtml(String(e.grade)));
            if (e.location) bits.push(escapeHtml(e.location));
            return '<div class="p-item"><div class="p-item-title">' + title + "</div>" +
                (bits.length ? '<div class="p-item-sub">' + bits.join(" &middot; ") +
                    "</div>" : "") + "</div>";
        }).join("");
    }

    function profileProjectsHtml(rows) {
        if (!rows.length) return '<div class="p-empty">No projects added yet.</div>';
        return rows.map((p) =>
            '<div class="p-item"><div class="p-item-title">' +
            escapeHtml(p.title || "Untitled project") + "</div>" +
            (p.description ? '<div class="p-item-sub">' +
                escapeHtml(truncate(p.description, 150)) + "</div>" : "") +
            (p.skills ? chipsHtml(p.skills, 5) : "") + "</div>").join("");
    }

function profileHtml(res) {
        const u = res.user || {};
        const rel = res.relationship || {};
        const skills = Array.isArray(res.skills_detail) ? res.skills_detail : [];
        const education = Array.isArray(res.education) ? res.education : [];
        const projects = Array.isArray(res.projects_preview) ? res.projects_preview : [];
        const isSelf = !!(state.me && state.me.id === u.id);

        let actions;
        if (isSelf) {
            actions = '<a class="btn btn-ghost" href="profile.html">Edit your profile</a>';
        } else if (rel.connected) {
            actions = '<a class="btn btn-primary" href="messages.html' +
                (rel.conversation_id ? "?user=" + u.id : "") + '">Message</a>';
        } else if (rel.pending_request_id && rel.pending_direction === "sent") {
            actions = '<button type="button" class="btn btn-success" disabled>' +
                'Request Sent &#10003;</button>' +
                '<button type="button" class="btn btn-danger" data-act="cancel" ' +
                'data-user-id="' + u.id + '" data-request-id="' + rel.pending_request_id +
                '">Cancel Request</button>';
        } else if (rel.pending_request_id) {
            actions = '<button type="button" class="btn btn-success" data-act="accept" ' +
                'data-user-id="' + u.id + '" data-request-id="' + rel.pending_request_id +
                '">Accept</button>' +
                '<button type="button" class="btn btn-danger" data-act="decline" ' +
                'data-user-id="' + u.id + '" data-request-id="' + rel.pending_request_id +
                '">Decline</button>';
        } else {
            actions = '<button type="button" class="btn btn-primary" data-act="connect" ' +
                'data-user-id="' + u.id + '">Connect</button>';
        }

        const info = [];
        if (u.location) {
            info.push('<span class="p-kv"><b>Location</b><span>' +
                escapeHtml(u.location) + "</span></span>");
        }
        if (u.website) {
            const href = /^https?:\/\//i.test(u.website) ? u.website : "https://" + u.website;
            info.push('<span class="p-kv"><b>Website</b><a href="' + escapeHtml(href) +
                '" target="_blank" rel="noopener noreferrer">' + escapeHtml(u.website) +
                "</a></span>");
        }

        const connections = typeof res.connections_count === "number"
            ? res.connections_count : 0;

        return '<div class="p-head">' + avatarHtml(u) +
            '<div class="p-head-main"><h3 class="p-name" id="modalName">' +
            escapeHtml(u.name) + "</h3>" +
            (u.username ? '<span class="p-handle">@' + escapeHtml(u.username) + "</span>" : "") +
            '<span class="p-id">ID: ' +
            escapeHtml(String(u.public_id || "").replace(/^SC-?/i, "")) + "</span> " +
            relLine(rel) + "</div></div>" +
            (u.bio ? '<p class="p-bio">' + escapeHtml(u.bio) + "</p>" : "") +
            '<div class="p-stats">' +
            '<div class="p-stat"><b>' + connections + "</b><span>Connections</span></div>" +
            '<div class="p-stat"><b>' + skills.length + "</b><span>Skills</span></div>" +
            "</div>" +
            (info.length
                ? '<div class="p-section"><p class="p-label">About</p>' +
                  '<div class="p-info">' + info.join("") + "</div></div>"
                : "") +
            '<div class="p-section"><p class="p-label">Skills</p>' +
            profileSkillsHtml(res) + "</div>" +
            '<div class="p-section"><p class="p-label">Education</p>' +
            profileEducationHtml(education) + "</div>" +
            '<div class="p-section"><p class="p-label">Projects</p>' +
            profileProjectsHtml(projects) + "</div>" +
            (u.interests
                ? '<div class="p-section"><p class="p-label">Learning interests</p>' +
                  chipsHtml(u.interests, 8) + "</div>"
                : "") +
            '<div class="p-actions">' + actions + "</div>";
    }

    /* Only the newest profile request may paint the modal. */
    let profileSeq = 0;

    async function openProfile(userId) {
        if (!userId) return;
        const seq = ++profileSeq;
        modalBody.setAttribute("aria-busy", "true");
        modalBody.innerHTML = profileSkeleton();
        profileModal.hidden = false;
        modalClose.focus();
        try {
            const res = await API.getUserProfile(userId);
            if (seq !== profileSeq) return;      // a newer profile was opened
            modalBody.setAttribute("aria-busy", "false");
            modalBody.innerHTML = profileHtml(res);
        } catch (err) {
            if (seq !== profileSeq || err.status === 401) return;
            // The rest of the Requests page keeps working; retry stays available.
            modalBody.setAttribute("aria-busy", "false");
            modalBody.innerHTML =
                '<div class="p-error" role="alert">' +
                '<div class="p-error-title">Unable to load profile.</div>' +
                '<div class="p-error-msg">' + escapeHtml(friendlyError(err)) + "</div>" +
                '<div class="p-actions"><button type="button" class="btn btn-primary" ' +
                'data-retry="' + escapeHtml(String(userId)) + '">Try again</button></div></div>';
        }
    }

    /* Relationship actions inside the profile modal (connect / accept /
       decline / cancel) reuse the same handler as the cards, so there is
       no duplicate request logic anywhere. */
    modalBody.addEventListener("click", async (e) => {
        const retry = e.target.closest("[data-retry]");
        if (retry) { openProfile(retry.dataset.retry); return; }
        const btn = e.target.closest("button[data-act]");
        if (!btn || btn.disabled) return;
        const targetId = btn.dataset.userId;
        await handleAction(btn);
        // Refresh the open modal so the relationship state stays accurate.
        if (targetId && !profileModal.hidden) openProfile(targetId);
    });
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
