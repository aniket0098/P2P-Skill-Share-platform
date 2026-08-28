/* =========================================================
   SKILLCONNECT DISCUSSION JAVASCRIPT
========================================================= */


/* ================= DATA ================= */

const defaultRooms = [

    {
        id: 1,
        title: "UI/UX Design Discussion",
        category: "Design",
        description: "Discuss best practices, real world case studies and improve your UI/UX skills together.",
        host: "Aman Verma",
        members: 10,
        capacity: 10,
        start: "05:32",
        status: "LIVE",
        theme: "uiux"
    },

    {
        id: 2,
        title: "Python Programming Help",
        category: "Programming",
        description: "Stuck on a concept? Ask, discuss and solve problems with the community.",
        host: "Rahul Sharma",
        members: 8,
        capacity: 10,
        start: "12:15",
        status: "LIVE",
        theme: "python"
    },

    {
        id: 3,
        title: "Digital Marketing Trends 2024",
        category: "Marketing",
        description: "Share strategies, tools and latest trends in digital marketing.",
        host: "Priya Singh",
        members: 5,
        capacity: 10,
        start: "18:45",
        status: "LIVE",
        theme: "marketing"
    },

    {
        id: 4,
        title: "Public Speaking Mastery",
        category: "Communication",
        description: "Overcome stage fear and become a confident speaker with practice and feedback.",
        host: "Neha Patel",
        members: 0,
        capacity: 15,
        start: "Tomorrow, 07:00 PM",
        status: "UPCOMING",
        theme: "speaking"
    },

    {
        id: 5,
        title: "Web Development Talk",
        category: "Programming",
        description: "Discuss modern web development technologies.",
        host: "Aman Verma",
        members: 15,
        capacity: 15,
        start: "LIVE",
        status: "LIVE",
        theme: "uiux"
    },

    {
        id: 6,
        title: "AI Tools & Productivity",
        category: "Programming",
        description: "Discover AI tools that improve your productivity.",
        host: "Meera Joshi",
        members: 9,
        capacity: 10,
        start: "LIVE",
        status: "LIVE",
        theme: "marketing"
    },

    {
        id: 7,
        title: "English Speaking Practice",
        category: "Communication",
        description: "Practice English speaking with other learners.",
        host: "Priya Singh",
        members: 10,
        capacity: 10,
        start: "LIVE",
        status: "LIVE",
        theme: "python"
    }

];


/* ================= LOCAL STORAGE ================= */

function getRooms() {

    const saved = localStorage.getItem("skillconnect_rooms");

    if (!saved) {

        localStorage.setItem(
            "skillconnect_rooms",
            JSON.stringify(defaultRooms)
        );

        return defaultRooms;

    }

    return JSON.parse(saved);
}


function saveRooms(rooms) {

    localStorage.setItem(
        "skillconnect_rooms",
        JSON.stringify(rooms)
    );

}


function getSavedRooms() {

    return JSON.parse(
        localStorage.getItem("skillconnect_saved_rooms") || "[]"
    );

}


function saveSavedRooms(ids) {

    localStorage.setItem(
        "skillconnect_saved_rooms",
        JSON.stringify(ids)
    );

}


function getMyRooms() {

    return JSON.parse(
        localStorage.getItem("skillconnect_my_rooms") || "[]"
    );

}


function saveMyRooms(ids) {

    localStorage.setItem(
        "skillconnect_my_rooms",
        JSON.stringify(ids)
    );

}


/* ================= STATE ================= */

let currentTab = "all";
let selectedCreateSize = 10;


/* ================= RENDER ROOMS ================= */

function renderRooms() {

    const container =
        document.getElementById("roomsContainer");

    if (!container) return;

    let rooms = getRooms();

    const savedIds = getSavedRooms();
    const myRooms = getMyRooms();

    const search =
        document.getElementById("searchInput").value
            .toLowerCase()
            .trim();

    const category =
        document.getElementById("categoryFilter").value;


    /* SEARCH */

    if (search) {

        rooms = rooms.filter(room =>
            room.title.toLowerCase().includes(search) ||
            room.description.toLowerCase().includes(search) ||
            room.host.toLowerCase().includes(search) ||
            room.category.toLowerCase().includes(search)
        );

    }


    /* CATEGORY */

    if (category !== "all") {

        rooms = rooms.filter(
            room => room.category === category
        );

    }


    /* TAB */

    if (currentTab === "saved") {

        rooms = rooms.filter(
            room => savedIds.includes(room.id)
        );

    }


    if (currentTab === "mine") {

        rooms = rooms.filter(
            room => myRooms.includes(room.id)
        );

    }


    if (currentTab === "joined") {

        const joined =
            JSON.parse(
                localStorage.getItem("skillconnect_joined_rooms") || "[]"
            );

        rooms = rooms.filter(
            room => joined.includes(room.id)
        );

    }


    /* SORT */

    const sort =
        document.getElementById("sortFilter").value;

    if (sort === "popular") {

        rooms.sort(
            (a,b) => b.members - a.members
        );

    }


    if (sort === "newest") {

        rooms.reverse();

    }


    container.innerHTML = "";


    if (!rooms.length) {

        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-comments"></i>
                <h3>No discussion rooms found</h3>
                <p>Try another search or create your own room.</p>
                <button onclick="openCreateRoom()">
                    Create Discussion Room
                </button>
            </div>
        `;

        return;

    }


    rooms.forEach(room => {

        container.innerHTML += createRoomHTML(
            room,
            savedIds.includes(room.id)
        );

    });


    document.getElementById("savedCount").textContent =
        savedIds.length;

}


/* ================= ROOM HTML ================= */

function createRoomHTML(room, isSaved) {

    const available =
        room.capacity - room.members;

    const isFull =
        room.members >= room.capacity;


    return `

        <article class="room-card">

            <div class="room-image ${room.theme}">

                <span class="room-status">
                    ${room.status === "LIVE" ? "● LIVE" : "UPCOMING"}
                </span>

                <strong>
                    ${getShortTitle(room.title)}
                </strong>

                <span class="room-members">
                    <i class="fa-solid fa-user-group"></i>
                    ${room.members}/${room.capacity}
                </span>

            </div>


            <div class="room-info">

                <h3>${room.title}</h3>

                <p>
                    ${room.description}
                </p>


                <div class="room-host">

                    <div class="host-avatar">
                        ${getInitial(room.host)}
                    </div>

                    <div class="host-avatar">
                        P
                    </div>

                    <div class="host-avatar">
                        R
                    </div>

                    <div class="more-members">
                        +${Math.max(0,room.members - 3)}
                    </div>

                    <span class="host-name">
                        ${room.host}
                    </span>

                    <span class="host-label">
                        Host
                    </span>

                </div>

            </div>


            <div class="room-actions">

                <span class="room-size-label">
                    Room Size
                </span>


                <div class="size-buttons">

                    ${[5,10,15].map(size => `

                        <button
                            class="${room.capacity === size ? "active" : ""}"
                            onclick="selectRoomSize(${room.id},${size})">

                            ${size}

                        </button>

                    `).join("")}

                </div>


                <div class="starts">

                    <i class="fa-regular fa-clock"></i>

                    ${room.start}

                </div>


                <button
                    class="join-room"
                    onclick="joinRoom(${room.id})"
                    ${isFull ? "disabled" : ""}>

                    ${isFull ? "Room Full" : "Join Room"}

                </button>


                <button
                    class="save-room ${isSaved ? "saved" : ""}"
                    onclick="toggleSave(${room.id})"
                    title="Save room">

                    <i class="${isSaved ? "fa-solid" : "fa-regular"} fa-bookmark"></i>

                </button>

            </div>

        </article>

    `;

}


/* ================= HELPERS ================= */

function getInitial(name) {

    return name.charAt(0).toUpperCase();

}


function getShortTitle(title) {

    if (title.includes("UI/UX"))
        return "UI/UX DESIGN";

    if (title.includes("Python"))
        return "PYTHON";

    if (title.includes("Marketing"))
        return "DIGITAL MARKETING";

    if (title.includes("Speaking"))
        return "PUBLIC SPEAKING";

    if (title.includes("Web"))
        return "WEB DEVELOPMENT";

    if (title.includes("AI"))
        return "AI TOOLS";

    return title.substring(0,18).toUpperCase();

}


/* ================= SAVE ROOM ================= */

function toggleSave(id) {

    let saved = getSavedRooms();

    if (saved.includes(id)) {

        saved =
            saved.filter(roomId => roomId !== id);

        showToast("Room removed from Saved");

    } else {

        saved.push(id);

        showToast("Room saved successfully");

    }

    saveSavedRooms(saved);

    renderRooms();

}


/* ================= JOIN ROOM ================= */

function joinRoom(id) {

    const rooms = getRooms();

    const room =
        rooms.find(r => r.id === id);

    if (!room) return;


    if (room.members >= room.capacity) {

        showToast("This room is full");

        return;

    }


    /* Increase participants */

    room.members++;

    saveRooms(rooms);


    /* Save joined */

    let joined =
        JSON.parse(
            localStorage.getItem("skillconnect_joined_rooms") || "[]"
        );


    if (!joined.includes(id)) {

        joined.push(id);

    }


    localStorage.setItem(
        "skillconnect_joined_rooms",
        JSON.stringify(joined)
    );


    /* Save selected room */

    localStorage.setItem(
        "skillconnect_current_room",
        JSON.stringify(room)
    );


    /* Open next page */

    window.location.href =
        "discussion-room.html";

}


/* ================= JOIN FEATURED ================= */

function joinRoomByTitle(title) {

    const room =
        getRooms().find(
            room => room.title === title
        );

    if (room) {

        joinRoom(room.id);

    } else {

        showToast("Room not found");

    }

}


/* ================= ROOM SIZE ================= */

function selectRoomSize(id,size) {

    const rooms = getRooms();

    const room =
        rooms.find(r => r.id === id);

    if (!room) return;


    room.capacity = size;


    if (room.members > size) {

        room.members = size;

    }


    saveRooms(rooms);

    renderRooms();

    showToast(`Room size changed to ${size} members`);

}


/* ================= CREATE MODAL ================= */

function openCreateRoom() {

    document
        .getElementById("createModal")
        .classList.add("show");

}


function closeCreateRoom() {

    document
        .getElementById("createModal")
        .classList.remove("show");

}


/* ================= CREATE ROOM SIZE ================= */

document
    .querySelectorAll("[data-modal-size]")
    .forEach(button => {

        button.addEventListener("click", () => {

            document
                .querySelectorAll("[data-modal-size]")
                .forEach(btn =>
                    btn.classList.remove("active")
                );

            button.classList.add("active");

            selectedCreateSize =
                Number(button.dataset.modalSize);

        });

    });


/* ================= CREATE ROOM ================= */

document
    .getElementById("createRoomForm")
    .addEventListener("submit", function(e) {

        e.preventDefault();


        const name =
            document.getElementById("roomName").value.trim();

        const category =
            document.getElementById("roomCategory").value;

        const description =
            document.getElementById("roomDescription").value.trim();

        const time =
            document.getElementById("roomTime").value;


        if (!name || !category || !description) {

            showToast("Please fill all required fields");

            return;

        }


        const rooms = getRooms();


        const newRoom = {

            id: Date.now(),

            title: name,

            category: category,

            description: description,

            host: "Aniket Deshmukh",

            members: 1,

            capacity: selectedCreateSize,

            start: time
                ? new Date(time).toLocaleString()
                : "Starting soon",

            status: "UPCOMING",

            theme: getTheme(category)

        };


        rooms.unshift(newRoom);

        saveRooms(rooms);


        /* Add to My Rooms */

        const myRooms = getMyRooms();

        myRooms.push(newRoom.id);

        saveMyRooms(myRooms);


        /* Activity */

        saveActivity(
            `You created "${newRoom.title}"`
        );


        this.reset();

        closeCreateRoom();

        currentTab = "mine";

        updateTabs();

        renderRooms();

        showToast("Discussion room created successfully");

    });


/* ================= CATEGORY THEME ================= */

function getTheme(category) {

    if (category === "Programming")
        return "python";

    if (category === "Marketing")
        return "marketing";

    if (category === "Communication")
        return "speaking";

    return "uiux";

}


/* ================= TABS ================= */

document
    .querySelectorAll(".tab")
    .forEach(tab => {

        tab.addEventListener("click", () => {

            currentTab =
                tab.dataset.tab;

            updateTabs();

            renderRooms();

        });

    });


function updateTabs() {

    document
        .querySelectorAll(".tab")
        .forEach(tab => {

            tab.classList.toggle(
                "active",
                tab.dataset.tab === currentTab
            );

        });

}


/* ================= SEARCH ================= */

document
    .getElementById("searchInput")
    .addEventListener("input", () => {

        renderRooms();

    });


function performSearch() {

    renderRooms();

}


/* ================= FILTER ================= */

document
    .getElementById("categoryFilter")
    .addEventListener("change", renderRooms);

document
    .getElementById("sortFilter")
    .addEventListener("change", renderRooms);


/* ================= PROFILE ================= */

const profileBtn =
    document.getElementById("profileBtn");

const profileMenu =
    document.getElementById("profileMenu");


profileBtn.addEventListener("click", e => {

    e.stopPropagation();

    profileMenu.classList.toggle("show");

});


document.addEventListener("click", () => {

    profileMenu.classList.remove("show");

});


profileMenu.addEventListener("click", e => {

    e.stopPropagation();

});


/* ================= CREDITS ================= */

function loadCredits() {

    const credits =
        localStorage.getItem("skillconnect_credits") || "1250";

    const element =
        document.getElementById("topCredits");

    if (element) {

        element.textContent =
            Number(credits).toLocaleString();

    }

}


/* ================= ACTIVITY ================= */

function getActivities() {

    return JSON.parse(
        localStorage.getItem("skillconnect_activity") || "[]"
    );

}


function saveActivity(text) {

    const activities =
        getActivities();

    activities.unshift({
        text,
        time: "Just now"
    });

    localStorage.setItem(
        "skillconnect_activity",
        JSON.stringify(activities.slice(0,5))
    );

}


function renderActivity() {

    const container =
        document.getElementById("activityList");

    if (!container) return;

    let activities =
        getActivities();


    if (!activities.length) {

        activities = [

            {
                text: "Aman Verma created UI/UX Design Discussion",
                time: "10 min ago"
            },

            {
                text: "Rahul Sharma joined Python Programming Help",
                time: "25 min ago"
            },

            {
                text: "Priya Singh scheduled Digital Marketing Trends",
                time: "1 hour ago"
            },

            {
                text: "Neha Patel created Public Speaking Mastery",
                time: "2 hours ago"
            }

        ];

    }


    container.innerHTML =
        activities.map(activity => `

            <div class="activity-item">

                <div class="activity-avatar">
                    <i class="fa-solid fa-user"></i>
                </div>

                <div class="activity-text">

                    <strong>SkillConnect User</strong>
                    ${activity.text}

                    <span class="activity-time">
                        ${activity.time}
                    </span>

                </div>

            </div>

        `).join("");

}


/* ================= TOAST ================= */

let toastTimer;

function showToast(message) {

    const toast =
        document.getElementById("toast");

    document.getElementById("toastText")
        .textContent = message;

    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(() => {

            toast.classList.remove("show");

        }, 3000);

}


/* ================= LOGOUT ================= */

function logout() {

    localStorage.removeItem("skillconnect_logged_in");

    showToast("Logged out successfully");

    setTimeout(() => {

        window.location.href =
            "index.html";

    }, 800);

}


/* ================= ESCAPE MODAL ================= */

document.addEventListener("keydown", e => {

    if (e.key === "Escape") {

        closeCreateRoom();

    }

});


/* ================= INITIALIZE ================= */

document.addEventListener("DOMContentLoaded", () => {

    loadCredits();

    renderRooms();

    renderActivity();

});