/* =========================================================
   SKILLSHARE — CONNECTIONS
   Powered by FastAPI + PostgreSQL (backend is source of truth).
   Tabs: Received / Sent (requests) · Connections · Find People.
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* =====================================================
       AUTH GUARD
    ===================================================== */

    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
        window.location.href = "login.html";
        return;
    }

    /* =====================================================
       ELEMENTS
    ===================================================== */

    const tabs = document.querySelectorAll(".tabs button");
    const incomingPanel = document.getElementById("incoming");
    const outgoingPanel = document.getElementById("outgoing");
    const connectionsPanel = document.getElementById("connections");
    const peopleResults = document.getElementById("peopleResults");
    const peopleSearch = document.getElementById("peopleSearch");
    const toast = document.getElementById("toast");

    /* =====================================================
       STATE
    ===================================================== */

    let allRequests = [];
    let allConnections = [];
    let searchTimer = null;
    let connectedIds = new Set();
    let pendingSentIds = new Set();
    let pendingReceivedIds = new Set();

    /* =====================================================
       TOAST
    ===================================================== */

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(window.skillshareRequestsToast);
        window.skillshareRequestsToast = setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }

    /* =====================================================
       TAB SYSTEM
    ===================================================== */

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.tab;
            if (target) switchTab(target);
        });
    });

    function switchTab(target) {
        tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === target));
        document.querySelectorAll(".tab-panel").forEach(p => {
            p.classList.toggle("active", p.id === target);
        });
        window.history.replaceState(null, "", `#${target}`);
        if (target === "discover") loadPeople(true);
    }

    const initialHash = window.location.hash.replace("#", "");
    if (["incoming", "outgoing", "connections", "discover"].includes(initialHash)) {
        switchTab(initialHash);
    }

    /* =====================================================
       HELPERS
    ===================================================== */

    function timeAgo(value) {
        if (!value) return "";
        const date = new Date(value);
        if (isNaN(date.getTime())) return "";
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return "Just now";
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days <= 1) return "Yesterday";
        if (days < 30) return `${days}d ago`;
        return date.toLocaleDateString();
    }

    function skillList(user) {
        if (!user) return [];
        const raw = user.skills || user.interests || "";
        return String(raw)
            .split(",")
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 4);
    }

    function publicIdText(user) {
        return (user && user.public_id) ? `ID: ${user.public_id}` : "ID: —";
    }

    /* =====================================================
       FILTERED LISTS (from PostgreSQL responses)
    ===================================================== */

    function incomingRequests() {
        return allRequests.filter(r => r.direction === "received" && r.status === "pending");
    }

    function outgoingRequests() {
        return allRequests.filter(r => r.direction === "sent" && r.status === "pending");
    }

    function pastRequests() {
        return allRequests.filter(r => r.status !== "pending");
    }

    /* =====================================================
       CARD BUILDERS
    ===================================================== */

    function makeButton(label, className, onClick) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        if (onClick) button.addEventListener("click", onClick);
        return button;
    }

    function statusLabel(status) {
        return {
            accepted: "Accepted",
            rejected: "Declined",
            cancelled: "Cancelled",
        }[status] || status;
    }

    function emptyCard(title, text, actionLabel, onAction) {
        const article = document.createElement("article");
        article.className = "empty card";
        const icon = document.createElement("div");
        icon.className = "empty-icon";
        icon.textContent = "✓";
        const h2 = document.createElement("h2");
        h2.textContent = title;
        const p = document.createElement("p");
        p.textContent = text;
        article.append(icon, h2, p);
        if (actionLabel && onAction) {
            article.appendChild(makeButton(actionLabel, "small primary empty-action", onAction));
        }
        return article;
    }

    /* Request card: real rows from GET /api/requests */
    function buildCard(request) {
        const otherUser = request.direction === "received"
            ? request.sender
            : request.receiver;
        const name = otherUser ? otherUser.name : "SkillShare user";

        const article = document.createElement("article");
        article.className = "card request";
        article.dataset.requestId = request.id;

        const img = document.createElement("img");
        img.className = "req-avatar";
        img.src = (otherUser && otherUser.avatar) || "assets/avatar1.svg";
        img.alt = name;
        img.onerror = () => { img.src = "assets/avatar1.svg"; };
        article.appendChild(img);

        const info = document.createElement("div");
        info.className = "req-info";

        const heading = document.createElement("h2");
        heading.textContent = request.direction === "received"
            ? `${name} wants to connect`
            : `Request sent to ${name}`;
        info.appendChild(heading);

        const idLine = document.createElement("p");
        idLine.className = "req-user-id";
        idLine.textContent = publicIdText(otherUser);
        info.appendChild(idLine);

        /* Skill chips: request skill + the other user's real DB skills */
        const chipsData = [];
        if (request.skill) chipsData.push(request.skill);
        skillList(otherUser).forEach(skill => chipsData.push(skill));
        if (chipsData.length) {
            const chips = document.createElement("div");
            chips.className = "req-chips";
            chipsData.forEach(chipText => {
                const chip = document.createElement("span");
                chip.className = "req-chip";
                chip.textContent = chipText;
                chips.appendChild(chip);
            });
            info.appendChild(chips);
        }

        const quoteParts = [];
        if (request.message) quoteParts.push("“" + request.message + "”");
        if (otherUser && otherUser.bio) quoteParts.push(otherUser.bio);
        if (quoteParts.length) {
            const message = document.createElement("p");
            message.className = "req-quote";
            message.textContent = quoteParts.join(" — ");
            info.appendChild(message);
        }

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = `Requested ${timeAgo(request.created_at)}`;
        info.appendChild(meta);

        article.appendChild(info);

        if (request.status === "pending" && request.direction === "received") {
            const actions = document.createElement("div");
            actions.className = "request-actions";
            actions.appendChild(makeButton("Accept", "small primary accept-btn", () => handleAccept(request.id)));
            actions.appendChild(makeButton("Decline", "small outline decline-btn", () => handleReject(request.id)));
            article.appendChild(actions);
        } else if (request.status === "pending" && request.direction === "sent") {
            const actions = document.createElement("div");
            actions.className = "request-actions";
            actions.appendChild(makeButton("Cancel", "small outline cancel-btn", () => handleCancel(request.id)));
            article.appendChild(actions);

            const status = document.createElement("span");
            status.className = "status";
            status.textContent = "Pending";
            article.appendChild(status);
        } else {
            const status = document.createElement("span");
            status.className = "status";
            status.textContent = statusLabel(request.status);
            article.appendChild(status);
        }

        return article;
    }

    /* Connection card: real accepted connections from PostgreSQL */
    function buildConnectionCard(connection) {
        const user = connection.user || {};
        const name = user.name || "SkillShare user";

        const article = document.createElement("article");
        article.className = "card request";

        const img = document.createElement("img");
        img.className = "req-avatar";
        img.src = user.avatar || "assets/avatar1.svg";
        img.alt = name;
        img.onerror = () => { img.src = "assets/avatar1.svg"; };
        article.appendChild(img);

        const info = document.createElement("div");
        info.className = "req-info";

        const heading = document.createElement("h2");
        heading.textContent = name;
        info.appendChild(heading);

        const idLine = document.createElement("p");
        idLine.className = "req-user-id";
        idLine.textContent = publicIdText(user);
        info.appendChild(idLine);

        const skills = skillList(user);
        if (skills.length) {
            const chips = document.createElement("div");
            chips.className = "req-chips";
            skills.forEach(skillText => {
                const chip = document.createElement("span");
                chip.className = "req-chip";
                chip.textContent = skillText;
                chips.appendChild(chip);
            });
            info.appendChild(chips);
        }

        if (user.bio) {
            const bio = document.createElement("p");
            bio.className = "req-quote";
            bio.textContent = user.bio;
            info.appendChild(bio);
        }

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = connection.connected_since
            ? `Connected ${timeAgo(connection.connected_since)}`
            : "Connected";
        info.appendChild(meta);

        article.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "request-actions";

        const messageBtn = makeButton("Message", "small primary message-btn", () => {
            window.location.href = `messages.html?user=${user.id}`;
        });
        messageBtn.disabled = !connection.conversation_id;
        actions.appendChild(messageBtn);

        const profileBtn = makeButton("View Profile", "small outline profile-btn", () => {
            window.location.href = `profile.html?id=${user.id}`;
        });
        actions.appendChild(profileBtn);

        article.appendChild(actions);
        return article;
    }

    /* Person card for the Find People tab (real DB users) */
    function buildPersonCard(user, relationship) {
        const name = user.name || "SkillShare user";
        const rel = relationship || {};

        const article = document.createElement("article");
        article.className = "card request";
        article.dataset.userId = user.id;

        const img = document.createElement("img");
        img.className = "req-avatar";
        img.src = user.avatar || "assets/avatar1.svg";
        img.alt = name;
        img.onerror = () => { img.src = "assets/avatar1.svg"; };
        article.appendChild(img);

        const info = document.createElement("div");
        info.className = "req-info";

        const headingRow = document.createElement("div");
        headingRow.className = "req-name-row";
        const heading = document.createElement("h2");
        heading.textContent = name;
        headingRow.appendChild(heading);

        if (rel.connected) {
            const pill = document.createElement("span");
            pill.className = "req-pill connected";
            pill.textContent = "✓ Connected";
            headingRow.appendChild(pill);
        } else if (rel.pending_direction) {
            const pill = document.createElement("span");
            pill.className = "req-pill pending";
            pill.textContent = rel.pending_direction === "sent"
                ? "Request Pending"
                : "Sent you a request";
            headingRow.appendChild(pill);
        }
        info.appendChild(headingRow);

        const idLine = document.createElement("p");
        idLine.className = "req-user-id";
        idLine.textContent = publicIdText(user);
        info.appendChild(idLine);

        const skills = skillList(user);
        if (skills.length) {
            const chips = document.createElement("div");
            chips.className = "req-chips";
            skills.forEach(skillText => {
                const chip = document.createElement("span");
                chip.className = "req-chip";
                chip.textContent = skillText;
                chips.appendChild(chip);
            });
            info.appendChild(chips);
        }

        if (user.bio) {
            const bio = document.createElement("p");
            bio.className = "req-quote";
            bio.textContent = user.bio;
            info.appendChild(bio);
        }

        article.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "request-actions";

        if (rel.connected) {
            const messageBtn = makeButton("Message", "small primary", () => {
                window.location.href = `messages.html?user=${user.id}`;
            });
            actions.appendChild(messageBtn);
        } else if (rel.pending_direction === "sent") {
            const pending = makeButton("Pending...", "small outline");
            pending.disabled = true;
            actions.appendChild(pending);
        } else if (rel.pending_direction === "received") {
            const respond = makeButton("Respond in Received", "small outline", () => switchTab("incoming"));
            actions.appendChild(respond);
        } else {
            actions.appendChild(
                makeButton("Send Request", "small primary send-request-btn", event => handleSendRequest(user, event.currentTarget))
            );
        }

        const profileBtn = makeButton("View Profile", "small outline profile-btn", () => {
            window.location.href = `profile.html?id=${user.id}`;
        });
        actions.appendChild(profileBtn);

        article.appendChild(actions);
        return article;
    }

    /* =====================================================
       PANEL RENDERING
    ===================================================== */

    function showLoading(panel, label) {
        if (!panel) return;
        panel.innerHTML = "";
        const loading = document.createElement("div");
        loading.className = "req-loading";
        loading.textContent = label || "Loading...";
        panel.appendChild(loading);
    }

    function renderPanels() {
        const incoming = incomingRequests();
        const outgoing = outgoingRequests();
        const past = pastRequests();

        if (incomingPanel) {
            incomingPanel.innerHTML = "";
            if (incoming.length) {
                incoming.forEach(r => incomingPanel.appendChild(buildCard(r)));
            } else {
                incomingPanel.appendChild(
                    emptyCard("No incoming requests",
                        "When someone sends you a request it will appear here.",
                        "Invite someone →", () => switchTab("discover"))
                );
            }
        }

        if (outgoingPanel) {
            outgoingPanel.innerHTML = "";
            if (outgoing.length) {
                outgoing.forEach(r => outgoingPanel.appendChild(buildCard(r)));
            } else {
                outgoingPanel.appendChild(
                    emptyCard("No sent requests",
                        "Find someone below and send your first request.",
                        "＋ Find People", () => switchTab("discover"))
                );
            }
        }

        if (connectionsPanel) {
            connectionsPanel.innerHTML = "";
            if (allConnections.length) {
                allConnections.forEach(c => connectionsPanel.appendChild(buildConnectionCard(c)));
            } else {
                connectionsPanel.appendChild(
                    emptyCard("No connections yet",
                        "Accept a request to build your first connection — or invite someone yourself.",
                        "＋ Find People", () => switchTab("discover"))
                );
            }
        }

        updateCounters();
        syncBellCount();
    }

    function updateCounters() {
        tabs.forEach(tab => {
            const span = tab.querySelector("span");
            if (!span) return;
            if (tab.dataset.tab === "incoming") span.textContent = incomingRequests().length;
            if (tab.dataset.tab === "outgoing") span.textContent = outgoingRequests().length;
            if (tab.dataset.tab === "connections") span.textContent = allConnections.length;
        });
    }

    /* =====================================================
       LOAD DATA FROM API (PostgreSQL)
    ===================================================== */

    async function loadRequests() {
        showLoading(incomingPanel);
        try {
            const data = await window.SkillShareAPI.listRequests();
            allRequests = (data && data.requests) || [];
            renderPanels();
        } catch (error) {
            if (error && error.status === 401) {
                showToast("Your session has expired. Please log in again.");
                setTimeout(() => { window.location.href = "login.html"; }, 1200);
                return;
            }
            showToast(error && error.detail
                ? error.detail
                : "Unable to load requests. Please try again.");
            if (incomingPanel) {
                incomingPanel.innerHTML = "";
                incomingPanel.appendChild(
                    emptyCard("Could not load requests", "Please try again later.")
                );
            }
        }
    }

    async function loadConnections() {
        try {
            const data = await window.SkillShareAPI.getConnections();
            allConnections = (data && data.connections) || [];
            renderPanels();
        } catch (error) {
            if (error && error.status === 401) return;
            if (connectionsPanel) {
                connectionsPanel.innerHTML = "";
                connectionsPanel.appendChild(
                    emptyCard("Could not load connections", "Please try again later.")
                );
            }
        }
    }

    /* Real notification badge: received pending requests + unread messages. */
    async function syncBellCount() {
        try {
            const [convData] = await Promise.all([
                window.SkillShareAPI.getConversations(),
            ]);
            const unread = ((convData && convData.conversations) || [])
                .reduce((sum, c) => sum + (c.unread_count || 0), 0);
            const bell = document.getElementById("bellCount");
            if (bell) {
                bell.textContent = incomingRequests().length + unread;
                bell.style.display = (incomingRequests().length + unread) ? "" : "none";
            }
        } catch (error) {
            /* Keep the badge hidden if the backend is unreachable. */
        }
    }

    /* =====================================================
       FIND PEOPLE — server-side search with live suggestions
    ===================================================== */

    const suggestionsEl = document.getElementById("peopleSuggestions");
    const clearBtn = document.getElementById("peopleSearchClear");
    let activeSuggestion = -1;

    function hideSuggestions() {
        if (suggestionsEl) suggestionsEl.classList.remove("show");
        activeSuggestion = -1;
    }

    function updateRelationshipSets() {
        connectedIds = new Set(allConnections.map(c => c.user && String(c.user.id)));
        pendingSentIds = new Set(
            allRequests
                .filter(r => r.status === "pending" && r.direction === "sent")
                .map(r => r.receiver && String(r.receiver.id))
        );
        pendingReceivedIds = new Set(
            allRequests
                .filter(r => r.status === "pending" && r.direction === "received")
                .map(r => r.sender && String(r.sender.id))
        );
    }

    function relationshipForUser(user) {
        const id = String(user.id);
        return {
            connected: connectedIds.has(id),
            pending_direction: pendingSentIds.has(id)
                ? "sent"
                : pendingReceivedIds.has(id) ? "received" : null,
        };
    }

    /* Dropdown of matching people under the search box. */
    function renderSuggestions(users) {
        if (!suggestionsEl) return;
        suggestionsEl.innerHTML = "";

        if (!users.length) {
            suggestionsEl.classList.remove("show");
            return;
        }

        users.slice(0, 8).forEach((user, index) => {
            const rel = relationshipForUser(user);
            const item = document.createElement("button");
            item.type = "button";
            item.className = "suggestion-item" + (index === activeSuggestion ? " active" : "");
            item.dataset.index = String(index);

            const img = document.createElement("img");
            img.className = "suggestion-avatar";
            img.src = user.avatar || "assets/avatar1.svg";
            img.alt = user.name || "";
            img.onerror = () => { img.src = "assets/avatar1.svg"; };

            const info = document.createElement("span");
            info.className = "suggestion-info";
            const name = document.createElement("strong");
            name.textContent = user.name || "SkillShare user";
            const skills = document.createElement("small");
            const skillParts = skillList(user).join(" · ");
            skills.textContent = [
                skillParts || "Member",
                user.public_id ? `ID: ${user.public_id}` : null,
            ].filter(Boolean).join(" · ");
            info.append(name, skills);

            const action = document.createElement("span");
            action.className = "suggestion-action";

            if (rel.connected) {
                action.className = "suggestion-action pill connected";
                action.textContent = "✓ Connected";
            } else if (rel.pending_direction === "sent") {
                action.className = "suggestion-action pill pending";
                action.textContent = "Pending";
            } else if (rel.pending_direction === "received") {
                action.className = "suggestion-action pill received";
                action.textContent = "Sent you one";
            } else {
                const send = document.createElement("button");
                send.type = "button";
                send.className = "suggestion-send";
                send.textContent = "＋ Request";
                send.addEventListener("click", (event) => {
                    event.stopPropagation();
                    handleSendRequest(user, send);
                });
                action.appendChild(send);
            }

            item.append(img, info, action);

            /* Clicking the row selects the person and shows their card. */
            item.addEventListener("click", () => {
                if (peopleSearch) peopleSearch.value = user.name || "";
                hideSuggestions();
                loadPeople(true);
            });

            suggestionsEl.appendChild(item);
        });

        suggestionsEl.classList.add("show");
    }

    async function loadPeople(showLoadingState) {
        if (!peopleResults) return;
        if (showLoadingState) showLoading(peopleResults, "Loading people...");
        try {
            const term = peopleSearch ? peopleSearch.value.trim() : "";
            const data = term
                ? await window.SkillShareAPI.searchUsers(term)
                : await window.SkillShareAPI.listUsers();
            const users = (data && data.users) || [];

            updateRelationshipSets();
            renderSuggestions(users);
            if (clearBtn) clearBtn.style.display = term ? "" : "none";

            peopleResults.innerHTML = "";
            if (!users.length) {
                peopleResults.appendChild(
                    emptyCard("No people found", term
                        ? `Nobody matches that name or skill. Try another search.`
                        : "No other members have signed up yet.")
                );
                return;
            }

            users.forEach(user => {
                peopleResults.appendChild(buildPersonCard(user, relationshipForUser(user)));
            });
        } catch (error) {
            if (error && error.status === 401) {
                showToast("Your session has expired. Please log in again.");
                setTimeout(() => { window.location.href = "login.html"; }, 1200);
                return;
            }
            if (peopleResults) {
                peopleResults.innerHTML = "";
                peopleResults.appendChild(
                    emptyCard("Could not load people", "Please make sure the backend is running.")
                );
            }
            console.error("Find People error:", error);
        }
    }

    function runPeopleSearch() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadPeople(true), 180);
    }

    if (peopleSearch) {
        peopleSearch.addEventListener("input", runPeopleSearch);

        /* Keyboard navigation for the suggestions dropdown. */
        peopleSearch.addEventListener("keydown", (event) => {
            const items = suggestionsEl ? suggestionsEl.querySelectorAll(".suggestion-item") : [];
            if (!items.length) return;

            if (event.key === "ArrowDown") {
                event.preventDefault();
                activeSuggestion = (activeSuggestion + 1) % items.length;
            } else if (event.key === "ArrowUp") {
                event.preventDefault();
                activeSuggestion = (activeSuggestion - 1 + items.length) % items.length;
            } else if (event.key === "Enter" && activeSuggestion >= 0) {
                event.preventDefault();
                items[activeSuggestion].click();
                return;
            } else if (event.key === "Escape") {
                hideSuggestions();
                return;
            } else {
                return;
            }

            items.forEach((item, index) => {
                item.classList.toggle("active", index === activeSuggestion);
            });
        });

        peopleSearch.addEventListener("blur", () => {
            setTimeout(hideSuggestions, 150);
        });
        peopleSearch.addEventListener("focus", () => {
            if (suggestionsEl && suggestionsEl.children.length) {
                suggestionsEl.classList.add("show");
            }
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (peopleSearch) peopleSearch.value = "";
            hideSuggestions();
            loadPeople(true);
            peopleSearch.focus();
        });
    }

    /* Header quick actions: Find People + Refresh */
    const findPeopleBtn = document.getElementById("findPeopleBtn");
    if (findPeopleBtn) {
        findPeopleBtn.addEventListener("click", () => switchTab("discover"));
    }

    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            refreshBtn.disabled = true;
            refreshBtn.textContent = "Refreshing...";
            await Promise.all([loadRequests(), loadConnections()]);
            refreshBtn.disabled = false;
            refreshBtn.textContent = "⟳ Refresh";
            showToast("Up to date.");
        });
    }

    /* =====================================================
       ACTIONS
    ===================================================== */

    function setBusy(card, busy, label) {
        if (!card) return;
        const actions = card.querySelector(".request-actions");
        if (!actions) return;
        actions.querySelectorAll("button").forEach(button => {
            button.disabled = busy;
            if (busy && button.classList.contains("accept-btn")) {
                button.textContent = label;
            }
        });
    }

    async function handleAccept(id) {
        const card = document.querySelector(`[data-request-id="${id}"]`);
        setBusy(card, true, "Accepting...");
        try {
            const result = await window.SkillShareAPI.acceptRequest(id);
            const who = result && result.request && result.request.sender
                ? result.request.sender.name
                : "them";
            showToast(`You're now connected with ${who}! You can start chatting in Messages.`);
            await Promise.all([loadRequests(), loadConnections()]);
        } catch (error) {
            setBusy(card, false, "Accept");
            showToast(error && error.detail
                ? error.detail
                : "Unable to accept the request. Please try again.");
        }
    }

    async function handleReject(id) {
        const card = document.querySelector(`[data-request-id="${id}"]`);
        setBusy(card, true, "Declining...");
        try {
            await window.SkillShareAPI.rejectRequest(id);
            showToast("Request declined.");
            await loadRequests();
        } catch (error) {
            setBusy(card, false, "Decline");
            showToast(error && error.detail
                ? error.detail
                : "Unable to decline the request. Please try again.");
        }
    }

    async function handleCancel(id) {
        const card = document.querySelector(`[data-request-id="${id}"]`);
        setBusy(card, true, "Cancelling...");
        try {
            await window.SkillShareAPI.cancelRequest(id);
            showToast("Request cancelled.");
            await loadRequests();
        } catch (error) {
            setBusy(card, false, "Cancel");
            showToast(error && error.detail
                ? error.detail
                : "Unable to cancel the request. Please try again.");
        }
    }

    async function handleSendRequest(user, button) {
        if (!button) return;
        button.disabled = true;
        button.textContent = "Sending...";
        try {
            await window.SkillShareAPI.sendRequest(
                user.id,
                "I'd love to connect and learn together!",
                null,
                null
            );
            button.classList.add("sent");
            button.textContent = "Request Sent ✓";
            showToast(`Request sent to ${user.name || "them"}. They will see it in their Received tab.`);
            /* Refresh the Sent tab in the background. The Find People
               cards are not re-rendered, so button state is kept. */
            await loadRequests();
        } catch (error) {
            button.disabled = false;
            button.textContent = "Send Request";
            showToast(error && error.detail
                ? error.detail
                : "Unable to send the request. Please try again.");
        }
    }

    /* =====================================================
       AUTH EXPIRED GLOBAL
    ===================================================== */

    document.addEventListener("skillshare:auth-expired", () => {
        showToast("Your session has expired. Please log in again.");
        setTimeout(() => { window.location.href = "login.html"; }, 1200);
    });

    /* =====================================================
       INITIALIZE
    ===================================================== */

    loadRequests();
    loadConnections();
});
