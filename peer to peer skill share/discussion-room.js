/* =========================================================
   SKILLCONNECT DISCUSSION ROOM
   Vanilla JavaScript
========================================================= */


/* =========================================================
   DEMO ROOM DATA
========================================================= */

const defaultParticipants = [
    {
        id: 1,
        name: "Aniket Deshmukh",
        initials: "Ad",
        host: true,
        muted: false
    },

    {
        id: 2,
        name: "Priya Singh",
        initials: "PS",
        host: false,
        muted: false
    },

    {
        id: 3,
        name: "Rahul Sharma",
        initials: "RS",
        host: false,
        muted: false
    },

    {
        id: 4,
        name: "Neha Patel",
        initials: "NP",
        host: false,
        muted: true
    },

    {
        id: 5,
        name: "Rohit Kumar",
        initials: "RK",
        host: false,
        muted: false
    },

    {
        id: 6,
        name: "Sneha Iyer",
        initials: "SI",
        host: false,
        muted: false
    },

    {
        id: 7,
        name: "Vikram Joshi",
        initials: "VJ",
        host: false,
        muted: false
    },

    {
        id: 8,
        name: "Meera Joshi",
        initials: "MJ",
        host: false,
        muted: false
    },

    {
        id: 9,
        name: "Arjun Nair",
        initials: "AN",
        host: false,
        muted: true
    },

    {
        id: 10,
        name: "Kavya Reddy",
        initials: "KR",
        host: false,
        muted: false
    }
];



/* =========================================================
   STATE
========================================================= */

let participants =
    JSON.parse(
        localStorage.getItem("skillconnect_room_participants")
    ) || defaultParticipants;

let roomStartTime =
    localStorage.getItem("skillconnect_room_start");

if (!roomStartTime) {

    roomStartTime = Date.now();

    localStorage.setItem(
        "skillconnect_room_start",
        roomStartTime
    );
}

let isHost = true;

let selectedParticipant = null;

let timerInterval;

let micOn = true;
let cameraOn = true;
let recording = false;
let handRaised = false;
let screenSharing = false;



/* =========================================================
   DOM
========================================================= */

const videoGrid =
    document.getElementById("videoGrid");

const participantCount =
    document.getElementById("participantCount");

const participantSmallCount =
    document.getElementById("participantSmallCount");

const timer =
    document.getElementById("timer");

const miniParticipants =
    document.getElementById("miniParticipants");

const participantMenu =
    document.getElementById("participantMenu");

const moreMenu =
    document.getElementById("moreMenu");

const toast =
    document.getElementById("toast");



/* =========================================================
   RECEIVE SELECTED DISCUSSION TOPIC
   (added: Live Discussion -> matching -> room flow)

   The Live Discussion page stores the joined room in
   localStorage["skillconnect_current_room"] before the
   matching experience runs. Apply its title here so the
   room header reflects the topic the user actually chose.

   BACKEND HOOK (Flask/PostgreSQL later): replace this
   localStorage read with the real room payload from the
   API/WebSocket — the DOM update stays the same.
========================================================= */

function applyCurrentRoomTopic() {

    try {

        const raw =
            localStorage.getItem("skillconnect_current_room");

        if (!raw) return;

        const room = JSON.parse(raw);

        const titleElement =
            document.getElementById("roomTitle");

        if (room && room.title && titleElement) {

            titleElement.textContent = room.title;

        }

    } catch (error) {

        /* Corrupted or missing data: keep the default title. */

        console.warn(
            "Could not apply the selected discussion topic.",
            error
        );

    }

}

applyCurrentRoomTopic();



/* =========================================================
   INIT
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        renderParticipants();

        renderMiniParticipants();

        updateParticipantCount();

        startTimer();

        setupControls();

        setupChat();

        setupGlobalEvents();

    }
);



/* =========================================================
   RENDER PARTICIPANTS
========================================================= */

function renderParticipants() {

    videoGrid.innerHTML = "";

    participants.forEach(
        participant => {

            const tile =
                document.createElement("div");

            tile.className =
                "video-tile" +
                (participant.host ? " host" : "");

            tile.dataset.id =
                participant.id;


            tile.innerHTML = `

                <div class="person">
                    ${participant.initials}
                </div>

                ${
                    participant.host
                    ?
                    `<div class="host-badge">
                        Host
                    </div>`
                    :
                    ""
                }

                <button
                    class="tile-menu-btn"
                    data-menu-id="${participant.id}"
                    aria-label="Participant options"
                >
                    ⋮
                </button>

                <div class="person-name">

                    ${participant.name}

                    <span
                        class="${
                            participant.muted
                            ? "mic-muted"
                            : "mic-status"
                        }"
                    >
                        ${
                            participant.muted
                            ? "♩"
                            : "🎙"
                        }
                    </span>

                </div>
            `;


            videoGrid.appendChild(tile);

        }
    );


    document
        .querySelectorAll(".tile-menu-btn")
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();

                        const id =
                            Number(
                                button.dataset.menuId
                            );

                        openParticipantMenu(
                            id,
                            button
                        );

                    }
                );

            }
        );

}



/* =========================================================
   PARTICIPANT COUNT
========================================================= */

function updateParticipantCount() {

    const count =
        participants.length;

    participantCount.textContent =
        `${count} / 10`;

    participantSmallCount.textContent =
        count;

    renderMiniParticipants();

    saveParticipants();

}



/* =========================================================
   MINI PARTICIPANTS
========================================================= */

function renderMiniParticipants() {

    miniParticipants.innerHTML = "";

    const visible =
        participants.slice(0, 5);

    visible.forEach(
        participant => {

            const avatar =
                document.createElement("div");

            avatar.className =
                "mini-avatar";

            avatar.textContent =
                participant.initials;

            miniParticipants.appendChild(
                avatar
            );

        }
    );


    if (participants.length > 5) {

        const more =
            document.createElement("div");

        more.className =
            "mini-avatar more-avatar";

        more.textContent =
            `+${participants.length - 5}`;

        miniParticipants.appendChild(
            more
        );

    }

}



/* =========================================================
   LOCAL STORAGE
========================================================= */

function saveParticipants() {

    localStorage.setItem(
        "skillconnect_room_participants",
        JSON.stringify(participants)
    );

}



/* =========================================================
   PARTICIPANT MENU
========================================================= */

function openParticipantMenu(
    id,
    button
) {

    selectedParticipant =
        participants.find(
            p => p.id === id
        );

    if (!selectedParticipant) {
        return;
    }


    const rect =
        button.getBoundingClientRect();


    participantMenu.style.left =
        `${Math.min(
            rect.left,
            window.innerWidth - 200
        )}px`;

    participantMenu.style.top =
        `${rect.bottom + 5}px`;


    participantMenu.classList.add(
        "show"
    );


    /*
        Host cannot kick themselves.
    */

    const kickButton =
        document.getElementById(
            "kickButton"
        );

    if (
        selectedParticipant.host ||
        !isHost
    ) {

        kickButton.style.display =
            "none";

    } else {

        kickButton.style.display =
            "block";

    }

}



/* =========================================================
   PARTICIPANT MENU ACTIONS
========================================================= */

participantMenu.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "button"
            );

        if (!button) {
            return;
        }

        const action =
            button.dataset.action;


        if (!selectedParticipant) {
            return;
        }


        /* FULLSCREEN */

        if (
            action === "fullscreen"
        ) {

            fullscreenParticipant(
                selectedParticipant.id
            );

        }


        /* MUTE */

        if (
            action === "mute"
        ) {

            selectedParticipant.muted =
                !selectedParticipant.muted;

            saveParticipants();

            renderParticipants();

            showToast(
                selectedParticipant.muted
                ?
                `${selectedParticipant.name} muted`
                :
                `${selectedParticipant.name} unmuted`
            );

        }


        /* PROFILE */

        if (
            action === "profile"
        ) {

            showToast(
                `Opening ${selectedParticipant.name}'s profile`
            );

        }


        /* KICK */

        if (
            action === "kick"
        ) {

            kickParticipant(
                selectedParticipant.id
            );

        }


        participantMenu.classList.remove(
            "show"
        );

    }
);



/* =========================================================
   FULLSCREEN PARTICIPANT
========================================================= */

function fullscreenParticipant(id) {

    const tile =
        document.querySelector(
            `.video-tile[data-id="${id}"]`
        );

    if (!tile) {
        return;
    }


    /*
        Browser Fullscreen API
    */

    if (
        tile.requestFullscreen
    ) {

        tile.requestFullscreen();

        showToast(
            `${getParticipant(id).name} is now fullscreen`
        );

    } else {

        showToast(
            "Fullscreen is not supported by this browser"
        );

    }

}



/* =========================================================
   KICK PARTICIPANT
========================================================= */

function kickParticipant(id) {

    const participant =
        getParticipant(id);

    if (!participant) {
        return;
    }


    if (participant.host) {

        showToast(
            "The host cannot be removed."
        );

        return;

    }


    if (!isHost) {

        showToast(
            "Only the host can remove participants."
        );

        return;

    }


    const confirmed =
        confirm(
            `Remove ${participant.name} from this discussion room?`
        );


    if (!confirmed) {
        return;
    }


    participants =
        participants.filter(
            p => p.id !== id
        );


    saveParticipants();

    renderParticipants();

    updateParticipantCount();


    showToast(
        `${participant.name} has been removed from the room`
    );

}



/* =========================================================
   GET PARTICIPANT
========================================================= */

function getParticipant(id) {

    return participants.find(
        p => p.id === id
    );

}



/* =========================================================
   TIMER
========================================================= */

function startTimer() {

    updateTimer();

    timerInterval =
        setInterval(
            updateTimer,
            1000
        );

}


function updateTimer() {

    const elapsed =
        Math.floor(
            (
                Date.now()
                -
                Number(roomStartTime)
            )
            /
            1000
        );


    const hours =
        Math.floor(
            elapsed / 3600
        );

    const minutes =
        Math.floor(
            (elapsed % 3600) / 60
        );

    const seconds =
        elapsed % 60;


    timer.textContent =
        `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

}


function pad(number) {

    return String(number)
        .padStart(2, "0");

}



/* =========================================================
   CONTROL BUTTONS
========================================================= */

function setupControls() {

    const micBtn =
        document.getElementById("micBtn");

    const cameraBtn =
        document.getElementById("cameraBtn");

    const screenBtn =
        document.getElementById("screenBtn");

    const participantsBtn =
        document.getElementById("participantsBtn");

    const chatBtn =
        document.getElementById("chatBtn");

    const raiseHandBtn =
        document.getElementById("raiseHandBtn");

    const recordBtn =
        document.getElementById("recordBtn");

    const moreBtn =
        document.getElementById("moreBtn");



    /* MIC */

    micBtn.addEventListener(
        "click",
        async () => {

            micOn = !micOn;

            micBtn.classList.toggle(
                "active",
                micOn
            );


            if (micOn) {

                try {

                    await navigator.mediaDevices
                        .getUserMedia({
                            audio: true
                        });

                    showToast(
                        "Microphone turned on"
                    );

                } catch {

                    showToast(
                        "Microphone permission was not granted"
                    );

                }

            } else {

                showToast(
                    "Microphone muted"
                );

            }

        }
    );



    /* CAMERA */

    cameraBtn.addEventListener(
        "click",
        async () => {

            cameraOn =
                !cameraOn;


            cameraBtn.classList.toggle(
                "active",
                cameraOn
            );


            if (cameraOn) {

                try {

                    await navigator.mediaDevices
                        .getUserMedia({
                            video: true
                        });

                    showToast(
                        "Camera turned on"
                    );

                } catch {

                    showToast(
                        "Camera permission was not granted"
                    );

                }

            } else {

                showToast(
                    "Camera turned off"
                );

            }

        }
    );



    /* SCREEN SHARE */

    screenBtn.addEventListener(
        "click",
        async () => {

            if (
                !navigator.mediaDevices ||
                !navigator.mediaDevices.getDisplayMedia
            ) {

                showToast(
                    "Screen sharing is not supported"
                );

                return;

            }


            try {

                await navigator.mediaDevices
                    .getDisplayMedia({
                        video: true
                    });

                screenSharing = true;

                screenBtn.classList.add(
                    "active"
                );

                showToast(
                    "Screen sharing started"
                );

            } catch {

                showToast(
                    "Screen sharing cancelled"
                );

            }

        }
    );



    /* PARTICIPANTS */

    participantsBtn.addEventListener(
        "click",
        () => {

            showToast(
                `${participants.length} people are currently in the room`
            );

        }
    );



    /* CHAT */

    chatBtn.addEventListener(
        "click",
        openChat
    );



    /* RAISE HAND */

    raiseHandBtn.addEventListener(
        "click",
        () => {

            handRaised =
                !handRaised;

            raiseHandBtn.classList.toggle(
                "active",
                handRaised
            );


            showToast(
                handRaised
                ?
                "✋ You raised your hand"
                :
                "Your hand is lowered"
            );

        }
    );



    /* RECORD */

    recordBtn.addEventListener(
        "click",
        () => {

            recording =
                !recording;

            recordBtn.classList.toggle(
                "active",
                recording
            );


            showToast(
                recording
                ?
                "Recording started"
                :
                "Recording stopped"
            );

        }
    );



    /* MORE */

    moreBtn.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            moreMenu.classList.toggle(
                "show"
            );


            const rect =
                moreBtn.getBoundingClientRect();


            moreMenu.style.left =
                `${rect.left}px`;

            moreMenu.style.top =
                `${rect.top - 150}px`;

        }
    );

}



/* =========================================================
   MORE MENU
========================================================= */

document
    .getElementById("speakerBtn")
    .addEventListener(
        "click",
        () => {

            showToast(
                "Speaker settings opened"
            );

            moreMenu.classList.remove(
                "show"
            );

        }
    );


document
    .getElementById("settingsBtn")
    .addEventListener(
        "click",
        () => {

            showToast(
                "Audio & video settings opened"
            );

            moreMenu.classList.remove(
                "show"
            );

        }
    );


document
    .getElementById("layoutBtn")
    .addEventListener(
        "click",
        () => {

            videoGrid.classList.toggle(
                "compact-layout"
            );

            showToast(
                "Layout changed"
            );

            moreMenu.classList.remove(
                "show"
            );

        }
    );



/* =========================================================
   CHAT
========================================================= */

function setupChat() {

    const send =
        document.getElementById(
            "sendMessageBtn"
        );

    const input =
        document.getElementById(
            "messageInput"
        );


    send.addEventListener(
        "click",
        () => {

            sendMessage(
                input.value
            );

            input.value = "";

        }
    );


    input.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {

                send.click();

            }

        }
    );

}



function sendMessage(text) {

    text =
        text.trim();

    if (!text) {
        return;
    }


    const messages =
        document.getElementById(
            "messages"
        );


    const message =
        document.createElement(
            "div"
        );

    message.className =
        "message";


    message.innerHTML = `

        <div class="message-avatar">
            AD
        </div>

        <div>

            <strong>
                Aniket Deshmukh
            </strong>

            <small>
                Now
            </small>

            <p>
                ${escapeHTML(text)}
            </p>

            <span class="like">
                ♡ 0
            </span>

        </div>
    `;


    messages.appendChild(
        message
    );


    messages.scrollTop =
        messages.scrollHeight;


    showToast(
        "Message sent"
    );

}



function escapeHTML(text) {

    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        text;

    return div.innerHTML;

}



/* =========================================================
   MOBILE CHAT
========================================================= */

function openChat() {

    const mobileChat =
        document.getElementById(
            "mobileChat"
        );


    if (
        window.innerWidth <= 600
    ) {

        mobileChat.style.display =
            "flex";

    } else {

        const chatPanel =
            document.querySelector(
                ".chat-panel"
            );

        chatPanel.scrollIntoView({
            behavior: "smooth",
            block: "nearest"
        });

        showToast(
            "Room chat opened"
        );

    }

}


document
    .getElementById("closeChat")
    .addEventListener(
        "click",
        () => {

            document
                .getElementById(
                    "mobileChat"
                )
                .style.display =
                "none";

        }
    );



/* =========================================================
   END / LEAVE SESSION
========================================================= */

document
    .getElementById("endSessionBtn")
    .addEventListener(
        "click",
        () => {

            if (!isHost) {

                showToast(
                    "Only the host can end the session."
                );

                return;

            }


            const confirmed =
                confirm(
                    "End this discussion session for everyone?"
                );


            if (!confirmed) {
                return;
            }


            endRoom();

        }
    );



document
    .getElementById("leaveBtn")
    .addEventListener(
        "click",
        () => {

            const confirmed =
                confirm(
                    "Leave this discussion room?"
                );


            if (!confirmed) {
                return;
            }


            leaveRoom();

        }
    );



function endRoom() {

    clearInterval(
        timerInterval
    );


    localStorage.removeItem(
        "skillconnect_room_participants"
    );

    localStorage.removeItem(
        "skillconnect_room_start"
    );


    showToast(
        "Discussion session ended"
    );


    setTimeout(
        () => {

            window.location.href =
                "live-discussions.html";

        },
        700
    );

}



function leaveRoom() {

    clearInterval(
        timerInterval
    );


    /*
        Demo behavior:
        Remove current user's participation.
    */

    participants =
        participants.filter(
            participant =>
                participant.name !==
                "Aniket Deshmukh"
        );


    showToast(
        "You left the discussion"
    );


    setTimeout(
        () => {

            window.location.href =
                "live-discussions.html";

        },
        600
    );

}



/* =========================================================
   CREATE ROOM
========================================================= */

function createRoom(size) {

    localStorage.setItem(
        "skillconnect_new_room_size",
        size
    );


    showToast(
        `Creating a ${size}-member discussion room`
    );


    setTimeout(
        () => {

            window.location.href =
                "live-discussions.html";

        },
        700
    );

}



/* =========================================================
   BACK
========================================================= */

function goBackToDiscussion() {

    window.location.href =
        "live-discussions.html";

}



/* =========================================================
   TOAST
========================================================= */

function showToast(message) {

    toast.textContent =
        message;

    toast.classList.add(
        "show"
    );


    clearTimeout(
        window.toastTimeout
    );


    window.toastTimeout =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2500
        );

}



/* =========================================================
   GLOBAL EVENTS
========================================================= */

function setupGlobalEvents() {

    document.addEventListener(
        "click",
        event => {

            if (
                !event.target.closest(
                    ".participant-menu"
                ) &&
                !event.target.closest(
                    ".tile-menu-btn"
                )
            ) {

                participantMenu.classList.remove(
                    "show"
                );

            }


            if (
                !event.target.closest(
                    ".more-menu"
                ) &&
                !event.target.closest(
                    "#moreBtn"
                )
            ) {

                moreMenu.classList.remove(
                    "show"
                );

            }

        }
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {

                participantMenu.classList.remove(
                    "show"
                );

                moreMenu.classList.remove(
                    "show"
                );

            }

        }
    );

}



/* =========================================================
   WINDOW RESIZE
========================================================= */

window.addEventListener(
    "resize",
    () => {

        participantMenu.classList.remove(
            "show"
        );

        moreMenu.classList.remove(
            "show"
        );

    }
);