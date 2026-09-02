/* =========================================================
   SKILLSHARE — DISCUSSION WAITING
   Calm matching experience for the Live Discussion flow.
   Self-contained: own config, state and timeline.
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       1. CONFIGURATION (single source of truth)
       Total matching duration in ms. Supported: 2000–5000.
       Every timing below is derived from this value —
       do not hard-code timeouts elsewhere.
    ===================================================== */

    const DISCUSSION_MATCH_DURATION = 4000;

    const DISCUSSION_ROOM_URL = "discussion-room.html";

    const DISCUSSION_HOME_URL = "live-discussions.html";

    const DISCUSSION_STEPS = [
        "Understanding your discussion interests...",
        "Looking for compatible people...",
        "Comparing interests and conversation topics...",
        "Preparing your discussion room..."
    ];

    /* Derived timings — no scattered timeout values */

    const STEP_COUNT = DISCUSSION_STEPS.length;

    const STEP_INTERVAL = DISCUSSION_MATCH_DURATION / STEP_COUNT;

    const READY_NOTE_DELAY = 1100;   /* partner found -> "room is ready" */

    const EXIT_FADE_DELAY = 900;     /* ready note -> start fade out */

    const REDIRECT_EXTRA = 600;      /* fade duration before navigating */


    /* =====================================================
       2. ELEMENTS
    ===================================================== */

    const card = document.getElementById("matchCard");

    const topicChip = document.getElementById("topicChip");

    const topicName = document.getElementById("topicName");

    const statusZone = document.getElementById("statusZone");

    const statusText = document.getElementById("statusText");

    const progressFill = document.getElementById("progressFill");

    const progressDot = document.getElementById("progressDot");

    const progressTrack = document.getElementById("progressTrack");

    const stepCount = document.getElementById("stepCount");

    const comfortBox = document.getElementById("comfortBox");

    const successZone = document.getElementById("successZone");

    const previewAvatar = document.getElementById("previewAvatar");

    const previewName = document.getElementById("previewName");

    const previewTopic = document.getElementById("previewTopic");

    const previewScore = document.getElementById("previewScore");

    const previewInterests =
        document.getElementById("previewInterests");

    const readyNote = document.getElementById("readyNote");

    const cancelBtn = document.getElementById("cancelBtn");

    const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;


    /* =====================================================
       3. DISCUSSION CONTEXT
       The Live Discussion page already stores the selected
       room (title/category = topic) in localStorage under
       "skillconnect_current_room" before navigating here.

       BACKEND HOOK (Flask/PostgreSQL later):
       replace readDiscussionContext() with
       fetch("/api/discussions/match") and return the
       response JSON — the UI below needs no other change.
    ===================================================== */

    const DEMO_DISCUSSION_MATCH = {
        /* DEMO DATA ONLY — clearly a placeholder until a real
           matching endpoint exists. Shape mirrors a future API
           response: { name, avatar, topic, interests, score } */
        name: "Alex",
        avatar: "AX",
        topic: "Technology & AI",
        interests: [
            "Artificial Intelligence",
            "Technology",
            "Programming"
        ],
        score: 94
    };

    function readStoredRoom() {

        try {

            const raw =
                localStorage.getItem("skillconnect_current_room");

            return raw ? JSON.parse(raw) : null;

        } catch (error) {

            return null;

        }

    }

    function readDiscussionContext() {

        const room = readStoredRoom();

        return {
            room: room,                                   /* may be null */
            topic: room ? room.title : DEMO_DISCUSSION_MATCH.topic,
            category: room ? room.category : "Technology & AI",
            match: DEMO_DISCUSSION_MATCH
        };

    }

    function escapeHTML(value) {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    /* =====================================================
       4. TOPIC HANDOFF
       The topic stays in localStorage ("skillconnect_current_room")
       so discussion-room.html receives it with no extra work.
       For direct visits (no room selected) we show the demo
       topic so the page always makes sense.
    ===================================================== */

    function renderDiscussionContext(context) {

        if (context.room && context.room.title) {

            topicName.textContent = context.room.title;

            topicChip.hidden = false;

        } else {

            topicName.textContent = context.match.topic;

            topicChip.hidden = false;

        }

    }

    /* =====================================================
       5. MATCH PREVIEW
       Demo information only — clearly labelled, no fake
       database queries. prepareDiscussionRoom() is the single
       place to plug real Flask/PostgreSQL data later.
    ===================================================== */

    function renderDiscussionMatch(context) {

        const match = context.match;

        previewAvatar.textContent = match.avatar;

        previewName.textContent = match.name;

        previewTopic.textContent =
            context.room && context.room.category
                ? context.room.category
                : match.topic;

        previewScore.textContent = match.score + "%";

        previewInterests.innerHTML = match.interests
            .map(item => `<li>${escapeHTML(item)}</li>`)
            .join("");

    }

    function showDiscussionMatch() {

        /* Gently retire the matching UI */

        statusZone.classList.add("leaving");

        comfortBox.classList.add("leaving");

        /* Swap to the success state */

        window.setTimeout(() => {

            statusZone.hidden = true;

            comfortBox.hidden = true;

            successZone.hidden = false;

        }, reduceMotion ? 0 : 380);

    }

    /* =====================================================
       6. TIMELINE
       Refresh handling: this page is stateless — a refresh
       simply restarts the matching from step 1. There is no
       redirect loop: only this page routes to the waiting
       screen, and it always moves forward to the room.
    ===================================================== */

    function updateDiscussionStep(step) {

        /* step: 1..STEP_COUNT */

        statusText.textContent = DISCUSSION_STEPS[step - 1];

        stepCount.textContent = `Step ${step} of ${STEP_COUNT}`;

        const position =
            8 + ((step - 1) / (STEP_COUNT - 1)) * 88;

        progressFill.style.width = position + "%";

        progressDot.style.left = position + "%";

        progressTrack.setAttribute(
            "aria-valuenow",
            String(step)
        );

    }

    function prepareDiscussionRoom() {

        /* BACKEND HOOK (WebSocket / real-time layer later):
           join the discussion channel here before navigating,
           e.g. socket.emit("join_room", { topic }).
           For now the room data already lives in
           localStorage["skillconnect_current_room"]. */

        /* Success reveal + ready note + smooth exit */

        window.setTimeout(
            showDiscussionMatch,
            DISCUSSION_MATCH_DURATION
        );

        window.setTimeout(() => {

            readyNote.hidden = false;

        }, DISCUSSION_MATCH_DURATION + READY_NOTE_DELAY);

    }

    function redirectToDiscussionRoom() {

        card.classList.add("leaving");

        window.setTimeout(() => {

            window.location.href = DISCUSSION_ROOM_URL;

        }, REDIRECT_EXTRA);

    }

    function startDiscussionMatching() {

        const context = readDiscussionContext();

        renderDiscussionContext(context);

        renderDiscussionMatch(context);

        updateDiscussionStep(1);

        for (let step = 2; step <= STEP_COUNT; step++) {

            window.setTimeout(
                () => updateDiscussionStep(step),
                STEP_INTERVAL * (step - 1)
            );

        }

        prepareDiscussionRoom();

        /* Fade out and head to the room */

        window.setTimeout(
            redirectToDiscussionRoom,
            DISCUSSION_MATCH_DURATION +
                READY_NOTE_DELAY + EXIT_FADE_DELAY
        );

    }


    /* =====================================================
       7. CANCEL (quiet escape hatch)
    ===================================================== */

    if (cancelBtn) {

        cancelBtn.addEventListener("click", () => {

            window.location.href = DISCUSSION_HOME_URL;

        });

    }


    /* =====================================================
       8. START
    ===================================================== */

    startDiscussionMatching();

    console.log(
        "SkillShare discussion matching started · duration:",
        DISCUSSION_MATCH_DURATION + "ms"
    );

});
