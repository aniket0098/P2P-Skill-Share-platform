/* =========================================================
   SKILLCONNECT — DISCUSSION ROOM (real backend + LiveKit Cloud)

   Flow: ?room=<id> -> auth check -> GET room -> verify
   access -> render room + participants + chat (PostgreSQL) ->
   POST /api/livekit/token -> LiveKit Cloud mic/camera/screen.
   The app-room UI always renders even if LiveKit disconnects.
   ========================================================= */

"use strict";

/* ================= MEDIA LAYER (LiveKit Cloud — real) ================= */
/* Provided by livekit-room.js (+parts 2-4) via window.DiscussionMedia.
   discussion-room.js runs FIRST, so bind lazily at call time. */
function liveMedia() {
    return window.DiscussionMedia || {
        connected: false,
        getRoomName(roomId) { return "skillshare_discussion_" + roomId; },
        async connect() {},
        async disconnect() {},
        async toggleMic() {},
        async toggleCam() {},
        async toggleScreen() {},
        async toggleHand() {},
        async togglePresentation() {},
        async exitPresentation() {},
        setAppCount() {},
        syncButtons() {},
    };
}

/* ================= STATE ================= */

let roomId = null;
let currentUser = null;
let room = null;
let participants = [];
let messages = [];
let lastMessageId = 0;
let pollTimer = null;
let pollTick = 0;
let sending = false;
let meetingTimerInterval = null;

/* ================= DOM (null-safe: one bad id can never blank the page) ================= */

const $ = (id) => document.getElementById(id);

function safeText(id, value) {
    const el = $(id);
    if (el) el.textContent = value == null ? "" : String(value);
    return el;
}

function safeHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
    return el;
}

const stateEl = $("roomState");
const stateIcon = $("stateIcon");
const stateSpinner = $("stateSpinner");
const stateTitle = $("stateTitle");
const stateText = $("stateText");
const stateActions = $("stateActions");
const retryBtn = $("retryBtn");

const roomBody = $("roomBody");

/* ================= HELPERS ================= */

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}

function initialsOf(name) {
    return String(name || "?").trim().split(/\s+/).map((w) => w[0]).join("")
        .slice(0, 2).toUpperCase() || "?";
}

function avatarHTML(user, cls) {
    const name = user && user.name ? user.name : "?";
    const url = user && user.avatar_url;
    if (url) {
        return `<span class="${cls}"><img src="${escapeHTML(url)}"
            alt="${escapeHTML(name)}"
            onerror="this.style.display='none';this.parentElement.textContent='${escapeHTML(initialsOf(name))}'"></span>`;
    }
    return `<span class="${cls}">${escapeHTML(initialsOf(name))}</span>`;
}

function formatTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d)) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDate(value) {
    if (!value) return "Not scheduled";
    const d = new Date(value);
    if (isNaN(d)) return "Not scheduled";
    return d.toLocaleString(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
    });
}

function formatDateOnly(value) {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
    });
}

let toastTimer;
function showToast(message, isError = false) {
    const toast = $("toast");
    if (!toast) return;   // a missing toast must never break an error path
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function errorMessage(error) {
    if (window.SkillShareAuth) return window.SkillShareAuth.getErrorMessage(error);
    return (error && error.message) || "Something went wrong.";
}

function goBackToDiscussion() {
    window.location.href = "live-discussions.html";
}

/* ================= STATE SCREENS ================= */

function showState(title, text, { icon = true, retry = false } = {}) {
    /* Null-safe: the state machine itself must never be the reason the
       page stays on its initial "Loading discussion..." text. */
    if (roomBody) roomBody.hidden = true;
    if (stateEl) stateEl.hidden = false;
    if (stateIcon) stateIcon.hidden = !icon;
    if (stateSpinner) stateSpinner.hidden = icon;
    if (stateTitle) stateTitle.textContent = title;
    if (stateText) stateText.textContent = text;
    if (stateActions) stateActions.hidden = !retry;
    if (retry && retryBtn) {
        retryBtn.onclick = () => window.location.reload();
    }
}

function showRoom() {
    if (stateEl) stateEl.hidden = true;
    if (roomBody) roomBody.hidden = false;
}

/* ================= ROOM LOADING ================= */

/* A hanging auth/room request must never wedge the page on the spinner:
   every blocking await below has a bounded timeout with an exit path. */
function withTimeout(promise, ms, label) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(label || "Request timed out. Please try again.");
            error.status = 0;
            error.timeout = true;
            reject(error);
        }, ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

async function loadRoom() {
    /* 1. Read + validate the room id from the URL. */
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("room");
    if (!raw || !/^\d+$/.test(raw)) {
        showState(
            "Unable to open discussion room.",
            "This link is missing a valid room ID. Go back to Live Discussions and pick a room.",
            { retry: false }
        );
        return;
    }
    roomId = parseInt(raw, 10);

    /* 2. Verify authentication (bounded: never stuck on Loading). */
    try {
        currentUser = await withTimeout(
            window.SkillShareAuth.requireUser(),
            15000,
            "Sign-in check timed out. Please retry."
        );
        if (!currentUser) return; // 401 already redirected to login
    } catch (error) {
        showState("Unable to verify your session.", errorMessage(error), { retry: true });
        return;
    }

    /* 3. Request the room (bounded: never stuck on Loading). */
    try {
        const data = await withTimeout(
            window.SkillShareAPI.getDiscussion(roomId),
            15000,
            "Room request timed out. Please retry."
        );
        room = (data && data.room) || data || null;
        if (!room || !room.id) throw new Error("Room not found.");
    } catch (error) {
        if (error && error.status === 404) {
            showState(
                "This discussion room no longer exists.",
                "It may have been removed. Head back to Live Discussions to find another room.",
                { retry: false }
            );
        } else if (error && error.status === 403) {
            showState("You don't have access to this room.", errorMessage(error), { retry: false });
        } else {
            showState("Unable to load room information.", errorMessage(error), { retry: true });
        }
        return;
    }

    renderRoom();

    /* SHOW THE ROOM IMMEDIATELY. Participants + chat load in the
       background — a slow backend must never keep the user stuck on
       the loading screen when the room data is already here. */
    showRoom();

    /* 4. Participants + chat load in parallel; one failing must not
          break the whole page. */
    let participantsFailed = false;
    let chatFailed = false;

    await Promise.all([
        loadParticipants().catch(() => { participantsFailed = true; }),
        loadChat().catch(() => { chatFailed = true; }),
    ]);

    /* 5. Connect LiveKit Cloud for real mic/camera/screen (non-blocking:
       the app room is already rendered; media failure never blanks it).
       Control wiring is isolated so a wiring defect can never again
       prevent the media connection from starting. */
    try { liveMedia().syncButtons(); } catch (e) {}
    try {
        wireLivekitControls();
    } catch (e) {
        console.log("[LiveKit] control wiring issue:", e);
    }
    liveMedia().connect(roomId).catch(() => {});

    if (participantsFailed) {
        safeHTML("participantsList",
            '<p class="empty-note">Unable to load participants. <button class="link-btn" type="button" onclick="loadParticipants()">Retry</button></p>');
    }
    if (chatFailed && isMember()) {
        safeHTML("messages", `
            <div class="chat-empty">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Unable to load messages.
                <button class="link-btn" type="button" onclick="loadChat()">Retry</button>
            </div>`);
    }

    /* 5. Light polling keeps the room fresh (only while visible). */
    startPolling();
}

function isHost() {
    return room && currentUser && room.host_id === currentUser.id;
}

function isMember() {
    return room && (room.is_host || room.is_member);
}

function isOpen() {
    return room && (room.status === "SCHEDULED" || room.status === "LIVE");
}

/* ================= ROOM RENDER ================= */

function renderRoom() {
    if (!room) return;

    safeText("roomCrest", initialsOf(room.title));
    safeText("roomTitle", room.title);
    safeText("hostName", (room.host && room.host.name) || "Unknown host");
    const hostLink = $("hostLink");
    if (hostLink) hostLink.href = "profile.html";

    const hostChip = $("hostChip");
    if (hostChip) hostChip.hidden = false; // a room always has a host
    const youChip = $("youChip");
    if (youChip) youChip.hidden = !isHost();

    /* status pill */
    const pill = $("roomStatus");
    if (pill) {
        pill.className = "status-pill " + String(room.status || "").toLowerCase();
        pill.innerHTML =
            room.status === "LIVE"
                ? '<span class="live-dot"></span> LIVE'
                : escapeHTML(room.status);
    }

    /* private-room indicator + meeting timer (header) */
    const privacyPill = $("roomPrivacyPill");
    if (privacyPill) privacyPill.hidden = !room.is_private;
    updateMeetingTimer();

    /* host/moderator join-request panel (private rooms, open rooms only) */
    const jrp = $("joinRequestsPanel");
    if (jrp) {
        if (room.is_private && isOpen()
            && (isHost() || room.my_role === "MODERATOR")) {
            jrp.hidden = false;
            loadJoinRequests().catch(() => {});
        } else {
            jrp.hidden = true;
        }
    }

    /* participants count */
    safeText("participantCount", room.participant_count || 0);
    safeText("participantMax", room.max_participants);

    /* scheduled time */
    if (room.scheduled_at) {
        const sched = $("scheduleStat");
        if (sched) sched.hidden = false;
        safeText("scheduleText", formatDate(room.scheduled_at));
    } else {
        const sched = $("scheduleStat");
        if (sched) sched.hidden = true;
    }

    /* ended banner */
    const banner = $("endedBanner");
    if (banner) banner.hidden = !(room.status === "ENDED" || room.status === "CANCELLED");

    /* agenda */
    if (room.agenda) {
        safeText("agendaText", room.agenda);
        const at = $("agendaText");
        if (at) at.hidden = false;
        const ae = $("agendaEmpty");
        if (ae) ae.hidden = true;
    } else {
        const at = $("agendaText");
        if (at) at.hidden = true;
        const ae = $("agendaEmpty");
        if (ae) ae.hidden = false;
    }

    /* about */
    if (room.description) {
        safeText("aboutText", room.description);
        const abt = $("aboutText");
        if (abt) abt.hidden = false;
        const abe = $("aboutEmpty");
        if (abe) abe.hidden = true;
    } else {
        const abt = $("aboutText");
        if (abt) abt.hidden = true;
        const abe = $("aboutEmpty");
        if (abe) abe.hidden = false;
    }

    /* details grid — only real information */
    const details = [
        ["Topic", room.topic || "—"],
        ["Category", room.category || "—"],
        ["Type", room.room_type ? String(room.room_type).replace(/_/g, " ") : "—"],
        ["Created", formatDateOnly(room.created_at)],
        ["Scheduled", formatDate(room.scheduled_at)],
        ["Duration", room.duration_minutes ? room.duration_minutes + " min" : "—"],
        ["Participant limit", String(room.max_participants)],
        ["Participants", String(room.participant_count || 0)],
    ];
    safeHTML("detailGrid", details.map(([label, value]) => `
        <div class="detail-item">
            <small>${escapeHTML(label)}</small>
            <b>${escapeHTML(value)}</b>
        </div>`).join(""));

    /* host controls — exposed only when the server confirms host role */
    const actions = $("hostActions");
    if (actions) actions.hidden = !isHost();
    if (isHost()) {
        const startBtn = $("startRoomBtn");
        if (startBtn) startBtn.hidden = room.status !== "SCHEDULED";
        const endBtn = $("endRoomBtn");
        if (endBtn) endBtn.hidden = room.status !== "LIVE";
        const editBtn = $("editRoomBtn");
        if (editBtn) editBtn.disabled =
            room.status === "ENDED" || room.status === "CANCELLED";
    }

    /* resources "add" — host only */
    const addRes = $("addResourceBtn");
    if (addRes) addRes.hidden = !isHost();

    updateChatAvailability();
}

function updateChatAvailability() {
    const input = $("messageInput");
    const sendBtn = $("sendBtn");
    const chatPanel = document.querySelector(".chat-panel");
    const chatInputRow = chatPanel.querySelector(".chat-input");

    /* remove previous note */
    const previousNote = chatPanel.querySelector(".chat-closed-note");
    if (previousNote) previousNote.remove();

    if (!isMember() && isOpen()) {
        /* Non-member opened a shared link. Public rooms offer a direct
           Join; private rooms show the real request state instead. */
        input.disabled = true;
        sendBtn.disabled = true;
        input.placeholder = "Join the room to send messages…";
        const note = document.createElement("div");
        note.className = "chat-closed-note";
        const reqState = room.my_join_request;
        if (room.is_private && reqState === "pending") {
            note.innerHTML =
                '<div class="jr-state pending"><i class="fa-solid fa-hourglass-half"></i> ' +
                "Request pending — the host must approve you before you can join.</div>";
        } else if (room.is_private && reqState === "rejected") {
            note.innerHTML =
                '<div class="jr-state rejected"><i class="fa-solid fa-ban"></i> ' +
                "Your request was declined.</div>" +
                '<button class="primary-btn" type="button" onclick="requestToJoinHere()">' +
                '<i class="fa-solid fa-rotate-right"></i> Request Again</button>';
        } else if (room.is_private && reqState === "accepted") {
            note.innerHTML =
                '<div class="jr-state accepted"><i class="fa-solid fa-circle-check"></i> ' +
                "The host approved you — welcome!</div>" +
                '<button class="primary-btn" type="button" onclick="joinRoom()">' +
                '<i class="fa-solid fa-right-to-bracket"></i> Join this room</button>';
        } else if (room.is_private) {
            note.innerHTML =
                '<button class="primary-btn" type="button" onclick="requestToJoinHere()">' +
                '<i class="fa-solid fa-lock"></i> Request to Join</button>';
        } else {
            note.innerHTML =
                '<button class="primary-btn" type="button" onclick="joinRoom()">' +
                '<i class="fa-solid fa-right-to-bracket"></i> Join this room</button>';
        }
        chatPanel.insertBefore(note, chatInputRow);
    } else if (room.status === "ENDED" || room.status === "CANCELLED") {
        input.disabled = true;
        sendBtn.disabled = true;
        input.placeholder = "This discussion has ended";
        const note = document.createElement("div");
        note.className = "chat-closed-note";
        note.textContent = "Chat is read-only because the discussion has ended.";
        chatPanel.insertBefore(note, chatInputRow);
    } else {
        input.disabled = false;
        sendBtn.disabled = false;
        input.placeholder = "Type a message…";
    }
}

/* ================= JOIN / SHARE ================= */

/* PRIVATE ROOMS: request the host's approval from inside the room page. */
async function requestToJoinHere() {
    const API = window.SkillShareAPI;
    try {
        await API.requestDiscussionJoin(roomId);
        showToast("Request sent — waiting for the host to approve.");
        await loadRoomReload();
    } catch (error) {
        showToast(errorMessage(error), true);
    }
}

/* ---- Meeting timer (header): real elapsed time while the room is LIVE ---- */
function updateMeetingTimer() {
    const stat = $("meetingTimerStat");
    if (!stat) return;
    const startedIso = room && room.status === "LIVE" ? room.started_at : null;
    if (!startedIso) {
        if (meetingTimerInterval) {
            clearInterval(meetingTimerInterval);
            meetingTimerInterval = null;
        }
        stat.hidden = true;
        return;
    }
    const started = new Date(startedIso).getTime();
    if (isNaN(started)) { stat.hidden = true; return; }
    stat.hidden = false;
    const pad = (n) => String(n).padStart(2, "0");
    const tick = () => {
        const totalSec = Math.max(0, Math.floor((Date.now() - started) / 1000));
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        safeText("meetingTimer",
            h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
    };
    tick();
    if (!meetingTimerInterval) meetingTimerInterval = setInterval(tick, 1000);
}

/* ---- Host/moderator: manage private-room join requests ---- */
async function loadJoinRequests() {
    if (!room || !room.is_private) return;
    const list = $("joinRequestsList");
    if (!list) return;
    const data = await window.SkillShareAPI.getDiscussionJoinRequests(roomId, "pending");
    const requests = data.requests || [];
    const chip = $("joinRequestsChip");
    if (chip) chip.textContent = String(requests.length);
    if (!requests.length) {
        list.innerHTML = '<p class="empty-note">No pending requests.</p>';
        return;
    }
    list.innerHTML = requests.map((r) => {
        const u = r.user || {};
        return `
        <div class="join-request" data-request="${r.id}">
            ${avatarHTML(u, "p-avatar")}
            <div class="p-info">
                <b>${escapeHTML(u.name || "Member")}</b>
                <small>${u.username ? "@" + escapeHTML(u.username) : "Member"}</small>
            </div>
            <div class="jr-actions">
                <button class="jr-accept" type="button" title="Accept"
                    onclick="decideJoinRequest(${r.id}, 'accept')">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button class="jr-reject" type="button" title="Reject"
                    onclick="decideJoinRequest(${r.id}, 'reject')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        </div>`;
    }).join("");
}

async function decideJoinRequest(requestId, decision) {
    const API = window.SkillShareAPI;
    try {
        const data = decision === "accept"
            ? await API.acceptDiscussionJoinRequest(roomId, requestId)
            : await API.rejectDiscussionJoinRequest(roomId, requestId);
        const who =
            (data.request && data.request.user && data.request.user.name) || "The user";
        showToast(decision === "accept"
            ? `${who} can now join the room.`
            : `${who}'s request was declined.`);
        await loadJoinRequests();
    } catch (error) {
        showToast(errorMessage(error), true);
        await loadJoinRequests().catch(() => {});
    }
}

/* ---- Participants panel search (larger rooms) ---- */
function filterParticipants() {
    const input = $("participantSearch");
    if (!input) return;
    const term = input.value.trim().toLowerCase();
    document.querySelectorAll("#participantsList .participant").forEach((el) => {
        const name = (el.textContent || "").toLowerCase();
        el.style.display = !term || name.includes(term) ? "" : "none";
    });
}

async function joinRoom() {
    const API = window.SkillShareAPI;
    try {
        await API.joinDiscussion(roomId);
        room = null;
        messages = [];
        lastMessageId = 0;
        await loadRoomReload();
        showToast("You joined the room.");
    } catch (error) {
        showToast(errorMessage(error), true);
    }
}

async function loadRoomReload() {
    /* Re-fetch room + participants + chat after a membership change. */
    const data = await window.SkillShareAPI.getDiscussion(roomId);
    room = data.room;
    renderRoom();
    await Promise.all([loadParticipants(), loadChat()]);
}

function shareRoom() {
    const url = window.location.origin + window.location.pathname +
        "?room=" + encodeURIComponent(roomId);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => showToast("Room link copied to clipboard."))
            .catch(() => promptCopy(url));
    } else {
        promptCopy(url);
    }
}

function promptCopy(url) {
    window.prompt("Copy this room link:", url);
}

/* ================= PARTICIPANTS ================= */

async function loadParticipants() {
    const data = await window.SkillShareAPI.getDiscussionParticipants(roomId);
    participants = data.participants || [];
    renderParticipants();
}

function renderParticipants() {
    const list = $("participantsList");
    if (!list) return;
    const active = participants.filter((p) => p.status === "joined");

    safeText("participantsChip", String(active.length));
    safeText("participantCount", String(active.length));

    /* Keep the live-media status line in sync with the REAL head-count:
       LiveKit only sees the media peers, the database sees the room. */
    if (window.DiscussionMedia && window.DiscussionMedia.setAppCount) {
        window.DiscussionMedia.setAppCount(active.length);
    }

    if (!participants.length) {
        list.innerHTML = '<p class="empty-note">No participants yet.</p>';
        return;
    }

    list.innerHTML = participants.map((p) => {
        const user = p.user || {};
        const isActive = p.status === "joined";
        const canKick = isHost() && isActive && user.id !== currentUser.id;
        const statusNote = !isActive
            ? `<span class="p-status-note">(${escapeHTML(p.status)})</span>`
            : "";

        return `
        <div class="participant" data-user="${user.id ?? ""}">

            ${avatarHTML(user, "p-avatar")}

            <div class="p-info">
                <b>${escapeHTML(user.name || "Former member")}</b>
                <small>${user.username ? "@" + escapeHTML(user.username) : "Member"} · Joined</small>
                ${statusNote}
            </div>

            <span class="p-role ${String(p.role).toLowerCase()}">${escapeHTML(p.role)}</span>

            ${canKick ? `
                <button class="p-kick" type="button"
                    title="Remove from room"
                    onclick="removeParticipant(${user.id})">
                    <i class="fa-solid fa-user-minus"></i>
                </button>` : ""}

        </div>`;
    }).join("");
}

async function removeParticipant(userId) {
    if (!confirm("Remove this participant from the room?")) return;
    try {
        await window.SkillShareAPI.removeDiscussionParticipant(roomId, userId);
        showToast("Participant removed.");
        await loadParticipants();
    } catch (error) {
        showToast(errorMessage(error), true);
    }
}

/* ================= RESOURCES ================= */

async function loadResources() {
    const list = $("resourcesList");
    if (!list) return;
    try {
        const data = await window.SkillShareAPI.getDiscussionResources(roomId);
        const resources = data.resources || [];

        if (!resources.length) {
            list.innerHTML = '<p class="empty-note">No resources shared yet.</p>';
            return;
        }

        list.innerHTML = resources.map((r) => {
            const icon = r.kind === "github"
                ? "fa-brands fa-github"
                : r.kind === "doc"
                    ? "fa-regular fa-file-lines"
                    : "fa-solid fa-link";
            return `
            <div class="resource-item">
                <i class="${icon}"></i>
                <div class="r-info">
                    <b>${escapeHTML(r.title)}</b>
                    <small>by ${escapeHTML((r.added_by && r.added_by.name) || "Member")}
                        · ${formatDateOnly(r.created_at)}</small>
                </div>
                <a class="r-url" href="${escapeHTML(r.url)}"
                   target="_blank" rel="noopener noreferrer">Open</a>
            </div>`;
        }).join("");
    } catch (error) {
        list.innerHTML = '<p class="empty-note">Unable to load resources.</p>';
    }
}

function toggleResourceForm(show) {
    $("resourceForm").hidden = !show;
    if (show) $("resourceTitle").focus();
}

async function submitResource(event) {
    event.preventDefault();
    const errEl = $("resourceError");
    errEl.hidden = true;

    const title = $("resourceTitle").value.trim();
    const url = $("resourceUrl").value.trim();
    const kind = $("resourceKind").value;

    if (!title) { errEl.textContent = "Title is required."; errEl.hidden = false; return; }
    if (!/^https?:\/\//i.test(url)) {
        errEl.textContent = "URL must start with http:// or https://";
        errEl.hidden = false;
        return;
    }

    try {
        await window.SkillShareAPI.addDiscussionResource(roomId, { title, url, kind });
        $("resourceTitle").value = "";
        $("resourceUrl").value = "";
        $("resourceKind").value = "link";
        toggleResourceForm(false);
        showToast("Resource added.");
        await loadResources();
    } catch (error) {
        errEl.textContent = errorMessage(error);
        errEl.hidden = false;
    }
}

/* ================= EDIT ROOM (host) ================= */

function openEditRoom() {
    if (!isHost()) return;

    $("editTitleInput").value = room.title || "";
    $("editTopicInput").value = room.topic || "";
    $("editDescriptionInput").value = room.description || "";
    $("editDurationInput").value = room.duration_minutes || "";
    $("editMaxInput").value = room.max_participants || 10;
    $("editAgendaInput").value = room.agenda || "";

    const sched = room.scheduled_at ? new Date(room.scheduled_at) : null;
    $("editDateInput").value = sched && !isNaN(sched)
        ? sched.toISOString().slice(0, 10) : "";
    $("editTimeInput").value = sched && !isNaN(sched)
        ? sched.toTimeString().slice(0, 5) : "";

    $("editFormError").hidden = true;
    $("editModal").hidden = false;
    document.body.classList.add("modal-open");
}

function closeEditRoom() {
    $("editModal").hidden = true;
    document.body.classList.remove("modal-open");
}

async function saveRoomEdits(event) {
    event.preventDefault();
    const errEl = $("editFormError");
    errEl.hidden = true;

    const title = $("editTitleInput").value.trim();
    if (!title) { errEl.textContent = "Room title is required."; errEl.hidden = false; return; }

    const date = $("editDateInput").value;
    const time = $("editTimeInput").value;
    const durationRaw = $("editDurationInput").value;
    const maxRaw = $("editMaxInput").value;

    const payload = {
        title,
        topic: $("editTopicInput").value.trim() || null,
        description: $("editDescriptionInput").value.trim() || null,
        agenda: $("editAgendaInput").value.trim() || null,
        scheduled_at: date ? (time ? `${date}T${time}:00` : `${date}T00:00:00`) : null,
        duration_minutes: durationRaw ? parseInt(durationRaw, 10) : null,
        max_participants: maxRaw ? parseInt(maxRaw, 10) : null,
    };

    const button = $("editSubmitBtn");
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';

    try {
        const data = await window.SkillShareAPI.updateDiscussion(roomId, payload);
        room = data.room;
        closeEditRoom();
        renderRoom();
        showToast("Room updated.");
    } catch (error) {
        errEl.textContent = errorMessage(error);
        errEl.hidden = false;
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }
}

/* ================= HOST LIFECYCLE ================= */

async function startRoom() {
    if (!isHost()) return;
    if (!confirm("Start this discussion now?")) return;
    try {
        const data = await window.SkillShareAPI.startDiscussion(roomId);
        room = data.room;
        renderRoom();
        showToast("The discussion is now LIVE.");
    } catch (error) {
        showToast(errorMessage(error), true);
    }
}

async function endRoom() {
    if (!isHost()) return;
    if (!confirm("End this discussion for everyone? This cannot be undone.")) return;
    try {
        const data = await window.SkillShareAPI.endDiscussion(roomId);
        room = data.room;
        renderRoom();
        showToast("Discussion ended.");
    } catch (error) {
        showToast(errorMessage(error), true);
    }
}

async function leaveRoom() {
    if (!confirm("Leave this discussion room?")) return;
    try {
        await window.SkillShareAPI.leaveDiscussion(roomId);
        showToast("You left the room.");
        setTimeout(() => { window.location.href = "live-discussions.html"; }, 600);
    } catch (error) {
        showToast(errorMessage(error), true);
    }
}

/* ================= CHAT ================= */

async function loadChat() {
    const data = await window.SkillShareAPI.getDiscussionMessages(roomId, null, 30);
    const incoming = data.messages || [];
    messages = incoming;
    lastMessageId = messages.length ? messages[messages.length - 1].id : 0;
    renderMessages(true);
}

function renderMessages(forceScroll) {
    const container = $("messages");
    if (!container) return;

    if (!messages.length) {
        container.innerHTML = `
            <div class="chat-empty">
                <i class="fa-regular fa-comments"></i>
                No messages yet.<br>Start the discussion.
            </div>`;
        return;
    }

    const myId = currentUser && currentUser.id;
    container.innerHTML = messages.map((m) => {
        const own = m.sender && m.sender.id === myId;
        const sender = m.sender || {};
        const stateNote = m._pending
            ? '<span class="m-state">Sending…</span>'
            : m._failed
                ? '<span class="m-state failed">Failed to send</span>'
                : "";
        return `
        <div class="message ${own ? "own" : ""}">
            ${avatarHTML(sender, "m-avatar")}
            <div class="m-body">
                <div class="m-meta">
                    <b>${escapeHTML(sender.name || "Member")}</b>
                    <time>${escapeHTML(formatTime(m.created_at))}</time>
                </div>
                <div class="m-content">${escapeHTML(m.content)}</div>
                ${stateNote}
            </div>
        </div>`;
    }).join("");

    if (forceScroll) container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = $("messageInput");
    const sendBtn = $("sendBtn");
    const content = input.value.trim();

    if (!content || sending || !isMember() || !isOpen()) return;

    sending = true;
    sendBtn.disabled = true;
    input.value = "";

    /* Optimistic entry (state: Sending) */
    const optimisticId = "temp_" + Date.now();
    messages.push({
        id: optimisticId,
        sender: {
            id: currentUser.id,
            name: currentUser.name,
            avatar_url: currentUser.avatar_url,
        },
        content: content,
        created_at: new Date().toISOString(),
        _pending: true,
    });
    renderMessages(true);

    try {
        const data = await window.SkillShareAPI.sendDiscussionMessage(roomId, content);
        /* Replace the optimistic entry with the stored one (state: Sent). */
        messages = messages.filter((m) => m.id !== optimisticId);
        messages.push(data.message);
        lastMessageId = Math.max(lastMessageId, data.message.id);
        renderMessages(true);
    } catch (error) {
        /* state: Failed — visible, never silently "sent" */
        const temp = messages.find((m) => m.id === optimisticId);
        if (temp) { temp._failed = true; temp._pending = false; }
        input.value = content;
        renderMessages(false);
        showToast(errorMessage(error), true);
    } finally {
        sending = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

/* ================= LIVEKIT CONTROLS ================= */

function wireLivekitControls() {
    const on = (id, fn) => {
        const el = $(id);
        if (el && !el.dataset.lkWired) {
            el.dataset.lkWired = "1";
            el.addEventListener("click", fn);
        }
    };
    on("micBtn", () => liveMedia().toggleMic());
    on("camBtn", () => liveMedia().toggleCam());
    on("screenBtn", () => liveMedia().toggleScreen());
    on("handBtn", () => liveMedia().toggleHand());
    on("presentBtn", () => liveMedia().togglePresentation());
    on("exitPresentationBtn", () => liveMedia().exitPresentation());
    on("livekitRetryBtn", () => liveMedia().connect(roomId));
    /* Active-share selector: pick which shared screen presentation shows. */
    const shareSel = $("shareSelector");
    if (shareSel) {
        shareSel.addEventListener("click", (e) => {
            const btn = e.target.closest(".share-option");
            if (!btn) return;
            const media = liveMedia();
            if (media.setActiveShare) {
                media.setActiveShare(btn.dataset.share);
                /* Selecting another shared screen must not exit Present mode
                   — only enter it when not presenting yet (D10). */
                if (!media.presentMode) media.togglePresentation();
            }
        });
    }
    /* Participant search uses the "input" event (not "click"): it is wired
       directly because the click-only helper above requires a function. */
    const pSearch = $("participantSearch");
    if (pSearch && !pSearch.dataset.lkWired) {
        pSearch.dataset.lkWired = "1";
        pSearch.addEventListener("input", filterParticipants);
    }
    window.addEventListener("beforeunload", () => {
        try { liveMedia().disconnect(); } catch (e) {}
    });
}

/* ================= POLLING (light) ================= */

function startPolling() {
    clearInterval(pollTimer);
    pollTick = 0;
    /* One 6s interval: chat every tick, participants + room status
       every 3rd tick (≈18s). Skips entirely when the tab is hidden —
       no request loops, no requests every few milliseconds. */
    pollTimer = setInterval(async () => {
        if (document.hidden || !room) return;
        pollTick += 1;
        try {
            await loadChat();
        } catch (error) { /* transient — next tick retries */ }

        if (pollTick % 3 === 0) {
            try {
                const data = await window.SkillShareAPI.getDiscussion(roomId);
                const prevReq = room.my_join_request;
                const prevPending = room.pending_requests_count;
                if (data.room.status !== room.status ||
                    data.room.participant_count !== room.participant_count ||
                    data.room.my_join_request !== prevReq ||
                    data.room.pending_requests_count !== prevPending) {
                    room = data.room;
                    renderRoom();
                    /* Approval / rejection notifications (real state changes
                       only — the backend is the source of truth). */
                    if (data.room.my_join_request !== prevReq) {
                        if (data.room.my_join_request === "accepted") {
                            showToast("The host approved your request — you can join now.");
                        } else if (data.room.my_join_request === "rejected") {
                            showToast("The host declined your request.", true);
                        }
                    }
                    if (isHost() && data.room.pending_requests_count !== prevPending) {
                        loadJoinRequests().catch(() => {});
                    }
                }
                await loadParticipants();
                await loadResources();
            } catch (error) { /* transient */ }
        }
    }, 6000);
}

/* ================= WIRING + INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {
    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
        window.location.href =
            "login.html?next=" +
            encodeURIComponent("discussion-room.html" + window.location.search);
        return;
    }

    const safeOn = (id, event, handler) => {
        const el = $(id);
        if (el) el.addEventListener(event, handler);
    };

    safeOn("sendBtn", "click", sendMessage);
    safeOn("messageInput", "keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMessage();
        }
    });

    safeOn("editRoomBtn", "click", openEditRoom);
    safeOn("editRoomForm", "submit", saveRoomEdits);
    safeOn("startRoomBtn", "click", startRoom);
    safeOn("endRoomBtn", "click", endRoom);

    safeOn("addResourceBtn", "click", () => toggleResourceForm(true));
    safeOn("cancelResourceBtn", "click", () => toggleResourceForm(false));
    safeOn("resourceForm", "submit", submitResource);

    safeOn("editModal", "click", (e) => {
        if (e.target === e.currentTarget) closeEditRoom();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeEditRoom();
    });

    await loadRoom();

    /* Leave button only for non-host members — the host ends the room
       instead (a normal Leave must never destroy the room). */
    if (room && isMember() && !isHost()) {
        const leaveBtn = document.createElement("button");
        leaveBtn.className = "danger-btn";
        leaveBtn.type = "button";
        leaveBtn.innerHTML =
            '<i class="fa-solid fa-right-from-bracket"></i> Leave';
        leaveBtn.addEventListener("click", leaveRoom);
        const header = $("roomHeader");
        if (header) header.appendChild(leaveBtn);
    }

    if (room) loadResources().catch(() => {});
});






