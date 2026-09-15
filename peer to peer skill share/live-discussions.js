/* =========================================================
   SKILLCONNECT — LIVE DISCUSSIONS (real backend edition)
   All data comes from /api/discussions/* (PostgreSQL via
   FastAPI). The JWT user is the only identity used; no
   localStorage "room database" exists any more.
   ========================================================= */

"use strict";

/* ================= STATE ================= */

let currentTab = "all";
let searchTimer = null;
let latestQueryId = 0;      // guards against stale search results
let roomsCache = [];        // last successful payload (per current filter)
let creating = false;       // create-room in-flight guard (double-click safe)

/* ================= HELPERS ================= */

const escapeHTML = (value) => {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
};

const initialsOf = (name) =>
    String(name || "?").trim().split(/\s+/).map((w) => w[0]).join("")
        .slice(0, 2).toUpperCase() || "?";

function roomUrl(id) {
    return "discussion-room.html?room=" + encodeURIComponent(id);
}

function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d)) return "";
    const today = new Date();
    const opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== today.getFullYear()) opts.year = "numeric";
    const date = d.toLocaleDateString(undefined, opts);
    const time = d.toLocaleTimeString(undefined, {
        hour: "numeric", minute: "2-digit",
    });
    return `${date}, ${time}`;
}

let toastTimer;
function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    const text = document.getElementById("toastText");
    const icon = toast.querySelector("i");
    text.textContent = message;
    icon.className = isError
        ? "fa-solid fa-circle-exclamation"
        : "fa-solid fa-circle-check";
    toast.classList.toggle("error", isError);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function errorMessage(error) {
    if (window.SkillShareAuth) {
        return window.SkillShareAuth.getErrorMessage(error);
    }
    return (error && error.message) || "Something went wrong.";
}

/* ================= TABS ================= */

function setTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".tabs .tab").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tab);
    });
    loadRooms();
}

/* ================= LOAD + RENDER ROOMS ================= */

async function loadRooms() {
    const container = document.getElementById("roomsContainer");
    const queryId = ++latestQueryId;
    const term = document.getElementById("searchInput").value.trim();
    const category = document.getElementById("categoryFilter").value;

    container.innerHTML = `
        <div class="state-card">
            <div class="spinner"></div>
            <p>Loading discussions...</p>
        </div>`;

    const API = window.SkillShareAPI;
    if (!API) {
        renderErrorState(container, "API client unavailable.", "Retry", loadRooms);
        return;
    }

    try {
        const data = await API.listDiscussions({
            q: term,
            category: category,
            filter: currentTab,
            limit: 60,
        });

        if (queryId !== latestQueryId) return; // newer query in flight

        roomsCache = data.rooms || [];
        renderRooms(applySort(roomsCache));
        updateOverview(roomsCache);
    } catch (error) {
        if (queryId !== latestQueryId) return;
        renderErrorState(container, errorMessage(error), "Retry", loadRooms);
    }
}

function renderErrorState(container, message, buttonLabel, retryFn) {
    container.innerHTML = `
        <div class="state-card error">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <p>${escapeHTML(message)}</p>
            <button class="retry-btn" type="button">
                <i class="fa-solid fa-rotate-right"></i> ${escapeHTML(buttonLabel || "Retry")}
            </button>
        </div>`;
    container.querySelector(".retry-btn").addEventListener("click", retryFn);
}

function statusBadge(room) {
    const map = {
        LIVE: ["live", "LIVE"],
        SCHEDULED: ["scheduled", "SCHEDULED"],
        ENDED: ["ended", "ENDED"],
        CANCELLED: ["ended", "CANCELLED"],
    };
    const [cls, label] = map[room.status] || ["scheduled", room.status];
    return `<span class="status-badge ${cls}">
        ${cls === "live" ? '<span class="live-dot"></span>' : ""}${escapeHTML(label)}
    </span>`;
}

function renderRooms(rooms) {
    const container = document.getElementById("roomsContainer");
    document.getElementById("resultCount").textContent =
        rooms.length === 1 ? "1 room" : `${rooms.length} rooms`;

    if (!rooms.length) {
        const emptyText = {
            all: "No discussions match your search yet.",
            live: "No rooms are live right now. Check back soon or host your own.",
            upcoming: "No upcoming rooms scheduled yet.",
            mine: "You haven't created any rooms yet.",
            joined: "You haven't joined any rooms yet.",
        };
        container.innerHTML = `
            <div class="state-card">
                <i class="fa-regular fa-comments"></i>
                <p>${escapeHTML(emptyText[currentTab] || emptyText.all)}</p>
                <button class="retry-btn" type="button" onclick="openCreateRoom()">
                    <i class="fa-solid fa-plus"></i> Create Room
                </button>
            </div>`;
        return;
    }

    container.innerHTML = rooms.map((room) => {
        const host = room.host || {};
        const count = room.participant_count || 0;
        const full = count >= room.max_participants;
        const closed = room.status === "ENDED" || room.status === "CANCELLED";

        let action;
        if (room.is_host || room.is_member) {
            action = `<a class="room-btn primary" href="${roomUrl(room.id)}">
                <i class="fa-solid fa-right-to-bracket"></i>
                ${room.is_host ? "Open Room" : "Continue"}
            </a>`;
        } else if (closed) {
            action = `<a class="room-btn ghost" href="${roomUrl(room.id)}">View Room</a>`;
        } else if (full) {
            action = `<button class="room-btn ghost" type="button" disabled title="This room is full">Room Full</button>`;
        } else {
            action = `<button class="room-btn primary" type="button"
                onclick="joinRoom(${room.id})" data-join="${room.id}">
                <i class="fa-solid fa-right-to-bracket"></i> Join Room
            </button>`;
        }

        return `
        <article class="room-card" data-room="${room.id}">

            <div class="room-card-top">

                <div class="room-avatar">${escapeHTML(initialsOf(room.title))}</div>

                <div class="room-titles">
                    <h3><a href="${roomUrl(room.id)}">${escapeHTML(room.title)}</a></h3>
                    <p class="room-host">
                        <i class="fa-solid fa-microphone-lines"></i>
                        Hosted by ${escapeHTML(host.name || "Unknown host")}
                        ${room.is_host ? '<span class="you-chip">You</span>' : ""}
                    </p>
                </div>

                ${statusBadge(room)}

            </div>

            ${room.description
                ? `<p class="room-desc">${escapeHTML(room.description)}</p>`
                : ""}

            <div class="room-meta">

                ${room.topic
                    ? `<span class="meta-chip" title="Topic">
                        <i class="fa-solid fa-tag"></i> ${escapeHTML(room.topic)}</span>`
                    : ""}
                ${room.category
                    ? `<span class="meta-chip">
                        <i class="fa-solid fa-layer-group"></i> ${escapeHTML(room.category)}</span>`
                    : ""}
                ${room.scheduled_at
                    ? `<span class="meta-chip">
                        <i class="fa-regular fa-clock"></i> ${escapeHTML(formatDate(room.scheduled_at))}</span>`
                    : ""}

            </div>

            <div class="room-card-bottom">

                <div class="participants-count ${full ? "full" : ""}"
                     title="${count} of ${room.max_participants} participants">
                    <i class="fa-solid fa-user-group"></i>
                    ${count} / ${room.max_participants}
                </div>

                ${action}

            </div>

        </article>`;
    }).join("");
}

function updateOverview(rooms) {
    document.getElementById("statTotal").textContent = rooms.length;
    document.getElementById("statLive").textContent =
        rooms.filter((r) => r.status === "LIVE").length;
    document.getElementById("statUpcoming").textContent =
        rooms.filter((r) => r.status === "SCHEDULED").length;
    // "Joined" = rooms where I am a non-host member (real backend flags).
    document.getElementById("statJoined").textContent =
        rooms.filter((r) => r.is_member && !r.is_host).length;

    // "My rooms" side panel: real rooms I host (same payload, no extra call).
    const mine = roomsCache.filter((r) => r.is_host).slice(0, 4);
    const list = document.getElementById("myRoomsList");
    if (!mine.length) {
        list.innerHTML =
            '<p class="side-empty">You haven\'t created any rooms yet.</p>';
        return;
    }
    list.innerHTML = mine.map((room) => `
        <a class="mini-room" href="${roomUrl(room.id)}">
            <span class="mini-avatar">${escapeHTML(initialsOf(room.title))}</span>
            <span class="mini-info">
                <strong>${escapeHTML(room.title)}</strong>
                <small>${room.participant_count || 0} / ${room.max_participants || "?"} · ${escapeHTML(room.status)}</small>
            </span>
            <i class="fa-solid fa-chevron-right"></i>
        </a>
    `).join("");
}

/* Client-side sort for the visible payload (no extra API, no fake control):
   the sort select now actually reorders what the server returned. */
function applySort(rooms) {
    const mode = (document.getElementById("sortFilter") || {}).value || "newest";
    const list = rooms.slice();
    if (mode === "oldest") {
        list.sort((a, b) => (a.id || 0) - (b.id || 0));
    } else if (mode === "participants") {
        list.sort((a, b) => (b.participant_count || 0) - (a.participant_count || 0));
    } else {
        list.sort((a, b) => (b.id || 0) - (a.id || 0)); // newest first
    }
    return list;
}

/* ================= JOIN ROOM ================= */

async function joinRoom(roomId, button) {
    const API = window.SkillShareAPI;
    if (!API || !roomId) return;

    const original = button ? button.innerHTML : null;
    if (button) {
        button.disabled = true;
        button.innerHTML =
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Joining...';
    }

    try {
        await API.joinDiscussion(roomId);
        window.location.href = roomUrl(roomId);
    } catch (error) {
        if (button && original) {
            button.disabled = false;
            button.innerHTML = original;
        }
        showToast(errorMessage(error), true);
        // Refresh so a full room / ended room reflects the new state.
        loadRooms();
    }
}

/* ================= CREATE ROOM ================= */

function openCreateRoom() {
    const modal = document.getElementById("createModal");
    modal.hidden = false;
    document.body.classList.add("modal-open");
    initCreateDefaults();
    setTimeout(() => document.getElementById("roomTitle").focus(), 60);
}

function closeCreateRoom() {
    const modal = document.getElementById("createModal");
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    const err = document.getElementById("createFormError");
    err.hidden = true;
}

function showFormError(message) {
    const err = document.getElementById("createFormError");
    if (!err) {
        showToast(message, true);
        return;
    }
    err.textContent = message;
    err.hidden = false;
}

function hideFormError() {
    const err = document.getElementById("createFormError");
    if (err) err.hidden = true;
}

async function submitCreateRoom(event) {
    event.preventDefault();
    if (creating) return;   // double-click guard: one request at a time
    hideFormError();

    const title = document.getElementById("roomTitle").value.trim();
    const topic = document.getElementById("roomTopic").value.trim();
    const maxRaw = document.getElementById("roomMax").value;
    const maxParticipants = parseInt(String(maxRaw).trim(), 10);
    const ALLOWED_MAX = [5, 10, 15, 20, 25, 50];

    if (!title) return showFormError("Room title is required.");
    if (!topic) return showFormError("Topic is required.");
    if (!ALLOWED_MAX.includes(maxParticipants)) {
        return showFormError("Please choose a valid participant limit (5, 10, 15, 20, 25 or 50).");
    }

    const date = document.getElementById("roomDate").value;   // yyyy-mm-dd
    const time = document.getElementById("roomTime").value;   // hh:mm
    if (!date) return showFormError("Please choose a date.");
    if (!time) return showFormError("Please choose a time.");

    // Local-timezone scheduling: the browser value is a local wall time.
    // It is sent as a well-defined local datetime string; the backend
    // stores it consistently and the UI renders it back in local time.
    const scheduled = new Date(`${date}T${time}:00`);
    if (isNaN(scheduled.getTime())) {
        return showFormError("That date/time is not valid. Please pick another.");
    }
    if (scheduled.getTime() <= Date.now() - 60000) {
        return showFormError("Please select a future time.");
    }
    const scheduledAt = `${date}T${time}:00`;

    const durationRaw = document.getElementById("roomDuration").value;

    const payload = {
        title: title,
        description: document.getElementById("roomDescription").value.trim() || null,
        topic: topic,
        category: document.getElementById("roomCategory").value || null,
        room_type: document.getElementById("roomType").value,
        max_participants: maxParticipants,
        duration_minutes: durationRaw ? parseInt(durationRaw, 10) : null,
        scheduled_at: scheduledAt,
        agenda: document.getElementById("roomAgenda").value.trim() || null,
    };

    const button = document.getElementById("createSubmitBtn");
    const original = button.innerHTML;
    creating = true;
    button.disabled = true;
    button.innerHTML =
        '<i class="fa-solid fa-circle-notch fa-spin"></i> Creating...';

    try {
        const data = await window.SkillShareAPI.createDiscussion(payload);
        // Backend returns { room: {...} }; accept a bare-room shape too so a
        // response-shape drift can never produce ?room=undefined.
        const room = (data && data.room) || data || {};
        if (!room.id) throw new Error("Room created but no ID was returned.");

        showToast("Room created. Opening it now...");
        // Direct route to the real room — no dead page in between.
        window.location.href = roomUrl(room.id);
    } catch (error) {
        creating = false;
        button.disabled = false;
        button.innerHTML = original;
        showFormError(errorMessage(error));
    }
}

/* Friendly date/time defaults: min = today, default = tomorrow 19:00. */
function initCreateDefaults() {
    try {
        const dateEl = document.getElementById("roomDate");
        const timeEl = document.getElementById("roomTime");
        if (!dateEl || !timeEl) return;
        const pad = (n) => String(n).padStart(2, "0");
        const now = new Date();
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        dateEl.min = today;
        if (!dateEl.value) {
            const tmr = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            dateEl.value = `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}`;
        }
        if (!timeEl.value) timeEl.value = "19:00";
    } catch (error) { /* defaults are a nicety — never block the form */ }
}

/* ================= GLOBAL EVENTS + INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {
    /* Auth: rely on the shared service (redirects to login when the
       session is missing/expired). */
    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
        window.location.href = "login.html?next=live-discussions.html";
        return;
    }

    /* Every lookup below is guarded: one missing element must never abort
       the rest of initialisation. (An unguarded lookup previously threw
       here, which killed the submit listener and the first loadRooms(),
       leaving the page stuck on the loading skeleton.) */
    const on = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, handler);
    };

    on("searchInput", "input", () => {
        // Debounced search: one request per settled keystroke burst,
        // stale responses are discarded via latestQueryId.
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadRooms, 250);
    });

    on("categoryFilter", "change", loadRooms);

    document.querySelectorAll(".tabs .tab").forEach((button) => {
        button.addEventListener("click", () => setTab(button.dataset.tab));
    });

    on("createRoomForm", "submit", submitCreateRoom);

    on("createModal", "click", (e) => {
        if (e.target === e.currentTarget) closeCreateRoom();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeCreateRoom();
    });

    await loadRooms();
});

