/* =========================================================
   SKILLSHARE — MESSAGES
   Backed by FastAPI + PostgreSQL (backend is source of truth).
   Conversations come from GET /api/conversations; messages from
   GET /api/conversations/{id}/messages.
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

    const API = window.SkillShareAPI;

    /* =====================================================
       ELEMENTS
    ===================================================== */

    const workspace = document.querySelector(".workspace");
    const conversationListEl = document.getElementById("conversationList");
    const chatBody = document.getElementById("chatBody");
    const messageInput = document.getElementById("messageInput");
    const sendButton = document.getElementById("sendBtn");
    const mobileBack = document.getElementById("mobileBack");
    const chatName = document.getElementById("chatName");
    const chatStatus = document.getElementById("chatStatus");
    const chatAvatar = document.getElementById("chatAvatar");
    const chatUserBtn = document.getElementById("chatUserBtn");
    const onlineCount = document.getElementById("onlineCount");
    const searchInput = document.getElementById("search");
    const toast = document.getElementById("toast");
    const newChatButton = document.getElementById("newChat");
    const attachButton = document.getElementById("attachBtn");
    const attachMenu = document.getElementById("attachMenu");
    const emojiButton = document.getElementById("emojiBtn");
    const emojiPanel = document.getElementById("emojiPanel");
    const themeBtn = document.getElementById("themeBtn");

    /* Profile panel */
    const profileName = document.querySelector(".profile-main h2");
    const profileAvatar = document.querySelector("#profileAvatar");
    const closeProfile = document.getElementById("closeProfile");

    /* =====================================================
       STATE
    ===================================================== */

    let conversations = [];
    let currentConv = null;
    let currentOther = null;
    let currentMessages = [];
    let lastMessageSignature = "";
    let filterMode = "all";
    let searchQuery = "";
    let sending = false;
    let pollTimer = null;
    let me = API.getUser();
/* =====================================================
       UI UTILITIES
    ===================================================== */

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(window.skillshareMessagesToast);
        window.skillshareMessagesToast = setTimeout(() => {
            toast.classList.remove("show");
        }, 3200);
    }

    function avatarSource(user) {
        if (user && user.avatar) return user.avatar;
        return "assets/avatar1.svg";
    }

    function formatTime(value) {
        if (!value) return "";
        const date = new Date(value);
        if (isNaN(date.getTime())) return "";
        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const suffix = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${suffix}`;
    }

    function formatListTime(value) {
        if (!value) return "";
        const date = new Date(value);
        if (isNaN(date.getTime())) return "";
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const differenceDays = Math.round((startOfToday - startOfDay) / 86400000);
        if (differenceDays === 0) return formatTime(value);
        if (differenceDays === 1) return "Yesterday";
        if (differenceDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
    }

    function dayLabel(key) {
        const date = new Date(key);
        if (isNaN(date.getTime())) return "";
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const differenceDays = Math.round((startOfToday - startOfDay) / 86400000);
        if (differenceDays === 0) return "Today";
        if (differenceDays === 1) return "Yesterday";
        return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    }

    /* =====================================================
       THEME TOGGLE (UI-only preference)
    ===================================================== */

    function applyTheme() {
        const saved = localStorage.getItem("skillshare_theme") || "dark";
        document.body.classList.toggle("light", saved === "light");
        if (themeBtn) themeBtn.textContent = saved === "light" ? "☾" : "◐";
    }

    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const next = document.body.classList.contains("light") ? "dark" : "light";
            document.body.classList.toggle("light", next === "light");
            localStorage.setItem("skillshare_theme", next);
            themeBtn.textContent = next === "light" ? "☾" : "◐";
        });
    }
    applyTheme();
/* =====================================================
       CONVERSATION LIST
    ===================================================== */

    function renderConversationList() {
        if (!conversationListEl) return;

        conversationListEl.innerHTML = "";

        if (!conversations.length) {
            const empty = document.createElement("div");
            empty.className = "no-conversations";
            empty.textContent = "No conversations yet. Accept a request or use + to connect with someone.";
            conversationListEl.appendChild(empty);
            if (onlineCount) onlineCount.textContent = "0 conversations";
            return;
        }

        const filtered = conversations.filter(item => {
            const name = (item.other_user && item.other_user.name || "").toLowerCase();
            const last = (item.last_message && item.last_message.content || "").toLowerCase();
            const matchesSearch = !searchQuery || name.includes(searchQuery) || last.includes(searchQuery);
            const matchesFilter = filterMode === "unread" ? item.unread_count > 0 : true;
            return matchesSearch && matchesFilter;
        });

        filtered.forEach(item => {
            const el = buildConversation(item);
            if (el) conversationListEl.appendChild(el);
        });

        if (onlineCount) {
            onlineCount.textContent = `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`;
        }
    }

    function buildConversation(item) {
        const user = item.other_user || {};
        const button = document.createElement("button");
        button.type = "button";
        button.className = "conversation" + (currentConv && String(currentConv.id) === String(item.id) ? " active" : "");
        button.dataset.convId = item.id;

        const avatarWrap = document.createElement("div");
        avatarWrap.className = "avatar-wrap";

        const img = document.createElement("img");
        img.className = "avatar";
        img.src = avatarSource(user);
        img.alt = user.name || "User";
        img.onerror = () => { img.src = "assets/avatar1.svg"; };

        const presence = document.createElement("i");
        presence.className = "presence";
        presence.style.display = "none";
        avatarWrap.append(img, presence);

        const info = document.createElement("div");
        info.className = "conversation-info";

        const top = document.createElement("div");
        top.className = "conv-top";
        const strong = document.createElement("strong");
        strong.textContent = user.name || "SkillShare user";
        const time = document.createElement("span");
        time.className = "time";
        time.textContent = item.last_message ? formatListTime(item.last_message.created_at) : "";
        top.append(strong, time);

        const idLine = document.createElement("small");
        idLine.className = "conv-id";
        idLine.textContent = user.public_id ? `ID: ${user.public_id}` : "";

        const preview = document.createElement("p");
        preview.textContent = item.last_message
            ? item.last_message.content
            : "You are now connected. Say hello!";
        info.append(top, idLine, preview);

        if (item.unread_count > 0) {
            const unread = document.createElement("span");
            unread.className = "unread";
            unread.textContent = item.unread_count > 99 ? "99+" : String(item.unread_count);
            info.appendChild(unread);
        }

        button.append(avatarWrap, info);
        button.addEventListener("click", () => openConversation(item.id));
        return button;
    }
/* =====================================================
       OPEN CONVERSATION
    ===================================================== */

    async function openConversation(conversationId) {
        const item = conversations.find(c => String(c.id) === String(conversationId));
        const activeId = currentConv && String(currentConv.id);

        if (!item) return;
        currentConv = item;
        currentOther = item.other_user || {};

        if (item.unread_count > 0) {
            item.unread_count = 0;
            renderConversationList();
        }

        updateChatHeader();
        if (workspace) workspace.classList.add("chat-open");
        if (String(item.id) !== activeId) {
            await loadMessages(item.id);
        }
    }

    function updateChatHeader() {
        const user = currentOther || {};
        if (chatName) chatName.textContent = user.name || "Conversation";
        if (chatAvatar) {
            chatAvatar.src = avatarSource(user);
            chatAvatar.alt = user.name || "";
        }
        if (chatStatus) {
            chatStatus.innerHTML = `<i></i> ${user.public_id || "Connected"}`;
        }
    }

    function updateProfilePanel() {
        const user = currentOther || {};
        if (profileName) profileName.textContent = user.name || "Unknown";
        if (profileAvatar) {
            profileAvatar.src = avatarSource(user);
            profileAvatar.alt = user.name || "";
        }
        const userIdEl = document.getElementById("profileUserId");
        if (userIdEl) {
            userIdEl.textContent = user.public_id ? `User ID: ${user.public_id}` : "User ID: —";
        }
        const onlineText = document.querySelector(".profile-main .online");
        if (onlineText) onlineText.innerHTML = `<i></i> Connected`;
        const aboutBlock = document.querySelector(".info-block p");
        if (aboutBlock) {
            aboutBlock.textContent =
                "You are connected on SkillShare. Start a conversation and share skills!";
        }
    }

    if (chatUserBtn) {
        chatUserBtn.addEventListener("click", updateProfilePanel);
    }
    if (closeProfile) {
        closeProfile.addEventListener("click", () => {
            const panel = document.querySelector(".profile");
            if (panel) panel.classList.remove("open");
        });
    }

    /* =====================================================
       LOAD / RENDER MESSAGES
    ===================================================== */

    function messageSignature(messages) {
        if (!messages || !messages.length) return "";
        const last = messages[messages.length - 1];
        return `${messages.length}:${last.id}`;
    }

    async function loadMessages(conversationId, silent = false) {
        if (!chatBody) return;
        try {
            const data = await API.getMessages(conversationId);
            const messages = (data && data.messages) || [];
            if (silent && messageSignature(messages) === lastMessageSignature) {
                return;
            }
            currentMessages = messages;
            lastMessageSignature = messageSignature(messages);
            renderMessages();
        } catch (error) {
            if (!silent) {
                showToast(error && error.detail
                    ? error.detail
                    : "Conversation could not be loaded.");
            }
        }
    }

    function renderMessages() {
        if (!chatBody) return;
        chatBody.innerHTML = "";

        if (!currentMessages.length) {
            const empty = document.createElement("div");
            empty.className = "chat-empty";
            empty.textContent = "No messages yet — say hello!";
            chatBody.appendChild(empty);
            return;
        }

        let lastKey = null;
        currentMessages.forEach((m, index) => {
            const key = dayLabel(m.created_at);
            if (key !== lastKey) {
                lastKey = key;
                const chip = document.createElement("div");
                chip.className = "date-chip";
                chip.textContent = key;
                chatBody.appendChild(chip);
            }
            chatBody.appendChild(buildMessageElement(m, index));
        });

        setTimeout(scrollChatToBottom, 60);
    }

    function buildMessageElement(m, index) {
        const mine = me && String(m.sender_id) === String(me.id);
        const wrapper = document.createElement("div");
        wrapper.className = mine ? "msg me" : "msg";
        wrapper.style.animationDelay = `${Math.min(index * 40, 300)}ms`;

        if (!mine) {
            const avatar = document.createElement("img");
            avatar.src = avatarSource(currentOther || {});
            avatar.alt = currentOther ? currentOther.name : "User";
            wrapper.appendChild(avatar);
        }

        const bubble = document.createElement("div");
        bubble.className = "bubble";

        const text = document.createElement("div");
        text.textContent = m.content;
        bubble.appendChild(text);

        const meta = document.createElement("div");
        meta.className = "msg-meta";
        if (mine) {
            meta.innerHTML = `${formatTime(m.created_at)} <span class="checks">✓✓</span>`;
        } else {
            meta.textContent = formatTime(m.created_at);
        }
        bubble.appendChild(meta);
        wrapper.appendChild(bubble);
        return wrapper;
    }

    function scrollChatToBottom() {
        if (!chatBody) return;
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
/* =====================================================
       SEND MESSAGE
    ===================================================== */

    async function sendMessage() {
        if (!messageInput || !currentConv || sending) return;
        const text = messageInput.value.trim();
        if (!text || text.length > 2000) return;

        sending = true;
        if (sendButton) sendButton.disabled = true;

        try {
            const data = await API.sendMessage(currentConv.id, text);
            messageInput.value = "";
            resizeInput();
            if (data && data.message) {
                currentMessages.push(data.message);
                lastMessageSignature = messageSignature(currentMessages);
                renderMessages();
            }
        } catch (error) {
            showToast(error && error.detail
                ? error.detail
                : "Message failed to send. Please try again.");
        } finally {
            sending = false;
            if (sendButton) sendButton.disabled = false;
            if (messageInput) messageInput.focus();
        }
    }

    function resizeInput() {
        if (!messageInput) return;
        messageInput.style.height = "auto";
        messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + "px";
    }

    if (sendButton) {
        sendButton.addEventListener("click", sendMessage);
    }
    if (messageInput) {
        messageInput.addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
        messageInput.addEventListener("input", resizeInput);
    }
    if (mobileBack) {
        mobileBack.addEventListener("click", () => {
            if (workspace) workspace.classList.remove("chat-open");
        });
    }

    /* =====================================================
       SEARCH + TABS (UI-only filters)
    ===================================================== */

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            searchQuery = (searchInput.value || "").toLowerCase().trim();
            renderConversationList();
        });
    }

    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            filterMode = tab.dataset.filter || "all";
            renderConversationList();
        });
    });

    /* =====================================================
       ATTACHMENT / EMOJI (cosmetic popovers)
    ===================================================== */

    if (attachButton && attachMenu) {
        attachButton.addEventListener("click", event => {
            event.stopPropagation();
            attachMenu.classList.toggle("show");
        });
        document.addEventListener("click", () => attachMenu.classList.remove("show"));
    }

    if (emojiButton && emojiPanel) {
        emojiButton.addEventListener("click", event => {
            event.stopPropagation();
            emojiPanel.classList.toggle("show");
        });
        document.addEventListener("click", () => emojiPanel.classList.remove("show"));
        emojiPanel.addEventListener("click", event => {
            const emoji = event.target.textContent && event.target.textContent.trim();
            if (emoji && messageInput) {
                messageInput.value += emoji;
                messageInput.focus();
                emojiPanel.classList.remove("show");
            }
        });
    }
/* =====================================================
       NEW CHAT → CONNECT MODAL
       Uses GET /api/users + POST /api/requests
    ===================================================== */

    const modal = document.getElementById("modal");
    const modalContent = document.getElementById("modalContent");
    const modalClose = document.getElementById("modalClose");

    function openModal() {
        if (modal) modal.classList.add("show");
    }
    function closeModal() {
        if (modal) modal.classList.remove("show");
    }

    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modal) {
        modal.addEventListener("click", event => {
            if (event.target === modal) closeModal();
        });
    }

    async function openNewChatFlow() {
        if (!modalContent) return;
        openModal();

        modalContent.innerHTML = "";
        const wrap = document.createElement("div");
        wrap.className = "new-chat-wrap";

        const h = document.createElement("h2");
        h.textContent = "Start a conversation";
        const p = document.createElement("p");
        p.textContent = "Connect with a learner. Accepted requests become conversations.";
        wrap.append(h, p);

        const list = document.createElement("div");
        list.className = "new-chat-list";
        const loading = document.createElement("div");
        loading.className = "new-chat-loading";
        loading.textContent = "Loading people...";
        list.appendChild(loading);
        wrap.appendChild(list);
        modalContent.appendChild(wrap);

        try {
            const [usersData, conversationsData, requestsData] = await Promise.all([
                API.listUsers(),
                API.getConversations(),
                API.listRequests(),
            ]);

            const users = (usersData && usersData.users) || [];
            const convs = (conversationsData && conversationsData.conversations) || [];
            const reqs = (requestsData && requestsData.requests) || [];

            const convByUser = new Map();
            convs.forEach(c => {
                if (c.other_user) convByUser.set(String(c.other_user.id), c);
            });
            const pendingUserIds = new Set(
                reqs
                    .filter(r => r.status === "pending")
                    .map(r => [r.sender && r.sender.id, r.receiver && r.receiver.id])
                    .flat()
            );

            list.innerHTML = "";
            if (!users.length) {
                const empty = document.createElement("div");
                empty.className = "new-chat-loading";
                empty.textContent = "No other members found yet.";
                list.appendChild(empty);
            }

            users.forEach(user => {
                list.appendChild(buildConnectRow(user, convByUser, pendingUserIds));
            });

        } catch (error) {
            if (error && error.status === 401) return;
            list.innerHTML = "";
            const empty = document.createElement("div");
            empty.className = "new-chat-loading";
            empty.textContent = error && error.status === 0
                ? "Server unavailable. Please check the backend."
                : "Could not load users. Please try again.";
            list.appendChild(empty);
        }
    }

    function buildConnectRow(user, convByUser, pendingUserIds) {
        const row = document.createElement("div");
        row.className = "new-chat-row";

        const img = document.createElement("img");
        img.src = avatarSource(user);
        img.alt = user.name || "";
        img.onerror = () => { img.src = "assets/avatar1.svg"; };

        const label = document.createElement("div");
        label.className = "new-chat-name";
        const name = document.createElement("strong");
        name.textContent = user.name || "User";
        const skill = document.createElement("span");
        const skillsRaw = (user && user.skills) || "";
        const skillsText = String(skillsRaw).split(",").map(s => s.trim()).filter(Boolean).slice(0, 2).join(", ");
        skill.textContent = skillsText || (user && user.public_id ? `ID: ${user.public_id}` : "SkillShare member");
        label.append(name, skill);

        const action = document.createElement("button");
        action.type = "button";
        action.className = "primary connect-action";

        const existingConv = convByUser.get(String(user.id));
        const isPending = pendingUserIds.has(String(user.id));

        if (existingConv) {
            action.classList.add("ghost");
            action.textContent = "Message";
            action.addEventListener("click", () => {
                closeModal();
                openConversation(existingConv.id);
            });
        } else if (isPending) {
            action.disabled = true;
            action.classList.add("sent");
            action.textContent = "Request Sent";
        } else {
            action.textContent = "Connect";
            action.addEventListener("click", async () => {
                action.disabled = true;
                action.textContent = "Sending...";
                try {
                    await API.sendRequest(
                        user.id,
                        `I'd love to connect and learn together!`,
                        null,
                        null
                    );
                    action.classList.add("sent");
                    action.textContent = "Request Sent";
                    showToast(`✓ Request sent to ${user.name || "them"}`);
                } catch (error) {
                    action.disabled = false;
                    action.textContent = "Connect";
                    showToast(error && error.detail
                        ? error.detail
                        : "Unable to send request. Please try again.");
                }
            });
        }

        row.append(img, label, action);
        return row;
    }

    if (newChatButton) {
        newChatButton.addEventListener("click", openNewChatFlow);
    }
/* =====================================================
       REFRESH + POLLING (lightweight real-time)
       A WebSocket can be added later at
       /ws/conversations/{id} without changing this page's
       conversation model.
    ===================================================== */

    async function refreshConversations() {
        try {
            const data = await API.getConversations();
            const incoming = (data && data.conversations) || [];
            const openId = currentConv && String(currentConv.id);

            conversations = incoming;
            renderConversationList();

            /* Real unread badge from PostgreSQL (was a hardcoded "3"). */
            const badge = document.getElementById("navUnreadBadge");
            if (badge) {
                const totalUnread = conversations.reduce(
                    (sum, c) => sum + (c.unread_count || 0),
                    0
                );
                badge.textContent = totalUnread;
                badge.style.display = totalUnread ? "" : "none";
            }

            if (openId) {
                const found = conversations.find(c => String(c.id) === openId);
                if (found) {
                    currentConv = found;
                    currentOther = found.other_user || {};
                    updateChatHeader();
                }
            }
        } catch (error) {
            if (error && error.status === 0 && !currentConv) {
                if (chatBody) {
                    chatBody.innerHTML = `<div class="chat-empty">Server unavailable. Please check that the backend is running.</div>`;
                }
            }
        }
    }

    async function poll() {
        if (document.hidden) return;
        await refreshConversations();
        if (currentConv) {
            await loadMessages(currentConv.id, true);
        }
    }

    /* =====================================================
       INITIALIZE
    ===================================================== */

    async function init() {
        await refreshConversations();

        /* Deep link: messages.html?user=<id> opens the chat with that
           person directly (used by the Message buttons on Requests). */
        const targetUser = new URLSearchParams(window.location.search).get("user");
        const targetConv = targetUser
            ? conversations.find(
                c => c.other_user && String(c.other_user.id) === String(targetUser)
            )
            : null;

        if (targetConv) {
            await openConversation(targetConv.id);
        } else if (targetUser) {
            if (chatBody) {
                chatBody.innerHTML =
                    '<div class="chat-empty">You are not connected with this person yet. ' +
                    'Send a connection request from the ' +
                    '<a href="requests.html#discover">Requests page</a> and accept it to start chatting.</div>';
            }
        } else if (conversations.length) {
            await openConversation(conversations[0].id);
        } else if (chatBody) {
            chatBody.innerHTML =
                `<div class="chat-empty">No conversations yet. Use + to connect with someone.</div>`;
        }
        pollTimer = setInterval(poll, 6000);
    }

    window.addEventListener("beforeunload", () => {
        if (pollTimer) clearInterval(pollTimer);
    });

    document.addEventListener("skillshare:auth-expired", () => {
        showToast("Your session has expired. Please log in again.");
        setTimeout(() => { window.location.href = "login.html"; }, 1200);
    });

    init();
});