/* =========================================================
   SKILLSHARE — MATCH WAITING
   Calm, reassuring matching experience (self-contained)
   ========================================================= */

"use strict";

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       1. CONFIGURATION (single source of truth)
       Total matching duration in ms. Supported: 2000–5000.
       All step timings are derived from this value —
       nothing else needs to change.
    ===================================================== */

    const MATCHING_DURATION = 4000;

    const REDIRECT_URL = "live-room.html";

    const BACK_URL = "live-learning.html";

    const STATUS_MESSAGES = [
        "Understanding your learning goals...",
        "Finding compatible learners...",
        "Comparing skills and interests...",
        "Preparing your learning session..."
    ];

    /* Timings derived from MATCHING_DURATION — do not hard-code elsewhere */

    const STEP_COUNT = STATUS_MESSAGES.length;

    const STEP_INTERVAL = MATCHING_DURATION / STEP_COUNT;

    const READY_NOTE_DELAY = 1100;   /* after match found -> "room is ready" */

    const EXIT_FADE_DELAY = 900;     /* after ready note -> start fade out */

    const REDIRECT_EXTRA = 600;      /* fade duration before navigating */


    /* =====================================================
       2. ELEMENTS
    ===================================================== */

    const card = document.getElementById("matchCard");

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

    const previewSkill = document.getElementById("previewSkill");

    const previewScore = document.getElementById("previewScore");

    const previewInterests =
        document.getElementById("previewInterests");

    const readyNote = document.getElementById("readyNote");

    const cancelBtn = document.getElementById("cancelBtn");

    const reduceMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;


    /* =====================================================
       3. MATCH DATA (sessionStorage set by live-learning.js)
    ===================================================== */

    function readPending(key) {

        try {

            const raw = sessionStorage.getItem(key);

            return raw ? JSON.parse(raw) : null;

        } catch (error) {

            return null;

        }

    }

    function fillPreview() {

        const person = readPending("skillconnectPendingMatch");

        const skill = readPending("skillconnectPendingSkill");

        /* Demo fallback so the page always works, even when
           opened directly without the Live Learning flow. */

        const fallback = {
            name: "Alex",
            role: "English Coach",
            skills: [
                "English conversation",
                "Communication",
                "Daily practice"
            ],
            rating: 4.8,
            avatar: "AX"
        };

        const match = person || fallback;

        const initials = (match.avatar || match.name || "A")
            .split(" ")
            .map(word => word[0])
            .join("")
            .substring(0, 2)
            .toUpperCase();

        const skillLine =
            skill ||
            (match.skills && match.skills[0]) ||
            "English Speaking";

        const interests =
            match.skills && match.skills.length
                ? match.skills.slice(0, 3)
                : fallback.skills;

        const score =
            Math.min(
                98,
                Math.round(84 + (match.rating || 4.7) * 2.4)
            );

        previewAvatar.textContent = initials;

        previewName.textContent = match.name || "Alex";

        previewSkill.textContent = skillLine;

        previewScore.textContent = score + "%";

        previewInterests.innerHTML = interests
            .map(item => `<li>${escapeHTML(item)}</li>`)
            .join("");

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
       4. TIMELINE
    ===================================================== */

    let redirected = false;

    function goToStep(step) {

        /* step: 1..STEP_COUNT */

        statusText.textContent = STATUS_MESSAGES[step - 1];

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

    function revealSuccess() {

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

    function exitToRoom() {

        if (redirected) return;

        redirected = true;

        readyNote.hidden = false;

        window.setTimeout(() => {

            card.classList.add("leaving");

        }, EXIT_FADE_DELAY);

        window.setTimeout(() => {

            window.location.href = REDIRECT_URL;

        }, EXIT_FADE_DELAY + REDIRECT_EXTRA);

    }

    function startTimeline() {

        /* Steps 1..(N-1) are interim messages; the last
           step triggers the "great match found" reveal. */

        goToStep(1);

        for (let step = 2; step <= STEP_COUNT; step++) {

            window.setTimeout(
                () => goToStep(step),
                STEP_INTERVAL * (step - 1)
            );

        }

        /* Match found — reveal the preview smoothly */

        window.setTimeout(revealSuccess, MATCHING_DURATION);

        /* Shortly before redirecting: room ready state */

        window.setTimeout(
            exitToRoom,
            MATCHING_DURATION + READY_NOTE_DELAY
        );

    }


    /* =====================================================
       5. CANCEL (quiet escape hatch)
    ===================================================== */

    if (cancelBtn) {

        cancelBtn.addEventListener("click", () => {

            redirected = true;

            window.location.href = BACK_URL;

        });

    }


    /* =====================================================
       6. START
    ===================================================== */

    fillPreview();

    startTimeline();

    console.log(
        "SkillShare matching started · duration:",
        MATCHING_DURATION + "ms"
    );

});
