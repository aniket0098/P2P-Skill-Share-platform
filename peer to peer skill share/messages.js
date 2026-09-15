/* =========================================================
   SKILLSHARE — COMMUNICATION HUB (messages.js)
   Real conversations, real messages, real profiles.
   Data source: FastAPI /api/communication/* (JWT protected).
   Realtime: WebSocket /ws/communication (+ WebRTC calls).
   ========================================================= */

(() => {
    "use strict";

    const API = window.SkillShareAPI;
    const $ = (id) => document.getElementById(id);

    /* ---------------- state ---------------- */
    const state = {
        me: null,
        conversations: [],
        convById: new Map(),
        calls: [],
        activeId: null,
        active: null,
        messages: [],
        msgById: new Map(),
        filter: "all",
        search: "",
        replyTo: null,
        editingId: null,
        typingTimers: new Map(),
        peerTyping: new Map(),
        presence: new Map(),
        ws: null,
        wsUp: false,
        wsWanted: false,
        call: null,
        infoLoaded: false,
    };

    /* ---------------- dom cache ---------------- */
    const el = {};
    // Null-safe helpers: individual missing elements must never crash init.
    function on(elm, evt, fn, opts) {
        if (elm && elm.addEventListener) elm.addEventListener(evt, fn, opts);
    }
    function setHidden(elm, hidden) {
        if (elm) elm.hidden = hidden !== false;
    }
    function setHTML(elm, html) {
        if (elm) elm.innerHTML = html;
    }
    function setText(elm, text) {
        if (elm) elm.textContent = text == null ? "" : String(text);
    }
    function cacheDom() {
        // Navigation + panes
        for (const id of [
            "navUnreadBadge", "messagesNavBadge", "convCount", "newChatBtn", "newGroupBtn",
            "convSearch", "convFilters", "filterUnreadCount", "conversationList",
            "chatPanel", "mobileBack", "chatUserBtn", "chatAvatarWrap", "chatName", "chatStatus",
            "chatSearchBtn", "voiceCallBtn", "videoCallBtn", "infoBtn", "chatMoreBtn",
            "chatSearchBar", "msgSearchInput", "msgSearchCount", "msgSearchClose",
            "pinnedBar", "pinnedBody", "pinnedClose",
            "chatBody", "chatEmpty", "emptyFindPeople", "emptyCreateGroup",
            "typingRow", "typingText", "replyBar", "replyPreview", "replyCancel",
            "composer", "attachBtn", "fileInput", "emojiBtn", "emojiPicker",
            "composerInput", "sendBtn", "uploadBar", "uploadText",
            "profileDropdownContainer",
            "infoPanel", "infoClose", "infoScroll", "infoAvatarWrap", "infoName",
            "infoSubtitle", "infoPresence", "infoActions", "infoTabs", "infoBody",
            "modalBackdrop", "toastStack", "peopleModal",
        ]) el[id] = $(id);

        // Aliases so logic code can use stable logical names.
        el.toastZone = el.toastStack;
        el.profileModalBody = $("profileDrawerBody");
        el.profileModalClose = $("profileDrawerClose");

        // People / group modal
        for (const id of [
            "peopleModalTitle", "peopleModalClose", "peopleSearchInput", "peopleList",
            "groupNameRow", "groupNameInput", "peopleModalFoot", "selectedCount",
            "createGroupConfirm", "forwardModal", "forwardModalClose", "forwardList",
        ]) el[id] = $(id);
        el.peopleModalBody = el.peopleList;
        el.forwardModalBody = el.forwardList;

        // Incoming call
        el.incomingModal = $("incomingCallModal");
        el.incomingAvatarWrap = $("incomingAvatarWrap");
        el.incomingTitle = $("incomingCaller");
        el.incomingSub = $("incomingCallType");
        el.incomingAccept = $("callAcceptBtn");
        el.incomingDecline = $("callDeclineBtn");

        // Call screen
        for (const id of [
            "callScreen", "callPeerName", "callStateText", "callFullscreenBtn",
            "callVideos", "remoteVideo", "localVideo",
            "callMuteBtn", "callCamBtn", "callShareBtn", "callEndBtn",
        ]) el[id] = $(id);
        el.callState = el.callStateText;
        el.callGrid = el.callVideos;
        el.callLocalVideo = el.localVideo;

        // Image preview modal (created lazily if missing)
        el.imageModal = $("imageModal");
        if (!el.imageModal) {
            const wrap = document.createElement("div");
            wrap.className = "modal";
            wrap.id = "imageModal";
            wrap.hidden = true;
            wrap.setAttribute("aria-label", "Image preview");
            wrap.innerHTML =
                '<div class="modal-panel image-modal-panel">' +
                '<div class="modal-head"><h3 id="imageModalName">Image</h3>' +
                '<button class="icon-btn" id="imageModalClose" title="Close" aria-label="Close">×</button></div>' +
                '<img id="imageModalImg" alt="Image preview">' +
                '<div class="modal-foot"><a class="btn btn-ghost" id="imageModalDownload" download>Download</a></div>' +
                '</div>';
            document.body.appendChild(wrap);
            el.imageModal = wrap;
            el.imageModalImg = $("imageModalImg");
            el.imageModalName = $("imageModalName");
            el.imageModalDownload = $("imageModalDownload");
            el.imageModalClose = $("imageModalClose");
        }
    }


    /* ---------------- small utils ---------------- */
    function esc(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    function fmtTime(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    function fmtListStamp(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return fmtTime(iso);
        const yest = new Date(now); yest.setDate(now.getDate() - 1);
        if (d.toDateString() === yest.toDateString()) return "Yesterday";
        if (now - d < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
    }
    function fmtDayLabel(iso) {
        const d = new Date(iso);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return "Today";
        const yest = new Date(now); yest.setDate(now.getDate() - 1);
        if (d.toDateString() === yest.toDateString()) return "Yesterday";
        return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
    }
    function fmtDuration(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    }
    function fmtBytes(n) {
        if (!n && n !== 0) return "";
        if (n < 1024) return `${n} B`;
        if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1048576).toFixed(1)} MB`;
    }
    function lastSeenLabel(lastSeen) {
        if (!lastSeen) return "Offline";
        const mins = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000);
        if (mins < 1) return "Last seen just now";
        if (mins < 60) return `Last seen ${mins}m ago`;
        const h = Math.floor(mins / 60);
        if (h < 24) return `Last seen ${h}h ago`;
        return `Last seen ${fmtListStamp(lastSeen)}`;
    }
    function authErr(err) {
        if (err && err.status === 401) { window.location.href = "login.html"; return true; }
        return false;
    }
    function toast(kind, title, body) {
        if (!el.toastZone) return;
        const t = document.createElement("div");
        t.className = `toast toast-${kind}`;
        t.innerHTML = `<strong>${esc(title)}</strong>${body ? `<span>${esc(body)}</span>` : ""}`;
        el.toastZone.appendChild(t);
        setTimeout(() => t.classList.add("show"), 10);
        setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 350); }, 4200);
    }
    function apiFail(err, fallback) {
        if (authErr(err)) return;
        toast("error", fallback || "Something went wrong", err && err.message ? err.message : "");
    }
    const isMine = (m) => m && Number(m.sender_id) === Number(state.me && state.me.id);


    /* Consistent initials-avatar fallback (never a broken image). */
    const AVATAR_HUES = [212, 262, 172, 22, 322, 92];
    function initialsAvatar(name, seed) {
        const letters = String(name || "?").trim().split(/\s+/)
            .slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "?";
        const hue = AVATAR_HUES[Math.abs(seed || 0) % AVATAR_HUES.length];
        const svg =
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'>` +
            `<rect width='96' height='96' rx='48' fill='hsl(${hue},45%,26%)'/>` +
            `<text x='48' y='60' font-family='Inter,Arial,sans-serif' font-size='36' ` +
            `font-weight='700' text-anchor='middle' fill='hsl(${hue},80%,82%)'>${letters}</text></svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    /** <img> with real avatar_url + initials fallback on error. */
    function avatarImg(url, name, seed, cls, alt) {
        const fallback = initialsAvatar(name, seed);
        const safeUrl = url ? API.attachmentUrl(url) : fallback;
        return `<img class="${cls || ""}" src="${esc(safeUrl)}" alt="${esc(alt || name || "User")}"
            loading="lazy" decoding="async"
            onerror="this.onerror=null;this.src='${fallback.replace(/'/g, "&#39;")}'">`;
    }

    function updateUnreadBadges(totalUnread) {
        const set = (node, n) => {
            if (!node) return;
            node.textContent = n > 99 ? "99+" : String(n);
            node.hidden = !n;
        };
        set(el.navUnreadBadge, totalUnread);
        set(el.messagesNavBadge, totalUnread);
        const unreadConvs = state.conversations.filter((c) => c.unread_count > 0).length;
        set(el.filterUnreadCount, unreadConvs);
    }


    /* -----------------------------------------------------
       CONVERSATION LIST
    ----------------------------------------------------- */
    async function loadConversations() {
        try {
            const data = await API.commListConversations();
            state.conversations = data.conversations || [];
            state.convById.clear();
            for (const c of state.conversations) state.convById.set(c.id, c);
            updateUnreadBadges(data.total_unread || 0);
            renderConversationList();
        } catch (err) {
            if (authErr(err)) return;
            toast("error", "Could not load conversations", err.message);
            if (el.conversationList) {
                el.conversationList.innerHTML = `<div class="list-empty"><div class="empty-art">⚠️</div>
                    <h3>Backend unavailable</h3><p>${esc(err.message)}</p>
                    <button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
            }
        }
    }

    function filterConversations() {
        const q = state.search.trim().toLowerCase();
        return state.conversations.filter((c) => {
            if (state.filter === "unread" && !(c.unread_count > 0)) return false;
            if (state.filter === "groups" && !c.is_group) return false;
            if (state.filter === "archived" && !c.is_archived) return false;
            if ((state.filter === "all" || state.filter === "unread" ||
                 state.filter === "groups") && c.is_archived) return false;
            if (q) {
                const hay = `${c.name || ""} ${c.last_message ? c.last_message.content || "" : ""} ` +
                    `${(c.members || []).map((m) => m.name).join(" ")}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function convTitle(c) {
        if (!c) return "Select a conversation";
        return c.is_group ? (c.group_name || "Group chat") : (c.name || "SkillShare user");
    }
    function convAvatarUrl(c) {
        if (!c) return null;
        return c.is_group ? (c.group_avatar_url || null) : (c.avatar || null);
    }
    function presenceOf(c) {
        if (!c) return { online: false };
        if (c.is_group) return { online: (c.online_count || 0) > 0 };
        const ou = c.other_user;
        if (!ou) return { online: false };
        return state.presence.get(ou.id) || { online: !!ou.online, last_seen: ou.last_seen };
    }
    function lastMsgPreview(c) {
        if (!c) return "No messages yet";
        const m = c.last_message;
        if (!m) return "No messages yet";
        if (m.is_deleted) return "Message deleted";
        if (m.attachment) {
            const icon = m.attachment.kind === "image" ? "🖼️" : m.attachment.kind === "pdf" ? "📄" : "📎";
            return `${icon} ${m.attachment.original_name || "Attachment"}`;
        }
        return m.content || "";
    }


    function convCard(c) {
        const p = presenceOf(c);
        const unread = c.unread_count || 0;
        const flags = c.is_pinned ? `<span class="cv-flag" title="Pinned">📌</span>` : "";
        const onlineDot = (!c.is_group && p.online)
            ? `<span class="online-dot" title="Online"></span>` : "";
        const badge = unread ? `<span class="unread-pill">${unread > 99 ? "99+" : unread}</span>` : "";
        const memberNote = c.is_group
            ? `<span class="cv-members">👪 ${c.member_count || (c.members || []).length}</span>` : "";
        return `<article class="conv-card${unread ? " unread" : ""}${c.id === state.activeId ? " active" : ""}"
            data-id="${c.id}" role="listitem">
            <span class="conv-avatar">${avatarImg(convAvatarUrl(c), convTitle(c), c.id, "", convTitle(c))}${onlineDot}</span>
            <span class="conv-mid">
                <span class="conv-top"><strong>${esc(convTitle(c))}</strong>${flags}
                    <time>${esc(fmtListStamp(c.updated_at || (c.last_message && c.last_message.created_at)))}</time></span>
                <span class="conv-bottom"><span class="cv-preview">${esc(lastMsgPreview(c))}</span>
                    ${memberNote}${c.is_muted ? `<span class="cv-muted" title="Muted">🔕</span>` : ""}${badge}</span>
            </span>
            <button class="conv-menu-btn" data-id="${c.id}" title="Conversation options" aria-label="Options">⋮</button>
        </article>`;
    }

    function renderConversationList() {
        if (!el.conversationList) return;
        if (state.filter === "calls") { renderCallHistory(); return; }
        const rows = filterConversations();
        if (el.convCount) {
            const n = state.conversations.length;
            el.convCount.textContent = `${n} conversation${n === 1 ? "" : "s"}`;
        }
        if (!rows.length) {
            const emptyBy = {
                all: ["💬", "Start a conversation", "Find people and start sharing knowledge."],
                unread: ["✅", "All caught up", "No unread messages right now."],
                groups: ["👪", "No groups yet", "Create a group to collaborate with several people."],
                archived: ["📦", "Nothing archived", "Archived conversations will appear here."],
            };
            const [art, title, body] = emptyBy[state.filter] || emptyBy.all;
            el.conversationList.innerHTML = `<div class="list-empty"><div class="empty-art">${art}</div>
                <h3>${esc(title)}</h3><p>${esc(body)}</p>
                ${state.filter === "all" ? `<div class="empty-actions">
                    <button class="btn btn-primary" id="emptyFindPeople2">Find People</button>
                    <button class="btn btn-ghost" id="emptyCreateGroup2">Create Group</button></div>` : ""}
                </div>`;
            const fp = $("emptyFindPeople2"), cg = $("emptyCreateGroup2");
            if (fp) fp.addEventListener("click", () => openPeopleModal("chat"));
            if (cg) cg.addEventListener("click", () => openGroupModal());
            return;
        }
        el.conversationList.innerHTML = rows.map((c) => convCard(c)).join("");
        for (const card of el.conversationList.querySelectorAll(".conv-card")) {
            card.addEventListener("click", () => openConversation(Number(card.dataset.id)));
        }
        for (const btn of el.conversationList.querySelectorAll(".conv-menu-btn")) {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openConvMenu(Number(btn.dataset.id), e);
            });
        }
    }


    /* -----------------------------------------------------
       OPEN CONVERSATION + CHAT HEADER
    ----------------------------------------------------- */
    async function openConversation(id, focusMessageId) {
        state.activeId = id;
        state.replyTo = null;
        state.editingId = null;
        hideReplyBar();
        renderConversationList();
        document.body.classList.add("chat-open");
        setChatLoading();
        try {
            state.active = await API.commGetConversation(id);
            if (state.active && state.active.conversation) state.active = state.active.conversation;
            renderChatHeader();
            renderInfoPanel();
            const data = await API.commGetMessages(id);
            state.messages = (data && (data.messages || data.items)) || [];
            state.msgById.clear();
            for (const m of state.messages) state.msgById.set(m.id, m);
            renderMessages();
            if (focusMessageId) highlightMessage(focusMessageId);
            const conv = state.active;
            if (conv && conv.unread_count > 0) {
                API.commMarkRead(id).then((r) => {
                    conv.unread_count = 0;
                    updateUnreadBadges(r && r.total_unread || 0);
                    if (state.filter !== "calls") renderConversationList();
                }).catch(() => {});
            }
        } catch (err) {
            if (authErr(err)) return;
            if (err && err.status === 403) {
                showChatError("Not a member", "You are not a participant of this conversation.");
            } else if (err && err.status === 404) {
                showChatError("Conversation not found", "It may have been deleted.");
            } else {
                showChatError("Could not open conversation", err.message || "");
            }
        }
    }

    function setChatLoading() {
        if (!el.chatBody) return;
        el.chatBody.innerHTML = `<div class="chat-loading">
            ${Array.from({ length: 4 }, (_, i) =>
                `<div class="skel-msg ${i % 2 ? "mine" : ""}"><span class="skel skel-bubble"></span></div>`).join("")}
        </div>`;
        if (el.chatName) el.chatName.textContent = "Loading…";
    }

    function showChatError(title, body) {
        if (!el.chatBody) return;
        el.chatBody.innerHTML = `<div class="list-empty"><div class="empty-art">😕</div>
            <h3>${esc(title)}</h3><p>${esc(body)}</p>
            <div class="empty-actions"><button class="btn btn-primary" onclick="location.reload()">Reload</button></div></div>`;
    }

    function renderChatHeader() {
        const c = state.active;
        if (!c || !el.chatName) return;
        const title = convTitle(c);
        el.chatName.textContent = title;
        if (el.chatAvatarWrap) {
            const p = presenceOf(c);
            const dot = (!c.is_group && p.online) ? `<span class="online-dot lg"></span>` : "";
            el.chatAvatarWrap.innerHTML =
                avatarImg(convAvatarUrl(c), title, c.id, "chat-head-avatar", title) + dot;
        }
        if (el.chatStatus) {
            let status;
            if (c.is_group) {
                const online = c.online_count || 0;
                status = `${c.member_count || (c.members || []).length} members` +
                    (online ? `, ${online} online` : "");
            } else {
                const ou = c.other_user || {};
                const p = presenceOf(c);
                status = p.online ? "🟢 Online" : lastSeenLabel(p.last_seen || ou.last_seen);
            }
            el.chatStatus.innerHTML = `<i></i> ${esc(status)}`;
        }
    }


    /* -----------------------------------------------------
       MESSAGE RENDERING
    ----------------------------------------------------- */
    function linkify(content, query) {
        let html = esc(content);
        html = html.replace(/(https?:\/\/[^\s<]+)/g, (m) =>
            `<a href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`);
        if (query) {
            html = html.replace(new RegExp(escapeRe(esc(query)), "gi"),
                (m) => `<mark>${m}</mark>`);
        }
        return html;
    }

    function senderOf(m) {
        const c = state.active;
        if (!c) return null;
        return (c.members || []).find((u) => Number(u.id) === Number(m.sender_id)) || null;
    }

    function attachmentHtml(m) {
        const a = m.attachment;
        if (!a) return "";
        const url = API.attachmentUrl(a.url);
        if (a.kind === "image") {
            return `<figure class="msg-image" data-att-id="${a.id}">
                <img src="${esc(url)}" alt="${esc(a.original_name || "Image")}" loading="lazy"
                     onerror="this.closest('figure').classList.add('img-broken')">
                <figcaption>${esc(a.original_name || "")} · ${esc(fmtBytes(a.size_bytes))}</figcaption>
            </figure>`;
        }
        const icon = a.kind === "pdf" ? "📄" : "📎";
        return `<a class="msg-file" href="${esc(url)}" download="${esc(a.original_name || "file")}">
            <span class="file-ico">${icon}</span>
            <span class="file-meta"><strong>${esc(a.original_name || "Attachment")}</strong>
            <small>${esc((a.mime_type || "").split("/").pop())} · ${esc(fmtBytes(a.size_bytes))}</small></span>
            <span class="file-dl">⬇</span></a>`;
    }

    function replyQuoteHtml(m) {
        const r = m.reply_to;
        if (!r) return "";
        const name = r.sender_name || "Message";
        return `<blockquote class="msg-quote" data-quote="${r.id}">
            <strong>${esc(name)}</strong><span>${esc((r.content || "").slice(0, 120))}</span></blockquote>`;
    }

    function reactionsHtml(m) {
        const groups = m.reactions || {};
        const keys = Object.keys(groups);
        if (!keys.length) return "";
        return `<div class="msg-reactions">${keys.map((emoji) =>
            `<button class="reaction-chip${groups[emoji].includes(Number(state.me && state.me.id)) ? " mine" : ""}"
                data-msg="${m.id}" data-emoji="${esc(emoji)}"
                title="${esc(groups[emoji].join(", "))}">${esc(emoji)} ${groups[emoji].length}</button>`
        ).join("")}</div>`;
    }

    function messageHtml(m, prev) {
        const mine = isMine(m);
        const showAvatar = state.active && state.active.is_group && !mine &&
            (!prev || prev.sender_id !== m.sender_id);
        const sender = senderOf(m);
        const edited = m.is_edited ? `<span class="msg-edited">(edited)</span>` : "";
        const readTick = mine
            ? (m.is_read ? `<span class="tick read" title="Read">✓✓</span>`
                         : `<span class="tick" title="Sent">✓</span>`)
            : "";
        const newDay = !prev || fmtDayLabel(prev.created_at) !== fmtDayLabel(m.created_at);
        const dayChip = newDay
            ? `<div class="date-chip">${esc(fmtDayLabel(m.created_at))}</div>` : "";
        return `${dayChip}
        <div class="msg-row ${mine ? "mine" : "theirs"}" data-mid="${m.id}" id="msg-${m.id}">
            ${!mine && state.active && state.active.is_group
                ? `<span class="msg-avatar">${showAvatar
                    ? avatarImg(sender && sender.avatar_url, sender ? sender.name : "?", m.sender_id, "", sender ? sender.name : "")
                    : ""}</span>` : ""}
            <div class="bubble${m.is_deleted ? " deleted" : ""}">
                ${!mine && state.active && state.active.is_group && showAvatar
                    ? `<span class="msg-sender">${esc(sender ? sender.name : "Member")}</span>` : ""}
                ${replyQuoteHtml(m)}
                ${m.is_deleted
                    ? `<span class="deleted-note">This message was deleted</span>`
                    : `${attachmentHtml(m)}${m.content ? `<p class="msg-text">${linkify(m.content)}</p>` : ""}`}
                ${m.is_pinned ? `<span class="pin-tag" title="Pinned">📌</span>` : ""}
                <span class="msg-meta"><time>${esc(fmtTime(m.created_at))}</time>${edited}${readTick}</span>
                ${reactionsHtml(m)}
            </div>
            ${m.is_deleted ? "" : `<button class="msg-menu-btn" data-mid="${m.id}"
                title="Message options" aria-label="Message options">⋯</button>`}
        </div>`;
    }

    function renderMessages() {
        if (!el.chatBody) return;
        if (!state.messages.length) {
            el.chatBody.innerHTML = `<div class="list-empty"><div class="empty-art">🤝</div>
                <h3>You're connected</h3><p>Start the conversation — say hello!</p></div>`;
            return;
        }
        let html = "";
        let prev = null;
        for (const m of state.messages) {
            html += messageHtml(m, prev);
            prev = m;
        }
        el.chatBody.innerHTML = html;
        bindMessageEvents();
        el.chatBody.scrollTop = el.chatBody.scrollHeight;
        renderPinnedBar();
    }

    function rerenderAll() { renderMessages(); }

    function highlightMessage(mid) {
        const node = document.getElementById(`msg-${mid}`);
        if (!node) return;
        node.scrollIntoView({ behavior: "smooth", block: "center" });
        node.classList.add("highlighted");
        setTimeout(() => node.classList.remove("highlighted"), 2500);
    }


    /* -----------------------------------------------------
       MESSAGE ACTIONS
    ----------------------------------------------------- */
    function bindMessageEvents() {
        if (!el.chatBody) return;
        el.chatBody.querySelectorAll(".msg-menu-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openMsgMenu(Number(btn.dataset.mid), e);
            });
        });
        el.chatBody.querySelectorAll(".reaction-chip").forEach((chip) => {
            chip.addEventListener("click", async () => {
                try {
                    const r = await API.commToggleReaction(Number(chip.dataset.msg), chip.dataset.emoji);
                    applyMessageUpdate(r.message);
                } catch (err) { apiFail(err, "Reaction failed"); }
            });
        });
        el.chatBody.querySelectorAll(".msg-image img").forEach((img) => {
            img.addEventListener("click", () => openImageModal(img));
        });
        el.chatBody.querySelectorAll(".msg-quote").forEach((q) => {
            q.addEventListener("click", () => highlightMessage(Number(q.dataset.quote)));
        });
    }

    function openMsgMenu(mid, ev) {
        const m = state.msgById.get(mid);
        if (!m || m.is_deleted) return;
        closeMenus();
        const mine = isMine(m);
        const canPin = state.active && (!state.active.is_group ||
            (state.active.members || []).some((u) =>
                Number(u.id) === Number(state.me && state.me.id) && u.role === "admin")) || mine;
        const menu = document.createElement("div");
        menu.className = "ctx-menu msg-ctx";
        menu.innerHTML = `
            <button data-act="reply">↩ Reply</button>
            <button data-act="copy">⧉ Copy text</button>
            <div class="ctx-emojis">${REACTIONS.map((e2) =>
                `<button data-act="react" data-emoji="${e2}">${e2}</button>`).join("")}</div>
            ${canPin ? `<button data-act="pin">📌 ${m.is_pinned ? "Unpin" : "Pin"}</button>` : ""}
            <button data-act="forward">➦ Forward</button>
            ${mine ? `<button data-act="edit">✎ Edit</button>
                      <button data-act="delete" class="danger">🗑 Delete</button>` : ""}`;
        document.body.appendChild(menu);
        const r = ev.target.getBoundingClientRect();
        menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 12, r.bottom + 6) + "px";
        menu.style.left = Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, r.left - 40)) + "px";
        menu.addEventListener("click", (e) => {
            const act = e.target.closest("button") && e.target.closest("button").dataset.act;
            if (!act) return;
            closeMenus();
            if (act === "reply") startReply(m);
            else if (act === "copy") copyText(m.content || "");
            else if (act === "react") toggleReaction(mid, e.target.dataset.emoji);
            else if (act === "pin") togglePin(mid);
            else if (act === "forward") openForwardModal(m);
            else if (act === "edit") startEdit(m);
            else if (act === "delete") deleteMessage(mid);
        });
    }

    const REACTIONS = ["👍", "❤️", "😂", "🎯", "🔥", "👏"];

    function closeMenus() {
        document.querySelectorAll(".ctx-menu").forEach((n) => n.remove());
    }

    async function toggleReaction(mid, emoji) {
        try {
            const r = await API.commToggleReaction(mid, emoji);
            applyMessageUpdate(r.message);
        } catch (err) { apiFail(err, "Reaction failed"); }
    }
    async function togglePin(mid) {
        try {
            const r = await API.commPinMessage(mid);
            applyMessageUpdate(r.message);
            toast("success", r.is_pinned ? "Message pinned" : "Message unpinned");
        } catch (err) { apiFail(err, "Could not pin"); }
    }
    async function deleteMessage(mid) {
        if (!confirm("Delete this message? This cannot be undone.")) return;
        try {
            const r = await API.commDeleteMessage(mid);
            applyMessageUpdate(r.message);
        } catch (err) { apiFail(err, "Could not delete"); }
    }
    function copyText(text) {
        navigator.clipboard.writeText(text)
            .then(() => toast("success", "Copied to clipboard"))
            .catch(() => toast("error", "Copy failed"));
    }
    function applyMessageUpdate(payload) {
        if (!payload) return;
        const idx = state.messages.findIndex((m) => m.id === payload.id);
        if (idx >= 0) state.messages[idx] = payload;
        else state.messages.push(payload);
        state.msgById.set(payload.id, payload);
        renderMessages();
        bumpConversation(payload.conversation_id, payload);
    }

    /* -----------------------------------------------------
       COMPOSER: send / reply / edit / typing / attachments
    ----------------------------------------------------- */
    let typingSentAt = 0;

    function startReply(m) {
        state.replyTo = m;
        state.editingId = null;
        if (el.replyPreview) {
            el.replyPreview.innerHTML =
                `<strong>${esc(isMine(m) ? "You" : (senderOf(m) || {}).name || "User")}</strong>` +
                `<span>${esc((m.content || "").slice(0, 120) || "Attachment")}</span>`;
        }
        if (el.replyBar) el.replyBar.hidden = false;
        if (el.composerInput) el.composerInput.focus();
    }
    function hideReplyBar() {
        state.replyTo = null;
        if (el.replyBar) el.replyBar.hidden = true;
        if (el.replyPreview) el.replyPreview.innerHTML = "";
    }
    function startEdit(m) {
        state.editingId = m.id;
        state.replyTo = null;
        hideReplyBar();
        if (el.composerInput) {
            el.composerInput.value = m.content || "";
            el.composerInput.focus();
            autoGrow();
        }
        toast("info", "Editing message", "Press Send to save, Escape to cancel.");
    }
    function cancelEdit() {
        state.editingId = null;
        if (el.composerInput) el.composerInput.value = "";
        autoGrow();
    }

    function autoGrow() {
        if (!el.composerInput) return;
        el.composerInput.style.height = "auto";
        el.composerInput.style.height =
            Math.min(el.composerInput.scrollHeight, 140) + "px";
    }

    async function sendCurrent() {
        if (!state.activeId || !el.composerInput) return;
        const raw = el.composerInput.value.trim();
        if (!raw) return;
        el.composerInput.value = "";
        autoGrow();
        try {
            if (state.editingId) {
                const r = await API.commEditMessage(state.editingId, raw);
                applyMessageUpdate(r.message);
                cancelEdit();
                toast("success", "Message updated");
            } else {
                const r = await API.commSendMessage(state.activeId, raw, state.replyTo && state.replyTo.id);
                state.messages.push(r.message);
                state.msgById.set(r.message.id, r.message);
                renderMessages();
                scrollChat(true);
                bumpConversation(state.activeId, r.message);
                hideReplyBar();
            }
        } catch (err) {
            if (authErr(err)) return;
            toast("error", "Message not sent", err.message);
            if (el.composerInput) { el.composerInput.value = raw; autoGrow(); }
        }
    }

    function sendTypingHint() {
        const now = Date.now();
        if (now - typingSentAt < 2200) return;
        typingSentAt = now;
        wsSend({ type: "typing", conversation_id: state.activeId });
    }

    function scrollChat(instant) {
        if (!el.chatBody) return;
        el.chatBody.scrollTo({ top: el.chatBody.scrollHeight, behavior: instant ? "auto" : "smooth" });
    }

    /* ---------- attachments ---------- */
    async function handleFiles(fileList) {
        if (!state.activeId || !fileList || !fileList.length) return;
        if (el.uploadBar) el.uploadBar.hidden = false;
        let done = 0;
        for (const file of Array.from(fileList)) {
            done += 1;
            if (el.uploadText) el.uploadText.textContent =
                `Uploading ${file.name} (${done}/${fileList.length})…`;
            try {
                const r = await API.commUploadAttachment(state.activeId, file);
                state.messages.push(r.message);
                state.msgById.set(r.message.id, r.message);
                renderMessages();
                scrollChat(true);
                bumpConversation(state.activeId, r.message);
            } catch (err) {
                if (authErr(err)) return;
                toast("error", `Upload failed: ${file.name}`, err.message);
            }
        }
        if (el.uploadBar) el.uploadBar.hidden = true;
    }

    /* ---------- emoji picker ---------- */
    const EMOJIS = ("😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 🤪 🤗 🤔 😐 😴 🥳 🥺 😢 😭 😤 😡 🤯 😱 👍 👎 👌 ✌️ 🤞 🤘 👏 🙌 🙏 💪 ❤️ 🧡 💛 💚 💙 💜 🖤 💯 ✅ ❌ ⭐ 🔥 🎉 🎯 🚀 💡 📌 📎 📷 🎵 ⚽ 🎮 📚 💻 🐍 ☕ 🍕 🌟 ✨").split(" ");
    function buildEmojiPicker() {
        if (!el.emojiPicker || el.emojiPicker.dataset.built) return;
        el.emojiPicker.innerHTML = EMOJIS
            .map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join("");
        el.emojiPicker.dataset.built = "1";
        el.emojiPicker.addEventListener("click", (e) => {
            const b = e.target.closest("button[data-emoji]");
            if (!b || !el.composerInput) return;
            const cur = el.composerInput.value;
            const s = el.composerInput.selectionStart == null ? cur.length : el.composerInput.selectionStart;
            el.composerInput.value = cur.slice(0, s) + b.dataset.emoji + cur.slice(s);
            el.composerInput.selectionStart = el.composerInput.selectionEnd = s + b.dataset.emoji.length;
            el.composerInput.focus();
            autoGrow();
        });
    }
    function toggleEmojiPicker(force) {
        if (!el.emojiPicker) return;
        buildEmojiPicker();
        const show = force != null ? force : el.emojiPicker.hidden;
        el.emojiPicker.hidden = !show;
    }

    /* -----------------------------------------------------
       bumpConversation — keep sidebar card in sync
    ----------------------------------------------------- */
    function bumpConversation(convId, message) {
        const c = state.convById.get(convId);
        if (!c) { loadConversations(); return; }
        c.last_message = message;
        c.updated_at = message && message.created_at ? message.created_at : new Date().toISOString();
        if (message && !isMine(message) && convId !== state.activeId && !c.is_muted) {
            c.unread_count = (c.unread_count || 0) + 1;
        }
        const total = state.conversations.reduce((s, x) => s + (x.unread_count || 0), 0);
        updateUnreadBadges(total);
        renderConversationList();
    }

    /* -----------------------------------------------------
       CONVERSATION CONTEXT MENU (pin / mute / archive / unread)
    ----------------------------------------------------- */
    function openConvMenu(convId, ev) {
        closeMenus();
        const c = state.convById.get(convId);
        if (!c) return;
        const menu = document.createElement("div");
        menu.className = "ctx-menu";
        menu.innerHTML = `
            <button data-act="pin">📌 ${c.is_pinned ? "Unpin" : "Pin"}</button>
            <button data-act="mute">🔔 ${c.is_muted ? "Unmute" : "Mute"}</button>
            <button data-act="archive">📦 ${c.is_archived ? "Unarchive" : "Archive"}</button>
            <button data-act="markunread">✳ Mark as unread</button>`;
        document.body.appendChild(menu);
        const r = ev.target.getBoundingClientRect();
        menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 12, r.bottom + 6) + "px";
        menu.style.left = Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, r.left - 60)) + "px";
        menu.addEventListener("click", async (e) => {
            const act = e.target.closest("button") && e.target.closest("button").dataset.act;
            if (!act) return;
            closeMenus();
            const body =
                act === "pin" ? { is_pinned: !c.is_pinned } :
                act === "mute" ? { is_muted: !c.is_muted } :
                act === "archive" ? { is_archived: !c.is_archived } :
                { mark_unread: true };
            try {
                await API.commSetPreferences(convId, body);
                if (body.mark_unread) { c.unread_count = Math.max(1, c.unread_count || 0); }
                else { Object.assign(c, body); }
                renderConversationList();
                toast("success", "Conversation updated");
            } catch (err) { apiFail(err, "Could not update conversation"); }
        });
    }

    /* -----------------------------------------------------
       REALTIME — WebSocket /ws/communication
    ----------------------------------------------------- */
    function wsSend(obj) {
        if (state.ws && state.wsUp) {
            try { state.ws.send(JSON.stringify(obj)); return true; } catch (e) { /* noop */ }
        }
        return false;
    }

    let wsWarned = false;
    function wsNoteUnavailable() {
        if (wsWarned) return;
        wsWarned = true;
        toast("info", "Real-time connection unavailable", "Messages still work; live updates will resume automatically.");
    }
    function wsConnect() {
        if (!API.getToken()) return;
        state.wsWanted = true;
        if (state.ws) {
            try { state.ws.onclose = null; state.ws.close(); } catch (e) { /* noop */ }
            state.ws = null; state.wsUp = false;
        }
        let sock;
        try { sock = new WebSocket(API.commWsUrl()); }
        catch (err) { setTimeout(wsConnect, 5000); return; }
        state.ws = sock;
        sock.onopen = () => { state.wsUp = true; };
        sock.onmessage = (ev) => {
            let d = null;
            try { d = JSON.parse(ev.data); } catch (e) { return; }
            handleWsEvent(d);
        };
        sock.onclose = () => {
            state.wsUp = false;
            wsNoteUnavailable();
            if (state.wsWanted) setTimeout(wsConnect, 4000);
        };
        sock.onerror = () => { wsNoteUnavailable(); /* onclose follows */ };
        if (state.pingTimer) clearInterval(state.pingTimer);
        state.pingTimer = setInterval(() => { wsSend({ type: "ping" }); }, 25000);
    }

    function handleWsEvent(d) {
        if (!d || !d.type) return;
        switch (d.type) {
            case "hello":
            case "pong":
                break;
            case "message":
                onWsMessage(d);
                break;
            case "message_updated":
                applyMessageUpdate(d.message);
                break;
            case "typing":
                handleTypingEvent(d);
                break;
            case "presence":
                state.presence.set(String(d.user_id), {
                    online: !!d.online, last_seen: d.last_seen || null,
                });
                if (state.active && !state.active.is_group &&
                    state.active.other_user && Number(state.active.other_user.id) === Number(d.user_id)) {
                    renderChatHeader(state.active);
                }
                renderConversationList();
                break;
            case "read":
                handleWsRead(d);
                break;
            case "call_invite":
                onCallInvite(d);
                break;
            case "call_update":
                onCallUpdate(d);
                break;
            case "offer":
            case "answer":
            case "ice":
            case "call_join":
            case "call_leave":
                onCallSignal(d);
                break;
            case "error":
                toast("error", "Realtime error", d.detail || "");
                break;
            default:
                break;
        }
    }

    function onWsMessage(d) {
        const msg = d.message;
        if (!msg) return;
        const cid = Number(d.conversation_id);
        if (cid === Number(state.activeId)) {
            state.messages.push(msg);
            state.msgById.set(msg.id, msg);
            renderMessages();
            scrollChat(true);
            // Open conversation => mark read immediately (self + peers).
            API.commMarkRead(cid).catch(() => {});
            wsSend({ type: "read", conversation_id: cid });
            const c = state.convById.get(cid);
            if (c) {
                c.unread_count = 0;
                updateUnreadBadges(
                    state.conversations.reduce((s, x) => s + (x.unread_count || 0), 0));
            }
        }
        bumpConversation(cid, msg);
        if (!isMine(msg)) {
            const c = state.convById.get(cid);
            if (c && !c.is_muted && cid !== Number(state.activeId)) {
                toast("info", "New message",
                    `${senderOf(msg)}: ${(msg.content || "").slice(0, 60)}`);
            }
        }
    }

    function handleWsRead(d) {
        // A peer read our messages in this conversation.
        if (Number(d.conversation_id) !== Number(state.activeId)) return;
        let changed = false;
        for (const m of state.messages) {
            if (isMine(m) && !m.is_read) { m.is_read = true; changed = true; }
        }
        if (changed) rerenderAll();
    }

    function handleTypingEvent(d) {
        if (Number(d.conversation_id) !== Number(state.activeId)) return;
        if (Number(d.user_id) === Number(state.me && state.me.id)) return;
        const key = `${d.conversation_id}:${d.user_id}`;
        if (d.is_typing === false) {
            state.peerTyping.delete(key);
        } else {
            state.peerTyping.set(key, { name: d.name || "Someone", at: Date.now() });
            setTimeout(() => {
                const t = state.peerTyping.get(key);
                if (t && Date.now() - t.at >= 4000) {
                    state.peerTyping.delete(key);
                    renderTypingRow();
                }
            }, 4200);
        }
        renderTypingRow();
    }

    function renderTypingRow() {
        if (!el.typingRow) return;
        const names = [...state.peerTyping.values()].map((t) => t.name);
        if (!names.length) { el.typingRow.hidden = true; return; }
        el.typingText.textContent = names.length === 1
            ? `${names[0]} is typing…`
            : `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""} are typing…`;
        el.typingRow.hidden = false;
    }

    /* -----------------------------------------------------
       CALLS — WebRTC (voice / video / screen share)
       Signaling relayed via /ws/communication (offer/answer/
       ice/call_join/call_leave), metadata via REST calls API.
    ----------------------------------------------------- */
    function callPcs() {
        if (!state.call) state.call = {};
        if (!state.call.pcs) state.call.pcs = new Map();
        return state.call.pcs;
    }

    async function acquireMedia(callType) {
        const constraints = {
            audio: true,
            video: callType === "video"
                ? { width: { ideal: 1280 }, height: { ideal: 720 } }
                : false,
        };
        return navigator.mediaDevices.getUserMedia(constraints);
    }

    function createPc(peerId) {
        const pcs = callPcs();
        if (pcs.has(peerId)) return pcs.get(peerId);
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
            ],
        });
        // Local tracks into every PC.
        if (state.call && state.call.localStream) {
            for (const track of state.call.localStream.getTracks()) {
                pc.addTrack(track, state.call.localStream);
            }
        }
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                wsSend({
                    type: "ice", conversation_id: state.call.convId,
                    to: peerId, candidate: e.candidate,
                });
            }
        };
        pc.ontrack = (e) => {
            const stream = e.streams[0] || new MediaStream([e.track]);
            attachRemoteStream(peerId, stream);
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected" && !state.call.connectedAt) {
                state.call.connectedAt = Date.now();
                setCallState("Connected");
            }
            if (pc.connectionState === "failed") {
                setCallState("Connection failed");
            }
        };
        pcs.set(peerId, pc);
        return pc;
    }

    async function startCall(callType) {
        if (!state.activeId) { toast("info", "Open a conversation first"); return; }
        if (state.call && state.call.id) { toast("info", "Already in a call"); return; }
        try {
            const r = await API.commStartCall(state.activeId, callType);
            const call = r.call;
            let stream;
            try {
                stream = await acquireMedia(callType);
            } catch (mediaErr) {
                await API.commUpdateCall(call.id, "missed").catch(() => {});
                toast("error", "Microphone/camera unavailable",
                    mediaErr.message || "Check browser permissions and try again.");
                return;
            }
            state.call = {
                id: call.id, room: call.room, convId: Number(state.activeId),
                callType, role: "caller", localStream: stream,
                pcs: new Map(), startedWall: Date.now(), connectedAt: null,
            };
            openCallScreen(callType);
            setCallState("Ringing…");
            renderCallLocalVideo();
            // Offer to every other participant (1:1 today, group-ready).
            const members = (state.active && state.active.members) || [];
            for (const m of members) {
                if (Number(m.sender_id) === Number(state.me && state.me.id)) continue;
                const pc = createPc(m.id);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsSend({
                    type: "offer", conversation_id: state.call.convId,
                    to: m.id, sdp: pc.localDescription,
                });
            }
        } catch (err) {
            apiFail(err, "Could not start the call");
            teardownCall(false);
        }
    }

    function onCallInvite(d) {
        if (state.call && state.call.id) {
            // Busy: auto-decline politely.
            API.commUpdateCall(d.call.id, "declined").catch(() => {});
            toast("info", "Incoming call missed", "You were already in a call.");
            return;
        }
        state.call = {
            id: d.call.id, room: d.call.room,
            convId: Number(d.conversation_id),
            callType: d.call.call_type || "voice",
            role: "callee", pcs: new Map(),
        };
        const from = d.from || {};
        el.incomingTitle.textContent =
            `${from.name || "Someone"} is calling you`;
        el.incomingSub.textContent =
            `${d.call.call_type === "video" ? "📹 Video" : "☎ Voice"} call • SkillShare`;
        el.incomingModal.hidden = false;
        state.ringTimeout = setTimeout(() => {
            if (state.call && state.call.role === "callee" && !state.call.accepted) {
                el.incomingModal.hidden = true;
                API.commUpdateCall(state.call.id, "missed").catch(() => {});
                state.call = null;
            }
        }, 45000);
    }

    async function acceptCall() {
        if (!state.call) return;
        clearTimeout(state.ringTimeout);
        el.incomingModal.hidden = true;
        state.call.accepted = true;
        try {
            await API.commUpdateCall(state.call.id, "accepted");
            let stream;
            try {
                stream = await acquireMedia(state.call.callType);
            } catch (mediaErr) {
                toast("error", "Microphone/camera unavailable",
                    mediaErr.message || "Check browser permissions and try again.");
                await API.commUpdateCall(state.call.id, "declined").catch(() => {});
                state.call = null;
                return;
            }
            state.call.localStream = stream;
            openCallScreen(state.call.callType);
            renderCallLocalVideo();
            setCallState("Connecting…");
            wsSend({ type: "call_join", conversation_id: state.call.convId });
        } catch (err) {
            apiFail(err, "Could not join the call");
            teardownCall(true);
        }
    }

    async function declineCall() {
        if (!state.call) return;
        clearTimeout(state.ringTimeout);
        el.incomingModal.hidden = true;
        try { await API.commUpdateCall(state.call.id, "declined"); } catch (e) { /* noop */ }
        wsSend({ type: "call_leave", conversation_id: state.call.convId, reason: "declined" });
        state.call = null;
        toast("info", "Call declined");
    }

    async function onCallSignal(d) {
        if (!state.call) return;
        const from = Number(d.from_user);
        if (d.type === "call_join") {
            if (state.call.role === "caller") {
                // Late joiner: (re)send our offer to them.
                const pc = createPc(from);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsSend({
                    type: "offer", conversation_id: state.call.convId,
                    to: from, sdp: pc.localDescription,
                });
            }
            return;
        }
        if (d.type === "offer") {
            const pc = createPc(from);
            await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsSend({
                type: "answer", conversation_id: state.call.convId,
                to: from, sdp: pc.localDescription,
            });
            drainIce(from, pc);
            return;
        }
        if (d.type === "answer") {
            const pc = callPcs().get(from);
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
                drainIce(from, pc);
            }
            return;
        }
        if (d.type === "ice") {
            const pc = callPcs().get(from);
            if (pc && pc.remoteDescription) {
                await pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(() => {});
            } else if (pc) {
                if (!state.call.iceQueue) state.call.iceQueue = new Map();
                if (!state.call.iceQueue.has(from)) state.call.iceQueue.set(from, []);
                state.call.iceQueue.get(from).push(d.candidate);
            }
            return;
        }
        if (d.type === "call_leave") {
            closePc(from);
            if (!callPcs().size) {
                toast("info", "Call ended", "The other participant left.");
                endCall();
            }
        }
    }

    function drainIce(peerId, pc) {
        const q = state.call && state.call.iceQueue && state.call.iceQueue.get(peerId);
        if (!q) return;
        for (const c of q) pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        state.call.iceQueue.delete(peerId);
    }

    function onCallUpdate(d) {
        if (!state.call || Number(d.call.id) !== Number(state.call.id)) {
            // A call I started earlier in another tab / conversation card.
            return;
        }
        if (d.call.status === "declined") {
            toast("info", "Call declined", "The other person declined your call.");
            teardownCall(true);
        } else if (d.call.status === "missed") {
            toast("info", "Call missed");
            teardownCall(true);
        } else if (d.call.status === "ended") {
            toast("info", "Call ended");
            teardownCall(true);
        }
    }

    /* ---------- call UI ---------- */
    function openCallScreen(callType) {
        if (!el.callScreen) return;
        el.callScreen.hidden = false;
        el.callScreen.dataset.type = callType;
        el.callGrid.innerHTML = "";
        el.callLocalVideo.hidden = callType !== "video";
        el.callShareBtn.hidden = callType !== "video";
        setCallState("Ringing…");
    }

    function setCallState(text) {
        if (el.callState) el.callState.textContent = text;
    }

    function renderCallLocalVideo() {
        if (!el.callLocalVideo || !state.call || !state.call.localStream) return;
        el.callLocalVideo.srcObject = state.call.localStream;
        el.callLocalVideo.play().catch(() => {});
    }

    function attachRemoteStream(peerId, stream) {
        if (!el.callGrid) return;
        let vid = el.callGrid.querySelector(`video[data-peer="${peerId}"]`);
        if (!vid) {
            const conv = state.convById.get(state.call.convId);
            const member = conv && (conv.members || []).find((m) => Number(m.id) === Number(peerId));
            const wrap = document.createElement("div");
            wrap.className = "call-tile";
            vid = document.createElement("video");
            vid.dataset.peer = String(peerId);
            vid.autoplay = true;
            vid.playsInline = true;
            const label = document.createElement("span");
            label.className = "call-tile-name";
            label.textContent = (member && member.name) || `User ${peerId}`;
            wrap.appendChild(vid);
            wrap.appendChild(label);
            el.callGrid.appendChild(wrap);
        }
        vid.srcObject = stream;
        vid.play().catch(() => {});
        setCallState("Connected");
    }

    function closePc(peerId) {
        const pc = callPcs().get(peerId);
        if (pc) {
            try { pc.close(); } catch (e) { /* noop */ }
            callPcs().delete(peerId);
        }
        const vid = el.callGrid && el.callGrid.querySelector(`video[data-peer="${peerId}"]`);
        if (vid && vid.parentElement) vid.parentElement.remove();
    }

    function toggleMute() {
        if (!state.call || !state.call.localStream) return;
        const tracks = state.call.localStream.getAudioTracks();
        if (!tracks.length) return;
        tracks[0].enabled = !tracks[0].enabled;
        el.callMuteBtn.classList.toggle("off", !tracks[0].enabled);
        setCallState(tracks[0].enabled ? "Connected" : "Muted");
    }

    function toggleCam() {
        if (!state.call || !state.call.localStream) return;
        const tracks = state.call.localStream.getVideoTracks();
        if (!tracks.length) return;
        tracks[0].enabled = !tracks[0].enabled;
        el.callCamBtn.classList.toggle("off", !tracks[0].enabled);
    }

    async function toggleScreenShare() {
        if (!state.call) return;
        if (state.call.screenTrack) { await stopScreenShare(); return; }
        let display;
        try {
            display = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } catch (err) {
            toast("info", "Screen share cancelled");
            return;
        }
        const screenTrack = display.getVideoTracks()[0];
        state.call.screenTrack = screenTrack;
        for (const pc of callPcs().values()) {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
            if (sender) await sender.replaceTrack(screenTrack).catch(() => {});
        }
        screenTrack.onended = () => stopScreenShare();
        el.callShareBtn.classList.add("on");
        toast("info", "Sharing your screen");
    }

    async function stopScreenShare() {
        if (!state.call || !state.call.screenTrack) return;
        try { state.call.screenTrack.stop(); } catch (e) { /* noop */ }
        state.call.screenTrack = null;
        for (const pc of callPcs().values()) {
            const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
            const camTrack = state.call.localStream &&
                state.call.localStream.getVideoTracks()[0];
            if (sender && camTrack) await sender.replaceTrack(camTrack).catch(() => {});
        }
        if (el.callShareBtn) el.callShareBtn.classList.remove("on");
    }

    async function endCall() {
        if (!state.call) return;
        const call = state.call;
        const duration = call.connectedAt
            ? Math.round((Date.now() - call.connectedAt) / 1000) : 0;
        try { await API.commUpdateCall(call.id, "ended", duration); } catch (e) { /* noop */ }
        wsSend({ type: "call_leave", conversation_id: call.convId });
        teardownCall(false);
    }

    function teardownCall(updateServer) {
        clearTimeout(state.ringTimeout);
        if (el.incomingModal) el.incomingModal.hidden = true;
        if (state.call) {
            for (const peerId of [...callPcs().keys()]) closePc(peerId);
            if (state.call.screenTrack) { try { state.call.screenTrack.stop(); } catch (e) {} }
            if (state.call.localStream) {
                for (const t of state.call.localStream.getTracks()) {
                    try { t.stop(); } catch (e) { /* noop */ }
                }
            }
            if (el.callLocalVideo) el.callLocalVideo.srcObject = null;
        }
        state.call = null;
        if (el.callScreen) el.callScreen.hidden = true;
        if (el.callMuteBtn) el.callMuteBtn.classList.remove("off");
        if (el.callCamBtn) el.callCamBtn.classList.remove("off");
        if (el.callShareBtn) el.callShareBtn.classList.remove("on");
    }

/* -----------------------------------------------------
       PEOPLE / NEW-CHAT / NEW-GROUP MODALS
    ----------------------------------------------------- */
    const modalState = { mode: "chat", selected: new Set(), people: [], q: "", busy: false };

    function loadPeople(q) {
        const list = el.peopleModalBody;
        if (!list) return Promise.resolve([]);
        list.innerHTML = `<div class="people-skel">
            ${Array.from({ length: 4 }, (_, i) =>
                `<div class="skel-row"><span class="skel skel-avatar"></span>` +
                `<span class="skel-lines"><span class="skel skel-line w60"></span><span class="skel skel-line w40"></span></span></div>`).join("")}
        </div>`;
        return API.commPeople(q || "", 25).then((data) => {
            modalState.people = (data && data.users) || [];
            modalState.q = (q || "").trim().toLowerCase();
            renderPeopleList();
            return modalState.people;
        }).catch((err) => {
            if (authErr(err)) throw err;
            list.innerHTML = `<div class="list-empty"><div class="empty-art">😕</div>
                <h3>Could not load people</h3><p>${esc(err.message)}</p></div>`;
            return [];
        });
    }

    function renderPeopleList() {
        const list = el.peopleModalBody;
        if (!list) return;
        const inGroup = modalState.mode === "add" && modalState.targetGroup
            ? new Set(((state.convById.get(modalState.targetGroup) || {}).members || []).map((m) => Number(m.id)))
            : null;
        const u = modalState.people.filter((x) => {
            const id = Number(x.id);
            if (inGroup && inGroup.has(id)) return false;
            if (!modalState.q) return true;
            const hay = `${x.name || ""} ${x.username || ""} ${x.public_id || ""} ${x.skills || ""}`.toLowerCase();
            return hay.includes(modalState.q);
        });
        if (!u.length) {
            list.innerHTML = `<div class="list-empty"><div class="empty-art">🔍</div>
                <h3>No people found</h3><p>Try a different name, skill or public ID.</p></div>`;
            return;
        }
        list.innerHTML = u.map((p) => {
            const id = Number(p.id);
            const sel = modalState.selected.has(id);
            const rel = p.relationship || "none";
            const relBadge = rel === "connected" ? `<span class="rel-badge ok">Connection</span>`
                : rel === "pending" ? `<span class="rel-badge warn">Pending</span>` : "";
            return `<article class="person-row${sel ? " selected" : ""}" data-id="${id}">
                <label class="person-check" title="Toggle selection">
                    <input type="checkbox" ${sel ? "checked" : ""}>
                    <span class="checkbox-ico"></span>
                </label>
                <button class="person-avatar" data-showprofile="${id}" title="View profile">
                    ${avatarImg(p.avatar_url, p.name, id, "", p.name || "User")}
                </button>
                <span class="person-mid">
                    <strong>${esc(p.name || "User")}</strong>
                    <small>${esc(p.skills || p.username || `Public ID ${p.public_id || id}`)}</small>
                </span>
                ${relBadge}
                <button class="icon-btn person-info" data-showprofile="${id}" title="View profile" aria-label="View profile">ⓘ</button>
            </article>`;
        }).join("");
        bindPeopleListEvents();
    }

    function bindPeopleListEvents() {
        const list = el.peopleModalBody;
        if (!list) return;
        list.querySelectorAll("input[type=checkbox]").forEach((cb) => {
            cb.addEventListener("change", () => {
                const id = Number(cb.closest(".person-row").dataset.id);
                if (cb.checked) modalState.selected.add(id);
                else modalState.selected.delete(id);
                updatePeopleSelection();
            });
        });
        list.querySelectorAll("[data-showprofile]").forEach((b) => {
            b.addEventListener("click", () => openProfileDrawer(Number(b.dataset.showprofile)));
        });
        list.querySelectorAll(".person-row").forEach((row) => {
            row.addEventListener("dblclick", () => {
                const id = Number(row.dataset.id);
                if (modalState.mode === "chat") startDirectWith(Number(id));
            });
        });
    }

function updatePeopleSelection() {
        if (el.selectedCount) {
            el.selectedCount.textContent =
                `${modalState.selected.size} member${modalState.selected.size === 1 ? "" : "s"} selected`;
        }
        if (el.groupNameRow) el.groupNameRow.hidden = modalState.mode !== "group";
        if (el.peopleModalFoot) el.peopleModalFoot.hidden = modalState.mode !== "group";
        const cg = el.createGroupConfirm;
        if (cg) {
            cg.disabled = modalState.mode !== "group" ||
                !(modalState.selected.size > 0) ||
                !((el.groupNameInput && el.groupNameInput.value.trim()) || "");
        }
        const rows = el.peopleModalBody && el.peopleModalBody.querySelectorAll(".person-row");
        if (rows) rows.forEach((r) => r.classList.toggle("selected",
            modalState.selected.has(Number(r.dataset.id))));
    }

    function openPeopleModal(mode) {
        modalState.mode = mode === "group" ? "group" : "chat";
        modalState.selected = new Set();
        if (el.peopleModalTitle) {
            el.peopleModalTitle.textContent = mode === "group" ? "Create group" : "New message";
        }
        if (el.groupNameInput) el.groupNameInput.value = "";
        if (el.peopleSearchInput) { el.peopleSearchInput.value = ""; el.peopleSearchInput.focus(); }
        updatePeopleSelection();
        if (el.peopleModal) el.peopleModal.hidden = false;
        if (el.modalBackdrop) el.modalBackdrop.hidden = false;
        loadPeople("").catch(() => {});
    }

    function openGroupModal() { openPeopleModal("group"); }

    async function startDirectWith(userId) {
        modalState.busy = true;
        try {
            const r = await API.commEnsureDirect(userId);
            closePeopleModal();
            const conv = r && r.conversation;
            if (conv) {
                await loadConversations();
                openConversation(Number(conv.id));
            }
        } catch (err) {
            apiFail(err, "Could not start conversation");
        } finally {
            modalState.busy = false;
        }
    }

    function closePeopleModal() {
        if (el.peopleModal) el.peopleModal.hidden = true;
        if (el.modalBackdrop) el.modalBackdrop.hidden = true;
    }

    async function createGroup() {
        const name = ((el.groupNameInput && el.groupNameInput.value) || "").trim();
        if (!name) { toast("error", "Group name required"); return; }
        if (!modalState.selected.size) { toast("error", "Select at least one member"); return; }
        modalState.busy = true;
        const cg = el.createGroupConfirm;
        if (cg) cg.disabled = true;
        try {
            const r = await API.commCreateGroup({
                name,
                member_ids: [...modalState.selected],
            });
            closePeopleModal();
            const conv = r && r.conversation;
            if (conv) {
                await loadConversations();
                openConversation(Number(conv.id));
            }
            toast("success", "Group created", name);
        } catch (err) {
            apiFail(err, "Could not create group");
        } finally {
            modalState.busy = false;
            if (cg) cg.disabled = false;
        }
    }

    function filterPeopleSearch() {
        const q = (el.peopleSearchInput && el.peopleSearchInput.value) || "";
        if (q.length >= 2 || q.length === 0) {
            loadPeople(q).catch(() => {});
        } else {
            modalState.q = q.trim().toLowerCase();
            renderPeopleList();
            bindPeopleListEvents();
        }
    }

/* -----------------------------------------------------
       FORWARD MODAL
    ----------------------------------------------------- */
    function openForwardModal(m) {
        if (!el.forwardModal) return;
        const list = el.forwardModalBody;
        if (!list) return;
        const others = state.conversations.filter((c) => Number(c.id) !== Number(state.activeId));
        if (!others.length) {
            list.innerHTML = `<div class="list-empty"><div class="empty-art">📭</div>
                <h3>No other conversations</h3><p>Start another conversation to forward messages.</p></div>`;
        } else {
            list.innerHTML = others.map((c) =>
                `<article class="person-row" data-cid="${c.id}" role="button" tabindex="0">
                    <button class="person-avatar">${avatarImg(convAvatarUrl(c), convTitle(c), c.id, "", convTitle(c))}</button>
                    <span class="person-mid"><strong>${esc(convTitle(c))}</strong>
                        <small>${c.is_group ? `${c.member_count || 0} members` : "Direct message"}</small></span>
                    <span class="forward-arrow">➤</span>
                </article>`).join("");
            list.querySelectorAll(".person-row").forEach((row) => {
                row.addEventListener("click", () => forwardTo(Number(row.dataset.cid), m));
            });
        }
        el.forwardModal.hidden = false;
        if (el.modalBackdrop) el.modalBackdrop.hidden = false;
    }

    async function forwardTo(convId, m) {
        try {
            await API.commForwardMessage(m.id, convId);
            toast("success", "Message forwarded");
            if (el.forwardModal) el.forwardModal.hidden = true;
            if (el.modalBackdrop) el.modalBackdrop.hidden = true;
            await loadConversations();
        } catch (err) {
            apiFail(err, "Could not forward message");
        }
    }

/* -----------------------------------------------------
       IMAGE PREVIEW MODAL (opens from chat bubbles)
    ----------------------------------------------------- */
    function openImageModal(img) {
        if (!el.imageModal) return;
        const src = img && (img.getAttribute("src") || img.currentSrc || "");
        if (!src) return;
        const fig = img.closest("figure");
        const cap = fig && fig.querySelector("figcaption");
        const alt = ((cap && cap.textContent || "") || img.getAttribute("alt") || "Image").split("·")[0].trim();
        el.imageModalImg.src = src;
        el.imageModalImg.alt = alt;
        el.imageModalName.textContent = alt;
        el.imageModalDownload.href = src;
        el.imageModalDownload.setAttribute("download", alt || "image");
        el.imageModal.hidden = false;
        if (el.modalBackdrop) el.modalBackdrop.hidden = false;
    }

/* -----------------------------------------------------
       PROFILE DRAWER (See Profile inside the hub)
    ----------------------------------------------------- */
    async function openProfileDrawer(userId) {
        const body = el.profileModalBody;
        if (!body) return;
        if (el.profileModalClose) el.profileModalClose.onclick = () => closeProfileDrawer();
        const drawer = document.getElementById("profileDrawer");
        if (drawer) drawer.hidden = false;
        if (el.modalBackdrop) el.modalBackdrop.hidden = false;
        body.innerHTML = `<div class="drawer-loading">
            ${Array.from({ length: 5 }, (_, i) =>
                `<div class="skel-row"><span class="skel skel-avatar"></span>` +
                `<span class="skel-lines"><span class="skel skel-line w70"></span><span class="skel skel-line w50"></span></span></div>`).join("")}
        </div>`;
        try {
            const data = await API.commUserProfile(userId);
            if (!data || !data.user) {
                body.innerHTML = `<div class="list-empty"><div class="empty-art">❓</div>
                    <h3>User not found</h3></div>`;
                return;
            }
            renderProfileDrawerContent(data);
        } catch (err) {
            if (authErr(err)) return;
            body.innerHTML = `<div class="list-empty"><div class="empty-art">😕</div>
                <h3>Could not load profile</h3><p>${esc(err.message)}</p></div>`;
        }
    }

    function closeProfileDrawer() {
        const drawer = document.getElementById("profileDrawer");
        if (drawer) drawer.hidden = true;
        if (el.modalBackdrop) el.modalBackdrop.hidden = true;
    }

function renderProfileDrawerContent(data) {
        const body = el.profileModalBody;
        if (!body) return;
        const u = data.user;
        const rel = data.relationship || {};
        let actionHtml = `<div class="drawer-actions">`;
        if (Number(u.id) !== Number(state.me && state.me.id)) {
            actionHtml += `
                <button class="btn btn-primary" data-ua="message">💬 Message</button>
                <button class="btn btn-ghost" data-ua="voice">☎ Voice</button>
                <button class="btn btn-ghost" data-ua="video">📹 Video</button>`;
            if (rel.connected) {
                actionHtml += `<button class="btn btn-ghost danger-ghost" data-ua="remove">Remove connection</button>`;
            } else if (!rel.pending) {
                actionHtml += `<button class="btn btn-secondary" data-ua="connect">Send connection request</button>`;
            } else {
                actionHtml += `<button class="btn btn-secondary" disabled>Request ${rel.pending_direction === "sent" ? "sent" : "received"}</button>`;
            }
        } else {
            actionHtml += `<a class="btn btn-primary" href="profile.html">Open my full profile →</a>`;
        }
        actionHtml += `</div>`;
        const presenceTxt = data.presence && data.presence.online ? "🟢 Online"
            : data.presence ? lastSeenLabel(data.presence.last_seen) : "Offline";
        const proj = Array.isArray(data.projects) ? data.projects.slice(0, 3) : [];
        const edu = Array.isArray(data.education) ? data.education.slice(0, 3) : [];
        body.innerHTML = `
            <div class="profile-hero">
                <span class="avatar-wrap avatar-xl">${avatarImg(u.avatar_url, u.name, u.id, "", u.name || "User")}</span>
                <h2>${esc(u.name || "User")}</h2>
                <p class="muted">${esc(u.username ? `@${u.username}` : `Public ID · ${u.public_id || u.id}`)}</p>
                <div class="info-presence">${esc(presenceTxt)}</div>
            </div>
            ${actionHtml}
            <div class="profile-blocks">
                ${u.bio ? `<div class="pv-block"><h4>Bio</h4><p>${esc(u.bio)}</p></div>` : ""}
                ${u.skills ? `<div class="pv-block"><h4>Skills</h4><p>${esc(u.skills)}</p></div>` : ""}
                ${u.interests ? `<div class="pv-block"><h4>Interests</h4><p>${esc(u.interests)}</p></div>` : ""}
                ${u.location ? `<div class="pv-block"><h4>Location</h4><p>${esc(u.location)}</p></div>` : ""}
                ${u.website ? `<div class="pv-block"><h4>Website</h4><a href="${esc(u.website)}" target="_blank" rel="noopener noreferrer">${esc(u.website)}</a></div>` : ""}
                ${edu.length ? `<div class="pv-block"><h4>Education</h4><p>${esc(edu.map((e) => [e.institution, e.degree].filter(Boolean).join(" · ")).filter(Boolean).join("; "))}</p></div>` : ""}
            </div>
            ${proj.length ? `<div class="pv-block"><h4>Projects</h4>${proj.map((p) =>
                `<div class="pv-proj"><strong>${esc(p.title)}</strong><p>${esc(p.description || "")}</p></div>`).join("")}</div>` : ""}`;
        if (Number(u.id) !== Number(state.me && state.me.id)) {
            const act = {
                message: () => { closeProfileDrawer(); startDirectWith(Number(u.id)); },
                voice: () => { closeProfileDrawer(); openOrStartCallOnUser(Number(u.id), "voice"); },
                video: () => { closeProfileDrawer(); openOrStartCallOnUser(Number(u.id), "video"); },
                connect: async () => {
                    try {
                        await API.sendRequest(Number(u.id),
                            `Hi ${u.name || ""}, I'd like to connect on SkillShare!`);
                        toast("success", "Connection request sent", `Request sent to ${u.name}.`);
                        openProfileDrawer(Number(u.id));
                    } catch (err) { apiFail(err, "Could not send request"); }
                },
                remove: async () => {
                    if (!confirm(`Remove ${u.name} from your connections?`)) return;
                    try {
                        await API.removeConnection(Number(u.id));
                        toast("success", "Connection removed");
                        openProfileDrawer(Number(u.id));
                    } catch (err) { apiFail(err, "Could not remove connection"); }
                },
            };
            body.querySelectorAll("[data-ua]").forEach((b) => {
                b.addEventListener("click", () => {
                    const fn = act[b.dataset.ua];
                    if (fn) fn();
                });
            });
        }
    }

    async function openOrStartCallOnUser(userId, callType) {
        try {
            const r = await API.commEnsureDirect(userId);
            const conv = r && r.conversation;
            if (!conv) { toast("error", "Could not start call"); return; }
            if (Number(conv.id) !== Number(state.activeId)) {
                await openConversation(Number(conv.id));
            }
            startCall(callType);
        } catch (err) {
            apiFail(err, "Could not start call");
        }
    }

/* -----------------------------------------------------
       CONVERSATION INFO PANEL
    ----------------------------------------------------- */
    let infoTab = "about";
    let infoMedia = null;

    function renderInfoPanel() {
        const c = state.active;
        if (!c) return;
        if (el.infoAvatarWrap) {
            el.infoAvatarWrap.innerHTML = avatarImg(convAvatarUrl(c), convTitle(c), c.id, "", convTitle(c));
        }
        if (el.infoName) el.infoName.textContent = convTitle(c);
        if (el.infoSubtitle) {
            el.infoSubtitle.textContent = c.is_group
                ? (c.member_count || (c.members || []).length) + " members"
                : ((c.other_user && c.other_user.skills) || (c.other_user && c.other_user.username) || "Direct message");
        }
        if (el.infoPresence) {
            const p = presenceOf(c);
            el.infoPresence.innerHTML = `<i class="pr-dot ${p.online ? "on" : ""}"></i> ` +
                esc(p.online ? "Online" : (c.is_group ? "Group" : lastSeenLabel(p.last_seen)));
        }
        renderInfoActions();
        setInfoTab("about");
    }

    function renderInfoActions() {
        const box = el.infoActions;
        if (!box || !state.active) return;
        const c = state.active;
        let html = `<div class="info-action-row">
            <button class="btn btn-ghost" data-ia="voice">☎ Voice</button>
            <button class="btn btn-ghost" data-ia="video">📹 Video</button>
        </div>`;
        if (!c.is_group) {
            const ou = c.other_user;
            if (ou) html += `<button class="btn btn-ghost" data-ia="profile">👤 View Profile</button>`;
        }
        if (c.is_group) {
            const meMember = (c.members || []).find((u) => Number(u.id) === Number(state.me && state.me.id));
            if (meMember && meMember.role === "admin") {
                html += `<button class="btn btn-ghost" data-ia="addmember">➕ Add member</button>`;
            }
        }
        box.innerHTML = html;
        box.querySelectorAll("[data-ia]").forEach((b) => {
            b.addEventListener("click", () => {
                const a = b.dataset.ia;
                if (a === "voice") startCall("voice");
                else if (a === "video") startCall("video");
                else if (a === "profile") openProfileDrawer(Number(c.other_user && c.other_user.id));
                else if (a === "addmember") openAddMembersModal(c);
            });
        });
    }

    function openAddMembersModal(c) {
        modalState.mode = "add";
        modalState.targetGroup = c.id;
        modalState.selected = new Set();
        const existing = new Set((c.members || []).map((m) => Number(m.id)));
        if (el.peopleModalTitle) el.peopleModalTitle.textContent = `Add members to ${convTitle(c)}`;
        if (el.groupNameRow) el.groupNameRow.hidden = true;
        if (el.peopleModalFoot) el.peopleModalFoot.hidden = false;
        if (el.peopleSearchInput) el.peopleSearchInput.value = "";
        const cg = el.createGroupConfirm;
        if (cg) { cg.textContent = "Add selected"; cg.disabled = true; }
        if (el.peopleModal) el.peopleModal.hidden = false;
        if (el.modalBackdrop) el.modalBackdrop.hidden = false;
        loadPeople("").then((users) => {
            // hide already-members
            modalState.people = (users || []).filter((u2) => !existing.has(Number(u2.id)));
            modalState.q = "";
            renderPeopleList();
            updatePeopleSelection();
        }).catch(() => {});
    }

    async function addSelectedMembers() {
        const cid = modalState.targetGroup;
        if (!cid || !modalState.selected.size) return;
        try {
            const r = await API.commAddMembers(cid, [...modalState.selected]);
            toast("success", "Members added",
                `${r.added && r.added.length} member${r.added && r.added.length === 1 ? "" : "s"} added`);
            closePeopleModal();
            await refreshCurrentConversation();
        } catch (err) {
            apiFail(err, "Could not add members");
        }
    }

async function setInfoTab(tab) {
        infoTab = tab;
        if (el.infoTabs) {
            for (const t of el.infoTabs.querySelectorAll(".tab")) {
                t.classList.toggle("active", t.dataset.itab === tab);
            }
        }
        const body = el.infoBody;
        if (!body || !state.active) return;
        if (tab === "about") { renderInfoAbout(); return; }
        body.innerHTML = `<div class="people-skel">
            ${Array.from({ length: 3 }, (_, i) =>
                `<div class="skel-row"><span class="skel skel-avatar"></span>` +
                `<span class="skel-lines"><span class="skel skel-line w60"></span><span class="skel skel-line w40"></span></span></div>`).join("")}
        </div>`;
        try {
            if (!infoMedia) infoMedia = await API.commGetMedia(state.active.id);
            if (tab === "media") {
                const items = infoMedia.media || [];
                if (!items.length) { body.innerHTML = `<div class="list-empty"><div class="empty-art">🖼️</div><h3>No media yet</h3><p>Shared images will appear here.</p></div>`; return; }
                body.innerHTML = `<div class="media-grid">${items.map((a) =>
                    `<figure class="media-tile" data-att="${a.id}"><img src="${esc(API.attachmentUrl(a.url))}" alt="${esc(a.original_name || "image")}" loading="lazy">
                    <figcaption>${esc(a.original_name || "")}</figcaption></figure>`).join("")}</div>`;
                body.querySelectorAll(".media-tile img").forEach((img) => {
                    img.addEventListener("click", () => openImageModal(img));
                });
            } else if (tab === "files") {
                const items = infoMedia.files || [];
                if (!items.length) { body.innerHTML = `<div class="list-empty"><div class="empty-art">📄</div><h3>No files yet</h3><p>Shared documents will appear here.</p></div>`; return; }
                body.innerHTML = items.map((a) =>
                    `<a class="msg-file" href="${esc(API.attachmentUrl(a.url))}" download="${esc(a.original_name || "file")}">
                        <span class="file-ico">📎</span><span class="file-meta"><strong>${esc(a.original_name)}</strong>
                        <small>${esc((a.mime_type || "").split("/").pop())} · ${esc(fmtBytes(a.size_bytes))}</small></span>
                        <span class="file-dl">⬇</span></a>`).join("");
            } else if (tab === "links") {
                const items = infoMedia.links || [];
                if (!items.length) { body.innerHTML = `<div class="list-empty"><div class="empty-art">🔗</div><h3>No links yet</h3><p>URLs shared here will be collected.</p></div>`; return; }
                body.innerHTML = items.map((l) =>
                    `<a class="link-card" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.url)}</a>`).join("");
            }
        } catch (err) {
            apiFail(err, "Could not load media");
            body.innerHTML = `<div class="list-empty"><div class="empty-art">⚠️</div><h3>Load failed</h3><p>${esc(err.message)}</p></div>`;
        }
    }

function renderInfoAbout() {
        const body = el.infoBody;
        if (!body || !state.active) return;
        const c = state.active;
        let html = `<div class="info-about">
            <div class="info-list">
                <span>Type</span><strong>${c.is_group ? "Group" : "Direct message"}</strong>
                <span>Members</span><strong>${c.member_count || (c.members || []).length}</strong>
                <span>Created</span><strong>${esc(fmtListStamp(c.created_at))}</strong>
            </div>
            <h4>Members</h4>`;
        const members = (c.members || []).slice().sort((a, b) =>
            (b.role === "admin" ? 1 : 0) - (a.role === "admin" ? 1 : 0));
        if (!members.length) {
            html += `<div class="list-empty"><div class="empty-art">👤</div><h3>No members yet</h3></div>`;
        }
        members.forEach((m) => {
            const isMe = Number(m.id) === Number(state.me && state.me.id);
            const isAdmin = m.role === "admin";
            html += `<div class="member-row">
                <button class="member-avatar" data-mid="${m.id}" title="View profile">
                    ${avatarImg(m.avatar_url, m.name, m.id, "", m.name || "User")}
                    ${m.online ? `<span class="online-dot"></span>` : ""}
                </button>
                <span class="member-mid">
                    <strong>${esc(m.name || "User")}${isMe ? " (you)" : ""}</strong>
                    <small>${isAdmin ? "Admin" : "Member"}${m.online ? " · 🟢 online" : ""}</small>
                </span>`;
            if (c.is_group) {
                const meMember = (c.members || []).find((u) => Number(u.id) === Number(state.me && state.me.id));
                if (meMember && meMember.role === "admin" && !isMe) {
                    html += `<button class="icon-btn member-more" data-mid="${m.id}" data-name="${esc(m.name || "User")}" title="Member options" aria-label="Member options">⋮</button>`;
                }
            }
            html += `</div>`;
        });
        html += `</div>`;
        body.innerHTML = html;
        body.querySelectorAll(".member-avatar").forEach((btn) => {
            btn.addEventListener("click", () => {
                const mid = Number(btn.dataset.mid);
                if (mid === Number(state.me && state.me.id)) { window.location.href = "profile.html"; return; }
                openProfileDrawer(mid);
            });
        });
        body.querySelectorAll(".member-more").forEach((btn) => {
            btn.addEventListener("click", (e) => openMemberMenu(c.id, Number(btn.dataset.mid), btn.dataset.name, e));
        });
    }

    function openMemberMenu(convId, mid, name, ev) {
        closeMenus();
        const menu = document.createElement("div");
        menu.className = "ctx-menu";
        menu.innerHTML = `
            <button data-act="promote">⭐ Promote to admin</button>
            <button data-act="remove" class="danger">🗑 Remove from group</button>`;
        document.body.appendChild(menu);
        const r = ev.target.getBoundingClientRect();
        menu.style.top = Math.min(window.innerHeight - menu.offsetHeight - 12, r.bottom + 6) + "px";
        menu.style.left = Math.max(12, Math.min(window.innerWidth - menu.offsetWidth - 12, r.right - 150)) + "px";
        menu.addEventListener("click", async (e2) => {
            const act = e2.target.closest("button") && e2.target.closest("button").dataset.act;
            if (!act) return;
            closeMenus();
            try {
                if (act === "promote") await API.commPromoteAdmin(convId, mid);
                else if (act === "remove") {
                    if (!confirm(`Remove ${name} from the group?`)) return;
                    await API.commRemoveMember(convId, mid);
                }
                await refreshCurrentConversation();
                toast("success", "Group updated");
            } catch (err) { apiFail(err, "Could not update group"); }
        });
    }

    async function refreshCurrentConversation() {
        if (!state.activeId) return;
        const r = await API.commGetConversation(state.activeId);
        state.active = (r && (r.conversation || r)) || state.active;
        state.convById.set(Number(state.active.id), state.active);
        renderChatHeader();
        renderInfoPanel();
        renderConversationList();
    }

/* -----------------------------------------------------
       PINNED BAR + CALL HISTORY
    ----------------------------------------------------- */
    let pinnedShown = true;

    function renderPinnedBar() {
        if (!el.pinnedBar || !el.pinnedBody) return;
        const pinned = state.messages.filter((m) => m.is_pinned && !m.is_deleted)
            .slice(-3);
        if (!pinned.length) { el.pinnedBar.hidden = true; return; }
        el.pinnedBar.hidden = !pinnedShown;
        el.pinnedBody.innerHTML = pinned.map((m) =>
            `<span class="pin-item"><strong>${esc(isMine(m) ? "You" : ((senderOf(m) || {}).name || "Member"))}</strong>` +
            `<span>${esc((m.content || "Attachment").slice(0, 60))}</span></span>`).join("");
        el.pinnedBody.querySelectorAll(".pin-item").forEach((item, i) => {
            item.addEventListener("click", () => highlightMessage(pinned[i].id));
        });
    }

    function togglePinned() {
        pinnedShown = !pinnedShown;
        renderPinnedBar();
    }

    let callHistoryLoaded = false;

    async function loadCallHistory() {
        try {
            const r = await API.commCalls(60);
            state.calls = (r && r.calls) || [];
            callHistoryLoaded = true;
            if (state.filter === "calls") renderCallHistory();
        } catch (err) {
            apiFail(err, "Could not load call history");
        }
    }

    function renderCallHistory() {
        if (!el.conversationList) return;
        if (el.convCount) {
            const n = state.calls.length;
            el.convCount.textContent = `${n} call${n === 1 ? "" : "s"}`;
        }
        if (!callHistoryLoaded) {
            el.conversationList.innerHTML = `<div class="people-skel">
                ${Array.from({ length: 3 }, (_, i) =>
                    `<div class="skel-row"><span class="skel skel-avatar"></span>` +
                    `<span class="skel-lines"><span class="skel skel-line w70"></span><span class="skel skel-line w40"></span></span></div>`).join("")}
            </div>`;
            loadCallHistory();
            return;
        }
        const calls = state.calls || [];
        if (!calls.length) {
            el.conversationList.innerHTML = `<div class="list-empty"><div class="empty-art">📞</div>
                <h3>No calls yet</h3><p>Voice and video calls will appear here.</p></div>`;
            return;
        }
        el.conversationList.innerHTML = calls.map((cl) => {
            const typeIco = cl.call_type === "video" ? "📹" : "☎";
            const peer = cl.peer || {};
            const name = convTitle(peer) || `Call #${cl.id}`;
            const peerAvatar = convAvatarUrl(peer);
            const dir = isMineCall(cl);
            const inOut = dir === "in" ? "Incoming" : dir === "out" ? "Outgoing" : "";
            const stLabel = cl.status === "missed" ? "Missed" : cl.status === "declined" ? "Declined"
                : cl.status === "ended" ? `Ended · ${fmtDuration(cl.duration_seconds)}` : (cl.status || "call");
            const statusCls = cl.status === "missed" || cl.status === "declined" ? "missed" : "";
            return `<article class="conv-card call-card ${statusCls}" data-cid="${cl.conversation_id || ""}" role="listitem">
                <span class="conv-avatar call-type">${peerAvatar ? avatarImg(peerAvatar, name, cl.conversation_id || cl.id, "", name) : `<span class="call-type-ico">${typeIco}</span>`}</span>
                <span class="conv-mid">
                    <span class="conv-top"><strong>${esc(name)}</strong>
                        <time>${esc(fmtListStamp(cl.started_at))}</time></span>
                    <span class="conv-bottom"><span class="cv-preview">${inOut ? `${inOut} ${typeIco} · ` : ""}${esc(stLabel)}</span></span>
                </span>
            </article>`;
        }).join("");
        el.conversationList.querySelectorAll(".call-card").forEach((card) => {
            card.addEventListener("click", () => {
                const cid = Number(card.dataset.cid);
                if (cid) {
                    state.filter = "all";
                    syncFilterTabs();
                    openConversation(cid);
                } else if (state.calls.length) {
                    toast("info", "Call has no conversation");
                }
            });
        });
    }

    function isMineCall(cl) {
        const myId = Number(state.me && state.me.id);
        const init = Number(cl.initiator_id);
        if (init === myId) return "out";
        const parts = cl.participants || [];
        if (parts.some((p) => Number(p.user_id) === myId)) return "in";
        return "out";
    }

    function syncFilterTabs() {
        if (el.convFilters) {
            for (const t of el.convFilters.querySelectorAll(".tab")) {
                t.classList.toggle("active", t.dataset.filter === state.filter);
            }
        }
    }

/* -----------------------------------------------------
       EVENT WIRING + INIT
    ----------------------------------------------------- */
    function bindEvents() {
        if (el.newChatBtn) el.newChatBtn.addEventListener("click", () => openPeopleModal("chat"));
        if (el.newGroupBtn) el.newGroupBtn.addEventListener("click", () => openGroupModal());
        if (el.emptyFindPeople) el.emptyFindPeople.addEventListener("click", () => openPeopleModal("chat"));
        if (el.emptyCreateGroup) el.emptyCreateGroup.addEventListener("click", () => openGroupModal());

        if (el.convSearch) {
            let tmr = null;
            el.convSearch.addEventListener("input", () => {
                clearTimeout(tmr);
                tmr = setTimeout(() => {
                    state.search = el.convSearch.value;
                    renderConversationList();
                }, 180);
            });
        }

        if (el.convFilters) {
            el.convFilters.addEventListener("click", (e) => {
                const tab = e.target.closest(".tab");
                if (!tab) return;
                state.filter = tab.dataset.filter || "all";
                syncFilterTabs();
                renderConversationList();
            });
        }

        if (el.sendBtn) el.sendBtn.addEventListener("click", () => sendCurrent());
        if (el.composerInput) {
            el.composerInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendCurrent();
                } else if (e.key === "Escape") {
                    if (state.editingId) cancelEdit();
                    else if (state.replyTo) hideReplyBar();
                }
            });
            el.composerInput.addEventListener("input", () => {
                autoGrow();
                if (state.activeId) sendTypingHint();
            });
        }
        if (el.attachBtn) el.attachBtn.addEventListener("click", () => {
            if (el.fileInput) el.fileInput.click();
        });
        if (el.fileInput) {
            el.fileInput.addEventListener("change", () => {
                if (el.fileInput.files && el.fileInput.files.length) handleFiles(el.fileInput.files);
                el.fileInput.value = "";
            });
        }
        if (el.emojiBtn) el.emojiBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleEmojiPicker();
        });
        if (el.replyCancel) el.replyCancel.addEventListener("click", () => hideReplyBar());

        if (el.mobileBack) el.mobileBack.addEventListener("click", () => {
            document.body.classList.remove("chat-open");
            toggleInfoPanel(false);
            state.activeId = null;
            state.active = null;
            renderConversationList();
            if (el.chatBody) {
                el.chatBody.innerHTML = `<div class="chat-empty"><div class="empty-art">💬</div>` +
                    `<h3>Welcome to Communication Hub</h3><p>Select a conversation or start a new one.</p></div>`;
            }
        });
        if (el.chatUserBtn) el.chatUserBtn.addEventListener("click", () => {
            const c = state.active;
            if (!c) return;
            if (c.is_group) toggleInfoPanel();
            else if (c.other_user) openProfileDrawer(Number(c.other_user.id));
        });
        if (el.infoBtn) el.infoBtn.addEventListener("click", () => toggleInfoPanel());
        if (el.infoClose) el.infoClose.addEventListener("click", () => toggleInfoPanel(false));
        if (el.voiceCallBtn) el.voiceCallBtn.addEventListener("click", () => startCall("voice"));
        if (el.videoCallBtn) el.videoCallBtn.addEventListener("click", () => startCall("video"));
        bindEventsTail();
    }

    function toggleInfoPanel(force) {
        const panel = el.infoPanel;
        if (!panel) return;
        const isOpen = panel.classList.contains("open");
        const show = force != null ? !!force : !isOpen;
        panel.classList.toggle("open", show);
        document.body.classList.toggle("info-open", show);
        if (el.infoOpen !== undefined) el.infoOpen = show;
        if (show && el.infoBody) renderInfoPanel();
    }

function bindEventsTail() {
        // Chat search
        if (el.chatSearchBtn) el.chatSearchBtn.addEventListener("click", () => {
            if (el.chatSearchBar) el.chatSearchBar.hidden = !el.chatSearchBar.hidden;
            if (el.chatSearchBar && !el.chatSearchBar.hidden && el.msgSearchInput) el.msgSearchInput.focus();
        });
        if (el.msgSearchClose) el.msgSearchClose.addEventListener("click", () => {
            if (el.chatSearchBar) el.chatSearchBar.hidden = true;
            if (el.msgSearchInput) el.msgSearchInput.value = "";
            renderMessages();
        });
        if (el.msgSearchInput) {
            let tmr2 = null;
            el.msgSearchInput.addEventListener("input", () => {
                clearTimeout(tmr2);
                tmr2 = setTimeout(runMsgSearch, 200);
            });
            el.msgSearchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); runMsgSearch(); }
            });
        }

        // Pinned bar toggle
        if (el.pinnedClose) el.pinnedClose.addEventListener("click", () => togglePinned());

        // Info tabs
        if (el.infoTabs) {
            el.infoTabs.addEventListener("click", (e) => {
                const t = e.target.closest(".tab");
                if (t) setInfoTab(t.dataset.itab);
            });
        }

        // Modals
        if (el.peopleModalClose) el.peopleModalClose.addEventListener("click", () => closePeopleModal());
        if (el.forwardModalClose) el.forwardModalClose.addEventListener("click", () => {
            if (el.forwardModal) el.forwardModal.hidden = true;
            if (el.modalBackdrop) el.modalBackdrop.hidden = true;
        });
        if (el.imageModalClose) el.imageModalClose.addEventListener("click", () => {
            if (el.imageModal) el.imageModal.hidden = true;
            if (el.modalBackdrop) el.modalBackdrop.hidden = true;
        });
        if (el.modalBackdrop) el.modalBackdrop.addEventListener("click", () => {
            closePeopleModal();
            if (el.forwardModal) el.forwardModal.hidden = true;
            if (el.imageModal) el.imageModal.hidden = true;
            closeProfileDrawer();
        });
        if (el.peopleSearchInput) {
            el.peopleSearchInput.addEventListener("input", () => filterPeopleSearch());
            el.peopleSearchInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { e.preventDefault(); filterPeopleSearch(); }
            });
        }
        if (el.groupNameInput) {
            el.groupNameInput.addEventListener("input", () => updatePeopleSelection());
        }
        if (el.createGroupConfirm) {
            el.createGroupConfirm.addEventListener("click", () => {
                if (modalState.mode === "add") addSelectedMembers();
                else createGroup();
            });
        }
        if (el.callAcceptBtn) el.callAcceptBtn.addEventListener("click", () => acceptCall());
        if (el.callDeclineBtn) el.callDeclineBtn.addEventListener("click", () => declineCall());
        if (el.callEndBtn) el.callEndBtn.addEventListener("click", () => endCall());
        if (el.callMuteBtn) el.callMuteBtn.addEventListener("click", () => toggleMute());
        if (el.callCamBtn) el.callCamBtn.addEventListener("click", () => toggleCam());
        if (el.callShareBtn) el.callShareBtn.addEventListener("click", () => toggleScreenShare());
        if (el.callFullscreenBtn) el.callFullscreenBtn.addEventListener("click", () => {
            if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
            else document.exitFullscreen().catch(() => {});
        });
        if (el.chatMoreBtn) el.chatMoreBtn.addEventListener("click", (e) => {
            if (!state.activeId) return;
            openConvMenu(state.activeId, e);
        });

        // Document-level close (menus, emoji, ESC)
        document.addEventListener("click", (e) => {
            if (el.emojiPicker && !el.emojiPicker.hidden &&
                !(e.target && e.target.closest && e.target.closest(".emoji-picker")) &&
                e.target !== el.emojiBtn) {
                toggleEmojiPicker(false);
            }
            if (!(e.target && e.target.closest && e.target.closest(".ctx-menu"))) closeMenus();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeMenus();
        });
    }

    function runMsgSearch() {
        if (!el.msgSearchInput || !el.chatBody || !state.active) return;
        const q = el.msgSearchInput.value.trim().toLowerCase();
        if (!q) { renderMessages(); return; }
        const hits = state.messages.filter((m) => m.content && !m.is_deleted &&
            m.content.toLowerCase().includes(q));
        if (!hits.length) {
            if (el.msgSearchCount) el.msgSearchCount.textContent = "0 results";
            el.chatBody.innerHTML = `<div class="list-empty"><div class="empty-art">🔍</div>
                <h3>No matches</h3><p>No messages contain “${esc(q)}”.</p></div>`;
            return;
        }
        if (el.msgSearchCount) el.msgSearchCount.textContent = `${hits.length} result${hits.length === 1 ? "" : "s"}`;
        el.chatBody.innerHTML = hits.map((m) =>
            `<div class="msg-row ${isMine(m) ? "mine" : "theirs"} search-hit" data-mid="${m.id}" id="msg-${m.id}">
                <div class="bubble">
                    <span class="msg-sender">${esc((senderOf(m) || {}).name || "Member")}</span>
                    <p class="msg-text">${linkify(m.content, q)}</p>
                    <span class="msg-meta"><time>${esc(fmtTime(m.created_at))}</time></span>
                </div>
            </div>`).join("");
        el.chatBody.querySelectorAll(".search-hit").forEach((node) => {
            node.addEventListener("click", () => { renderMessages(); highlightMessage(Number(node.dataset.mid)); });
        });
    }

async function init() {
        cacheDom();
        bindEvents();
        if (!API.getToken()) { window.location.href = "login.html"; return; }
        try {
            state.me = await API.getMe();
        if (state.me && state.me.user) state.me = state.me.user;
        } catch (err) {
            if (authErr(err)) return;
            toast("error", "Could not authenticate", err.message);
        }
        if (el.profileDropdownContainer && window.SkillShareProfileDropdown) {
            try {
                window.SkillShareProfileDropdown.init('#profileDropdownContainer');
            } catch (e) { /* fallback: rely on existing nav */ }
        }
        buildEmojiPicker();
        renderConversationList();
        try { await loadConversations(); } catch (e) { /* loadConversations shows its own fallback */ }
        try { wsConnect(); } catch (e) { /* realtime is optional; REST already rendered */ }

        // REST presence fallback poll for the open conversation (WS also drives this).
        setInterval(() => {
            if (state.active && !state.active.is_group && state.active.other_user) {
                API.commPresence([state.active.other_user.id])
                    .then((r) => {
                        if (r && r.presence) {
                            for (const [k, v] of Object.entries(r.presence)) {
                                state.presence.set(String(k), { online: !!v.online, last_seen: v.last_seen || null });
                            }
                            renderChatHeader();
                            renderConversationList();
                        }
                    }).catch(() => {});
            }
        }, 30000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => init());
    } else {
        init();
    }
})();
















