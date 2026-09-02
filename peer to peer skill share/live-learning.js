/* ============================================================
   SKILLCONNECT — LIVE LEARNING
   1-on-1 Skill Matching System
   Frontend Interactive JavaScript
============================================================ */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";


    /* =========================================================
       GLOBAL STATE
    ========================================================= */

    const state = {

        credits: 1250,

        selectedSkill: "English Speaking",

        selectedGoal: "Conversation Practice",

        matching: false,

        matchFound: false,

        selectedPerson: null,

        searchTimer: null,

        currentProgress: 0,

        notificationCount: 4

    };


    /* =========================================================
       HELPER FUNCTIONS
    ========================================================= */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];


    const escapeHTML = (value) => {

        const div = document.createElement("div");

        div.textContent = value;

        return div.innerHTML;

    };


    /* =========================================================
       ELEMENT REFERENCES
    ========================================================= */

    const profileButton =
        $("#profileButton") ||
        $(".profile-btn");

    const profileDropdown =
        $("#profileDropdown") ||
        $(".profile-menu");

    const notificationButton =
        $("#notificationButton") ||
        $("#notificationBtn") ||
        $(".notification-btn");

    const notificationDropdown =
        $("#notificationDropdown") ||
        $(".notification-dropdown");

    const notificationCount =
        $("#notificationCount") ||
        $(".notification-count");

    const skillSelect =
        $("#skillSelect") ||
        $("#learnSkill") ||
        $('select[name="skill"]');

    const goalSelect =
        $("#goalSelect") ||
        $("#learningGoal") ||
        $('select[name="goal"]');

    const findMatchButton =
        $("#findMatchBtn") ||
        $("#findMyMatch") ||
        $(".find-match-btn");

    const searchInput =
        $("#searchInput") ||
        $("#search") ||
        $('input[type="search"]');

    const matchesContainer =
        $("#matchesContainer") ||
        $(".match-grid");

    const mainPage =
        $("#liveLearningPage") ||
        $(".main-content");

    const waitingPage =
        $("#waitingPage") ||
        $(".waiting-screen");

    const foundPage =
        $("#matchFoundPage") ||
        $(".found-screen");

    const progressBar =
        $("#matchingProgress") ||
        $(".progress-bar");

    const waitingStatus =
        $("#waitingStatus") ||
        $(".waiting-status strong");

    const cancelMatchButton =
        $("#cancelMatch") ||
        $(".cancel-btn");

    const connectButton =
        $("#connectButton") ||
        $(".connect-found-btn");

    const backToMatching =
        $("#backToMatching") ||
        $(".back-btn");

    const creditElements =
        $$(".credit-value, #creditBalance, #credits");


    /* =========================================================
       SKILL DATABASE
    ========================================================= */

    const skillDatabase = {

        "English Speaking": [

            "Conversation Practice",

            "Fluency",

            "Pronunciation",

            "Grammar",

            "Interview English",

            "Public Speaking",

            "IELTS Speaking"

        ],

        "Python Programming": [

            "Python Basics",

            "DSA with Python",

            "Web Development",

            "Automation",

            "Data Analysis",

            "Problem Solving",

            "Projects"

        ],

        "Web Development": [

            "HTML & CSS",

            "JavaScript",

            "React",

            "Frontend Development",

            "Backend Development",

            "Full Stack",

            "UI Development"

        ],

        "Java Programming": [

            "Java Basics",

            "OOP",

            "DSA",

            "Spring Boot",

            "Backend Development",

            "Projects"

        ],

        "Data Science": [

            "Python for Data Science",

            "Pandas",

            "NumPy",

            "Data Visualization",

            "Machine Learning",

            "Statistics"

        ],

        "Digital Marketing": [

            "SEO",

            "Social Media Marketing",

            "Content Marketing",

            "Google Ads",

            "Analytics",

            "Brand Marketing"

        ],

        "Public Speaking": [

            "Confidence",

            "Presentation Skills",

            "Communication",

            "Storytelling",

            "Interview Skills",

            "Stage Speaking"

        ]

    };


    /* =========================================================
       PEOPLE DATABASE
    ========================================================= */

    const people = [

        {
            id: 1,

            name: "Priya Sharma",

            role: "English Coach",

            skills: [
                "English Speaking",
                "Conversation Practice",
                "Fluency",
                "Grammar"
            ],

            rating: 4.9,

            sessions: 128,

            credits: 20,

            avatar: "PS",

            online: true

        },

        {
            id: 2,

            name: "Rahul Verma",

            role: "Spoken English Trainer",

            skills: [
                "English Speaking",
                "Speaking",
                "Pronunciation",
                "IELTS Speaking"
            ],

            rating: 4.8,

            sessions: 96,

            credits: 18,

            avatar: "RV",

            online: true

        },

        {
            id: 3,

            name: "Neha Patel",

            role: "Communication Coach",

            skills: [
                "English Speaking",
                "Public Speaking",
                "Confidence",
                "Communication"
            ],

            rating: 4.9,

            sessions: 142,

            credits: 22,

            avatar: "NP",

            online: true

        },

        {
            id: 4,

            name: "Aman Verma",

            role: "Python Developer",

            skills: [
                "Python Programming",
                "DSA with Python",
                "Problem Solving",
                "Projects"
            ],

            rating: 4.9,

            sessions: 87,

            credits: 19,

            avatar: "AV",

            online: true

        },

        {
            id: 5,

            name: "Rohit Sharma",

            role: "Full Stack Developer",

            skills: [
                "Web Development",
                "JavaScript",
                "React",
                "Full Stack"
            ],

            rating: 4.8,

            sessions: 115,

            credits: 24,

            avatar: "RS",

            online: true

        },

        {
            id: 6,

            name: "Sneha Kulkarni",

            role: "Digital Marketing Expert",

            skills: [
                "Digital Marketing",
                "SEO",
                "Social Media Marketing",
                "Content Marketing"
            ],

            rating: 4.9,

            sessions: 73,

            credits: 17,

            avatar: "SK",

            online: true

        },

        {
            id: 7,

            name: "Vikram Joshi",

            role: "Public Speaking Mentor",

            skills: [
                "Public Speaking",
                "Confidence",
                "Presentation Skills",
                "Storytelling"
            ],

            rating: 4.8,

            sessions: 64,

            credits: 16,

            avatar: "VJ",

            online: true

        }

    ];


    /* =========================================================
       UPDATE CREDITS
    ========================================================= */

    function updateCredits() {

        creditElements.forEach(element => {

            element.textContent =
                state.credits.toLocaleString();

        });

    }


    /* =========================================================
       TOAST SYSTEM
    ========================================================= */

    function showToast(message, type = "normal") {

        let toast = $("#toast");

        if (!toast) {

            toast = document.createElement("div");

            toast.id = "toast";

            toast.className = "toast";

            document.body.appendChild(toast);

        }

        toast.textContent = message;

        toast.classList.add("show");

        if (type === "success") {

            toast.style.borderColor = "#08b98b";

        }

        if (type === "error") {

            toast.style.borderColor = "#e44b69";

        }

        clearTimeout(toast.hideTimer);

        toast.hideTimer = setTimeout(() => {

            toast.classList.remove("show");

        }, 2800);

    }


    /* =========================================================
       PROFILE DROPDOWN
    ========================================================= */

    function toggleProfileDropdown(event) {

        if (event) {

            event.stopPropagation();

        }

        if (!profileDropdown) return;

        profileDropdown.classList.toggle("show");

        if (notificationDropdown) {

            notificationDropdown.classList.remove("show");

        }

    }


    if (profileButton) {

        profileButton.addEventListener(
            "click",
            toggleProfileDropdown
        );

    }


    /* =========================================================
       NOTIFICATION DROPDOWN
    ========================================================= */

    function toggleNotificationDropdown(event) {

        if (event) {

            event.stopPropagation();

        }

        if (!notificationDropdown) return;

        notificationDropdown.classList.toggle("show");

        if (profileDropdown) {

            profileDropdown.classList.remove("show");

        }

    }


    if (notificationButton) {

        notificationButton.addEventListener(
            "click",
            toggleNotificationDropdown
        );

    }


    /* =========================================================
       CLOSE DROPDOWNS OUTSIDE CLICK
    ========================================================= */

    document.addEventListener("click", (event) => {

        if (
            profileDropdown &&
            profileButton &&
            !profileDropdown.contains(event.target) &&
            !profileButton.contains(event.target)
        ) {

            profileDropdown.classList.remove("show");

        }

        if (
            notificationDropdown &&
            notificationButton &&
            !notificationDropdown.contains(event.target) &&
            !notificationButton.contains(event.target)
        ) {

            notificationDropdown.classList.remove("show");

        }

    });


    /* =========================================================
       MARK NOTIFICATIONS AS READ
    ========================================================= */

    const markReadButton =
        $("#markNotificationsRead") ||
        $(".mark-read");

    if (markReadButton) {

        markReadButton.addEventListener(
            "click",
            () => {

                $$(".notification.unread").forEach(item => {

                    item.classList.remove("unread");

                });

                state.notificationCount = 0;

                if (notificationCount) {

                    notificationCount.textContent = "0";

                    notificationCount.style.display =
                        "none";

                }

                showToast(
                    "All notifications marked as read.",
                    "success"
                );

            }
        );

    }


    /* =========================================================
       DYNAMIC GOAL OPTIONS
    ========================================================= */

    function updateGoalOptions() {

        if (!skillSelect || !goalSelect) return;

        const selectedSkill =
            skillSelect.value;

        const options =
            skillDatabase[selectedSkill] ||
            [
                "Beginner Learning",
                "Practice",
                "Advanced Learning"
            ];

        goalSelect.innerHTML = "";

        options.forEach((goal, index) => {

            const option =
                document.createElement("option");

            option.value = goal;

            option.textContent = goal;

            if (
                goal === state.selectedGoal ||
                index === 0
            ) {

                option.selected = true;

                state.selectedGoal = goal;

            }

            goalSelect.appendChild(option);

        });

        state.selectedSkill =
            selectedSkill;

        renderMatches();

    }


    if (skillSelect) {

        skillSelect.addEventListener(
            "change",
            () => {

                state.selectedSkill =
                    skillSelect.value;

                updateGoalOptions();

            }
        );

    }


    if (goalSelect) {

        goalSelect.addEventListener(
            "change",
            () => {

                state.selectedGoal =
                    goalSelect.value;

                renderMatches();

            }
        );

    }


    /* =========================================================
       CALCULATE MATCH PERCENTAGE
    ========================================================= */

    function calculateMatch(person) {

        let score = 55;

        if (
            person.skills.includes(
                state.selectedSkill
            )
        ) {

            score += 20;

        }

        if (
            person.skills.includes(
                state.selectedGoal
            )
        ) {

            score += 17;

        }

        if (person.online) {

            score += 5;

        }

        score += Math.floor(
            Math.random() * 4
        );

        return Math.min(score, 99);

    }


    /* =========================================================
       GET MATCHES
    ========================================================= */

    function getMatches() {

        let matches =
            people.filter(person =>
                person.skills.includes(
                    state.selectedSkill
                )
            );

        if (matches.length === 0) {

            matches = people.filter(person =>
                person.skills.some(skill =>
                    skill.toLowerCase()
                        .includes(
                            state.selectedSkill
                                .toLowerCase()
                        )
                )
            );

        }

        if (matches.length === 0) {

            matches = [...people];

        }

        return matches
            .sort((a, b) =>
                calculateMatch(b) -
                calculateMatch(a)
            )
            .slice(0, 3);

    }


    /* =========================================================
       RENDER MATCH CARDS
    ========================================================= */

    function renderMatches() {

        if (!matchesContainer) return;

        const matches =
            getMatches();

        matchesContainer.innerHTML = "";

        matches.forEach(person => {

            const percentage =
                calculateMatch(person);

            const card =
                document.createElement("article");

            card.className =
                "match-card";

            card.dataset.personId =
                person.id;

            const visibleSkills =
                person.skills
                    .filter(skill =>
                        skill !== state.selectedSkill
                    )
                    .slice(0, 3);

            card.innerHTML = `

                <div class="match-top">

                    <span class="match-percent">
                        ${percentage}% Match
                    </span>

                    <span class="online-status">
                        ${person.online ? "Online" : "Offline"}
                    </span>

                </div>


                <div class="person-avatar">
                    ${escapeHTML(person.avatar)}
                </div>


                <h3>
                    ${escapeHTML(person.name)}
                </h3>


                <p class="match-role">
                    ${escapeHTML(person.role)}
                </p>


                <div class="rating">
                    ★ ${person.rating}
                    <small>
                        (${person.sessions} sessions)
                    </small>
                </div>


                <div class="chips">

                    ${visibleSkills.map(skill => `
                        <span>
                            ${escapeHTML(skill)}
                        </span>
                    `).join("")}

                </div>


                <div class="match-bottom">

                    <div class="price">

                        <b>
                            ${person.credits}
                        </b>

                        Credits

                        <small>
                            / 30 min
                        </small>

                    </div>

                </div>


                <button
                    class="primary-btn connect-btn"
                    data-connect-id="${person.id}"
                >
                    Connect Now
                </button>

            `;

            matchesContainer.appendChild(card);

        });

        attachConnectButtons();

    }


    /* =========================================================
       CONNECT NOW BUTTONS
    ========================================================= */

    function attachConnectButtons() {

        $$("[data-connect-id]").forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const personId =
                        Number(
                            button.dataset.connectId
                        );

                    const person =
                        people.find(
                            item =>
                                item.id === personId
                        );

                    if (!person) return;

                    /* -------------------------------------------------
                       CONNECT NOW -> dedicated waiting page
                       Store the selected person + learning context,
                       then route to match-waiting.html.
                                                    -------------------------------------------------- */

                    sessionStorage.setItem(
                        "skillconnectPendingMatch",
                        JSON.stringify(person)
                    );

                    sessionStorage.setItem(
                        "skillconnectPendingSkill",
                        state.selectedSkill
                    );

                    sessionStorage.setItem(
                        "skillconnectPendingGoal",
                        state.selectedGoal
                    );

                    showToast(
                        `Starting your match with ${person.name}…`
                    );

                    window.location.href =
                        "match-waiting.html";

                }
            );

        });

    }


    /* =========================================================
       SEARCH
    ========================================================= */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                const query =
                    searchInput.value
                        .trim()
                        .toLowerCase();

                if (!matchesContainer) return;

                $$(".match-card").forEach(card => {

                    const text =
                        card.textContent
                            .toLowerCase();

                    card.style.display =
                        text.includes(query)
                            ? ""
                            : "none";

                });

            }
        );

    }


    /* =========================================================
       SHOW MAIN PAGE
    ========================================================= */

    function showMainPage() {

        if (mainPage) {

            mainPage.classList.remove("hidden");

        }

        if (waitingPage) {

            waitingPage.classList.add("hidden");

        }

        if (foundPage) {

            foundPage.classList.add("hidden");

        }

    }


    /* =========================================================
       SHOW WAITING PAGE
    ========================================================= */

    function showWaitingPage() {

        if (mainPage) {

            mainPage.classList.add("hidden");

        }

        if (waitingPage) {

            waitingPage.classList.remove("hidden");

        }

        if (foundPage) {

            foundPage.classList.add("hidden");

        }

    }


    /* =========================================================
       SHOW MATCH FOUND PAGE
    ========================================================= */

    function showFoundPage() {

        if (mainPage) {

            mainPage.classList.add("hidden");

        }

        if (waitingPage) {

            waitingPage.classList.add("hidden");

        }

        if (foundPage) {

            foundPage.classList.remove("hidden");

        }

    }


    /* =========================================================
       UPDATE WAITING SCREEN
    ========================================================= */

    function updateWaitingUI(progress) {

        if (progressBar) {

            progressBar.style.width =
                `${progress}%`;

        }

        if (waitingStatus) {

            waitingStatus.textContent =
                `${progress}%`;

        }

        const statusText =
            $("#matchingMessage") ||
            $(".matching-message");

        if (statusText) {

            if (progress < 25) {

                statusText.textContent =
                    "Looking for learners with matching skills...";

            } else if (progress < 50) {

                statusText.textContent =
                    "Checking available experts...";

            } else if (progress < 75) {

                statusText.textContent =
                    "Comparing skills and learning goals...";

            } else if (progress < 100) {

                statusText.textContent =
                    "Finding the best person for you...";

            } else {

                statusText.textContent =
                    "Perfect match found!";

            }

        }

    }


    /* =========================================================
       FIND BEST PERSON
    ========================================================= */

    function findBestPerson() {

        let candidates =
            people.filter(person =>
                person.online
            );

        candidates.sort((a, b) => {

            const aSkill =
                a.skills.includes(
                    state.selectedSkill
                )
                    ? 1
                    : 0;

            const bSkill =
                b.skills.includes(
                    state.selectedSkill
                )
                    ? 1
                    : 0;

            const aGoal =
                a.skills.includes(
                    state.selectedGoal
                )
                    ? 1
                    : 0;

            const bGoal =
                b.skills.includes(
                    state.selectedGoal
                )
                    ? 1
                    : 0;

            return (
                (bSkill + bGoal) -
                (aSkill + aGoal)
            );

        });

        return candidates[0] || people[0];

    }


    /* =========================================================
       START MATCHING
    ========================================================= */

    function beginMatching(preSelectedPerson = null) {

        if (state.matching) return;

        if (state.credits <= 0) {

            showToast(
                "You don't have enough credits.",
                "error"
            );

            return;

        }


        state.matching = true;

        state.currentProgress = 0;

        state.selectedPerson =
            preSelectedPerson ||
            null;


        showWaitingPage();

        updateWaitingUI(0);


        if (findMatchButton) {

            findMatchButton.disabled = true;

        }


        let progress = 0;


        state.searchTimer =
            setInterval(() => {

                progress +=
                    Math.floor(
                        Math.random() * 9
                    ) + 5;

                if (progress > 100) {

                    progress = 100;

                }

                state.currentProgress =
                    progress;

                updateWaitingUI(progress);


                if (progress >= 100) {

                    clearInterval(
                        state.searchTimer
                    );

                    state.searchTimer =
                        null;

                    setTimeout(() => {

                        finishMatching(
                            preSelectedPerson
                        );

                    }, 700);

                }

            }, 350);

    }


    /* =========================================================
       FINISH MATCHING
    ========================================================= */

    function finishMatching(
        preSelectedPerson = null
    ) {

        state.matching = false;

        const person =
            preSelectedPerson ||
            findBestPerson();

        state.selectedPerson =
            person;

        state.matchFound = true;

        updateFoundProfile(person);

        showFoundPage();

        if (findMatchButton) {

            findMatchButton.disabled = false;

        }

        showToast(
            `Great! ${person.name} is a perfect match.`,
            "success"
        );

    }


    /* =========================================================
       UPDATE FOUND PROFILE
    ========================================================= */

    function updateFoundProfile(person) {

        if (!person) return;


        const avatar =
            $("#foundAvatar") ||
            $(".found-avatar");

        const name =
            $("#foundName") ||
            $(".found-name");

        const role =
            $("#foundRole") ||
            $(".found-role");

        const price =
            $("#foundPrice") ||
            $(".session-price b");

        const match =
            $("#foundMatch") ||
            $(".found-match");

        const skill =
            $("#foundSkill") ||
            $(".found-skill");

        const goal =
            $("#foundGoal") ||
            $(".found-goal");


        if (avatar) {

            avatar.textContent =
                person.avatar;

        }

        if (name) {

            name.textContent =
                person.name;

        }

        if (role) {

            role.textContent =
                person.role;

        }

        if (price) {

            price.textContent =
                person.credits;

        }

        if (match) {

            match.textContent =
                `${calculateMatch(person)}% Match`;

        }

        if (skill) {

            skill.textContent =
                state.selectedSkill;

        }

        if (goal) {

            goal.textContent =
                state.selectedGoal;

        }


        const foundSkills =
            $("#foundSkills") ||
            $(".found-skills");

        if (foundSkills) {

            foundSkills.innerHTML =
                person.skills
                    .slice(0, 4)
                    .map(skill =>
                        `<span>${escapeHTML(skill)}</span>`
                    )
                    .join("");

        }

    }


    /* =========================================================
       FIND MY MATCH BUTTON
    ========================================================= */

    if (findMatchButton) {

        findMatchButton.addEventListener(
            "click",
            () => {

                state.selectedSkill =
                    skillSelect
                        ? skillSelect.value
                        : state.selectedSkill;

                state.selectedGoal =
                    goalSelect
                        ? goalSelect.value
                        : state.selectedGoal;

                /* -------------------------------------------------
                   FIND MY MATCH -> dedicated waiting page
                   Save selection, then route to match-waiting.html.

                   Future: replace with POST /api/matches,
                   then navigate to the waiting page.

                -------------------------------------------------- */

                sessionStorage.setItem(
                    "skillconnectPendingSkill",
                    state.selectedSkill
                );

                sessionStorage.setItem(
                    "skillconnectPendingGoal",
                    state.selectedGoal
                );

                sessionStorage.removeItem(
                    "skillconnectPendingMatch"
                );

                showToast(
                    "Looking for your perfect match…"
                );

                window.location.href =
                    "match-waiting.html";

            }
        );

    }


    /* =========================================================
       CANCEL MATCHING
    ========================================================= */

    if (cancelMatchButton) {

        cancelMatchButton.addEventListener(
            "click",
            () => {

                if (state.searchTimer) {

                    clearInterval(
                        state.searchTimer
                    );

                    state.searchTimer =
                        null;

                }

                state.matching = false;

                state.currentProgress = 0;

                if (findMatchButton) {

                    findMatchButton.disabled =
                        false;

                }

                showMainPage();

                showToast(
                    "Matching cancelled."
                );

            }
        );

    }


    /* =========================================================
       CONNECT & START LEARNING
    ========================================================= */

    if (connectButton) {

        connectButton.addEventListener(
            "click",
            () => {

                const person =
                    state.selectedPerson;

                if (!person) {

                    showToast(
                        "No match selected.",
                        "error"
                    );

                    return;

                }


                if (
                    state.credits <
                    person.credits
                ) {

                    showToast(
                        "You don't have enough credits.",
                        "error"
                    );

                    return;

                }


                /*
                 * Deduct session credits.
                 *
                 * Later replace this section
                 * with your Flask API request.
                 */

                state.credits -=
                    person.credits;

                updateCredits();


                showToast(
                    `Connected with ${person.name}! Starting your 1-on-1 session...`,
                    "success"
                );


                /*
                 * Temporary frontend behavior.
                 *
                 * Later you can redirect to:
                 *
                 * /live-session
                 *
                 * or:
                 *
                 * /session/${person.id}
                 */

                setTimeout(() => {

                    window.location.href =
                        `live-session.html?mentor=${person.id}`;

                }, 1200);

            }
        );

    }


    /* =========================================================
       BACK TO MATCHING
    ========================================================= */

    if (backToMatching) {

        backToMatching.addEventListener(
            "click",
            () => {

                state.matchFound = false;

                state.selectedPerson =
                    null;

                showMainPage();

                renderMatches();

            }
        );

    }


    /* =========================================================
       PROFILE MENU ACTIONS
    ========================================================= */

    const profileSettings =
        $("#profileSettings");

    if (profileSettings) {

        profileSettings.addEventListener(
            "click",
            () => {

                window.location.href =
                    "settings.html";

            }
        );

    }


    const profileLearning =
        $("#profileLearning");

    if (profileLearning) {

        profileLearning.addEventListener(
            "click",
            () => {

                window.location.href =
                    "my-learning.html";

            }
        );

    }


    const logoutButton =
        $("#logoutButton") ||
        $(".logout");

    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            () => {

                localStorage.removeItem(
                    "skillconnectUser"
                );

                sessionStorage.clear();

                showToast(
                    "You have been logged out."
                );

                setTimeout(() => {

                    window.location.href =
                        "login.html";

                }, 700);

            }
        );

    }


    /* =========================================================
       BUY CREDITS
    ========================================================= */

    const buyCredits =
        $("#buyCredits") ||
        $(".buy-btn");

    if (buyCredits) {

        buyCredits.addEventListener(
            "click",
            () => {

                showToast(
                    "Credit store opened."
                );

                /*
                 * Later:
                 *
                 * window.location.href =
                 * "credits.html";
                 */

            }
        );

    }


    /* =========================================================
       HOW IT WORKS
    ========================================================= */

    const howItWorks =
        $("#howItWorks") ||
        $(".how-btn");

    if (howItWorks) {

        howItWorks.addEventListener(
            "click",
            () => {

                const target =
                    $("#howMatchingWorks") ||
                    $(".timeline");

                if (target) {

                    target.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                }

            }
        );

    }


    /* =========================================================
       SIDEBAR NAVIGATION
    ========================================================= */

    $$(".nav-item").forEach(item => {

        item.addEventListener(
            "click",
            function(event) {

                const href =
                    this.getAttribute("href");

                if (!href || href === "#") {

                    event.preventDefault();

                }

                $$(".nav-item").forEach(nav => {

                    nav.classList.remove("active");

                });

                this.classList.add("active");

            }
        );

    });


    /* =========================================================
       KEYBOARD SHORTCUT
    ========================================================= */

    document.addEventListener(
        "keydown",
        event => {

            /*
             * Ctrl + K
             * focuses search
             */

            if (
                event.ctrlKey &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();

                if (searchInput) {

                    searchInput.focus();

                }

            }


            /*
             * Escape closes dropdowns
             */

            if (event.key === "Escape") {

                if (profileDropdown) {

                    profileDropdown.classList.remove(
                        "show"
                    );

                }

                if (notificationDropdown) {

                    notificationDropdown.classList.remove(
                        "show"
                    );

                }

            }

        }
    );


    /* =========================================================
       INITIALIZE
    ========================================================= */

    function initialize() {

        updateCredits();

        if (skillSelect) {

            state.selectedSkill =
                skillSelect.value ||
                "English Speaking";

        }

        if (goalSelect) {

            state.selectedGoal =
                goalSelect.value ||
                "Conversation Practice";

        }

        /*
         * Build correct goal options
         * according to selected skill.
         */

        updateGoalOptions();

        renderMatches();

        /*
         * Make sure waiting/found pages
         * start hidden.
         */

        if (waitingPage) {

            waitingPage.classList.add("hidden");

        }

        if (foundPage) {

            foundPage.classList.add("hidden");

        }

    }


    initialize();


    /* =========================================================
       FRONTEND API HOOK
       ---------------------------------------------------------
       This function is intentionally separated so later
       you can connect Flask/FastAPI/PostgreSQL without
       rewriting the UI.
    ========================================================= */

    window.SkillConnect = {

        findMatch: beginMatching,

        cancelMatch: () => {

            if (state.searchTimer) {

                clearInterval(
                    state.searchTimer
                );

            }

            state.matching = false;

            showMainPage();

        },

        getState: () => {

            return {
                ...state
            };

        },

        getSelectedPerson: () => {

            return state.selectedPerson;

        },

        updateCredits: (amount) => {

            state.credits =
                Number(amount);

            updateCredits();

        },

        renderMatches: renderMatches

    };


});