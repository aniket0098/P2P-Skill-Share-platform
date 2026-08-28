/* =========================================================
   SKILLSHARE — ADVANCED MESSAGING
   messages.js
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
       ===================================================== */

    const workspace = document.querySelector(".workspace");
    const conversations = document.querySelectorAll(".conversation");

    const chatName = document.querySelector(".chat-user strong");
    const chatStatus = document.querySelector(".chat-user small");
    const chatAvatar = document.querySelector(".chat-user img");

    const profileName = document.querySelector(".profile-main h2");
    const profileAvatar = document.querySelector(".profile-avatar");

    const chatBody = document.querySelector(".chat-body");

    const messageInput = document.querySelector(".input-wrap textarea");
    const sendButton = document.querySelector(".send");

    const backButton = document.querySelector(".mobile-back");

    const typingIndicator = document.querySelector(".typing");

    const attachButton = document.querySelector(".attach");
    const attachMenu = document.querySelector(".attach-menu");

    const emojiButton = document.querySelector(".input-wrap > button");
    const emojiPanel = document.querySelector(".emoji-panel");

    /* =====================================================
       PEOPLE / CONVERSATIONS DATA
       ===================================================== */

    const users = {

        rahul: {
            name: "Rahul Sharma",
            avatar: "assets/rahul.svg",
            status: "Online",
            online: true,

            about:
                "Python Developer & ML Enthusiast. Loves teaching and sharing knowledge.",

            skills: [
                "Python",
                "Machine Learning",
                "Data Science",
                "Django",
                "AI"
            ],

            messages: [
                {
                    type: "received",
                    text: "Hey Aniket! 👋",
                    time: "10:30 AM"
                },
                {
                    type: "received",
                    text: "Thanks for the amazing Python session yesterday!",
                    time: "10:30 AM"
                },
                {
                    type: "sent",
                    text: "Hey Rahul! 😊",
                    time: "10:32 AM"
                },
                {
                    type: "sent",
                    text: "You're welcome! Glad you found it helpful.",
                    time: "10:32 AM"
                },
                {
                    type: "received",
                    text: "I have a question about decorators.",
                    time: "10:33 AM"
                },
                {
                    type: "received",
                    text: "Could you help me understand them better?",
                    time: "10:33 AM"
                },
                {
                    type: "sent",
                    text: "Of course! I'd be happy to help.",
                    time: "10:34 AM"
                },
                {
                    type: "sent",
                    text: "How about a quick call later today?",
                    time: "10:34 AM"
                },
                {
                    type: "received",
                    text: "Sure! Let's connect at 5 PM?",
                    time: "10:35 AM"
                },
                {
                    type: "sent",
                    text: "Perfect! See you then. 🚀",
                    time: "10:35 AM"
                }
            ]
        },

        priya: {
            name: "Priya Singh",
            avatar: "assets/priya.svg",
            status: "Online",
            online: true,

            about:
                "UI/UX Designer who loves creating simple and beautiful digital experiences.",

            skills: [
                "UI/UX",
                "Figma",
                "Prototyping",
                "Design Systems"
            ],

            messages: [
                {
                    type: "received",
                    text: "Hey Aniket! 👋",
                    time: "9:15 AM"
                },
                {
                    type: "received",
                    text: "I checked out the design you sent.",
                    time: "9:16 AM"
                },
                {
                    type: "sent",
                    text: "Awesome! What do you think?",
                    time: "9:18 AM"
                },
                {
                    type: "received",
                    text: "It looks really good. The new dashboard is much cleaner.",
                    time: "9:20 AM"
                }
            ]
        },

        aman: {
            name: "Aman Verma",
            avatar: "assets/aman.svg",
            status: "Online",
            online: true,

            about:
                "Full-stack developer focused on modern web technologies.",

            skills: [
                "JavaScript",
                "React",
                "Node.js",
                "Web Development"
            ],

            messages: [
                {
                    type: "received",
                    text: "Hey! Can you share the resource?",
                    time: "8:42 AM"
                },
                {
                    type: "sent",
                    text: "Sure, I'll send it over.",
                    time: "8:44 AM"
                },
                {
                    type: "received",
                    text: "Thanks! 🙌",
                    time: "8:45 AM"
                }
            ]
        },

        neha: {
            name: "Neha Patel",
            avatar: "assets/neha.svg",
            status: "Online",
            online: true,

            about:
                "Communication coach helping people improve their confidence.",

            skills: [
                "English",
                "Communication",
                "Public Speaking"
            ],

            messages: [
                {
                    type: "received",
                    text: "Great session yesterday!",
                    time: "Yesterday"
                },
                {
                    type: "sent",
                    text: "Thank you so much! 😊",
                    time: "Yesterday"
                }
            ]
        },

        rohit: {
            name: "Rohit Kumar",
            avatar: "assets/rohit.svg",
            status: "Offline",
            online: false,

            about:
                "Video editor and content creator specializing in short-form content.",

            skills: [
                "Video Editing",
                "Premiere Pro",
                "After Effects"
            ],

            messages: [
                {
                    type: "received",
                    text: "Thank you so much! 🙌",
                    time: "Yesterday"
                },
                {
                    type: "sent",
                    text: "Anytime! Happy to help.",
                    time: "Yesterday"
                }
            ]
        }

    };


    /* =====================================================
       CURRENT USER
       ===================================================== */

    let currentUser = "rahul";


    /* =====================================================
       GET USER FROM CONVERSATION
       ===================================================== */

    function getUserFromConversation(element) {

        const name =
            element.querySelector("strong")?.textContent.trim();

        if (!name) return null;

        const user = Object.keys(users).find(key => {

            return users[key].name.toLowerCase() ===
                name.toLowerCase();

        });

        return user || null;
    }


    /* =====================================================
       OPEN CONVERSATION
       ===================================================== */

    function openConversation(userId) {

        if (!users[userId]) return;

        currentUser = userId;

        const user = users[userId];


        /* -----------------------------------------------
           ACTIVE CONVERSATION
        ------------------------------------------------ */

        conversations.forEach(conversation => {

            conversation.classList.remove("active");

        });


        const selectedConversation =
            [...conversations].find(
                conversation =>
                    getUserFromConversation(conversation) === userId
            );


        if (selectedConversation) {

            selectedConversation.classList.add("active");

            /* Remove unread badge */

            const unread =
                selectedConversation.querySelector(".unread");

            if (unread) {

                unread.style.transform = "scale(0)";

                setTimeout(() => {
                    unread.remove();
                }, 180);

            }

        }


        /* -----------------------------------------------
           UPDATE CHAT HEADER
        ------------------------------------------------ */

        if (chatName) {

            chatName.textContent =
                user.name;

        }


        if (chatAvatar) {

            chatAvatar.src =
                user.avatar;

            chatAvatar.alt =
                user.name;

        }


        if (chatStatus) {

            chatStatus.innerHTML = user.online
                ? `<i></i> Online`
                : `<i style="background:#70778f;box-shadow:none;"></i> Offline`;

        }


        /* -----------------------------------------------
           UPDATE PROFILE
        ------------------------------------------------ */

        updateProfile(user);


        /* -----------------------------------------------
           RENDER MESSAGES
        ------------------------------------------------ */

        renderMessages(user);


        /* -----------------------------------------------
           MOBILE
        ------------------------------------------------ */

        if (workspace) {

            workspace.classList.add("chat-open");

        }


        /* -----------------------------------------------
           SCROLL CHAT
        ------------------------------------------------ */

        setTimeout(() => {

            scrollChatToBottom();

        }, 50);

    }


    /* =====================================================
       UPDATE PROFILE PANEL
       ===================================================== */

    function updateProfile(user) {

        if (profileName) {

            profileName.textContent =
                user.name;

        }


        if (profileAvatar) {

            profileAvatar.src =
                user.avatar;

            profileAvatar.alt =
                user.name;

        }


        const onlineText =
            document.querySelector(".profile-main .online");

        if (onlineText) {

            onlineText.innerHTML = user.online
                ? `<i></i> Online`
                : `<i style="background:#70778f;box-shadow:none;"></i> Offline`;

        }


        /* About */

        const infoBlocks =
            document.querySelectorAll(".info-block");

        if (infoBlocks.length) {

            const aboutBlock =
                [...infoBlocks].find(block =>
                    block.querySelector("label")?.textContent
                        .toLowerCase()
                        .includes("about")
                );

            if (aboutBlock) {

                const paragraph =
                    aboutBlock.querySelector("p");

                if (paragraph) {

                    paragraph.textContent =
                        user.about;

                }

            }

        }


        /* Skills */

        const skillContainer =
            document.querySelector(".chips");

        if (skillContainer) {

            skillContainer.innerHTML = "";

            user.skills.forEach(skill => {

                const chip =
                    document.createElement("span");

                chip.className = "chip";

                chip.textContent = skill;

                skillContainer.appendChild(chip);

            });

        }

    }


    /* =====================================================
       RENDER CHAT MESSAGES
       ===================================================== */

    function renderMessages(user) {

        if (!chatBody) return;


        chatBody.innerHTML = "";


        /* Date */

        const dateChip =
            document.createElement("div");

        dateChip.className =
            "date-chip";

        dateChip.textContent =
            "Today";

        chatBody.appendChild(dateChip);


        /* Messages */

        user.messages.forEach((message, index) => {

            createMessageElement(
                message,
                user,
                index
            );

        });

    }


    /* =====================================================
       CREATE MESSAGE ELEMENT
       ===================================================== */

    function createMessageElement(
        message,
        user,
        index
    ) {

        const wrapper =
            document.createElement("div");


        wrapper.className =
            message.type === "sent"
                ? "msg me"
                : "msg";


        wrapper.style.animationDelay =
            `${Math.min(index * 40, 300)}ms`;


        /* Avatar */

        if (message.type !== "sent") {

            const avatar =
                document.createElement("img");

            avatar.src =
                user.avatar;

            avatar.alt =
                user.name;

            wrapper.appendChild(avatar);

        }


        /* Bubble */

        const bubble =
            document.createElement("div");

        bubble.className =
            "bubble";


        /* Text */

        const text =
            document.createElement("div");

        text.textContent =
            message.text;


        bubble.appendChild(text);


        /* Metadata */

        const meta =
            document.createElement("div");

        meta.className =
            "msg-meta";

        meta.textContent =
            message.time;


        if (message.type === "sent") {

            meta.innerHTML =
                `${message.time} <span class="checks">✓✓</span>`;

        }


        bubble.appendChild(meta);

        wrapper.appendChild(bubble);

        chatBody.appendChild(wrapper);

    }


    /* =====================================================
       SCROLL TO BOTTOM
       ===================================================== */

    function scrollChatToBottom() {

        if (!chatBody) return;

        chatBody.scrollTo({

            top: chatBody.scrollHeight,

            behavior: "smooth"

        });

    }


    /* =====================================================
       CLICK ANY PROFILE / CONVERSATION
       ===================================================== */

    conversations.forEach(conversation => {

        conversation.addEventListener(
            "click",
            () => {

                const userId =
                    getUserFromConversation(
                        conversation
                    );

                if (userId) {

                    openConversation(userId);

                }

            }
        );

    });


    /* =====================================================
       SEND MESSAGE
       ===================================================== */

    function sendMessage() {

        if (!messageInput) return;

        const text =
            messageInput.value.trim();


        if (!text) return;


        const user =
            users[currentUser];


        const now =
            new Date();


        let hours =
            now.getHours();

        let minutes =
            now.getMinutes();

        const ampm =
            hours >= 12
                ? "PM"
                : "AM";

        hours =
            hours % 12 || 12;

        minutes =
            String(minutes).padStart(2, "0");


        const time =
            `${hours}:${minutes} ${ampm}`;


        const newMessage = {

            type: "sent",

            text: text,

            time: time

        };


        user.messages.push(
            newMessage
        );


        createMessageElement(
            newMessage,
            user,
            user.messages.length
        );


        messageInput.value = "";

        messageInput.style.height = "auto";


        scrollChatToBottom();


        /* Show typing simulation */

        simulateReply();

    }


    /* =====================================================
       SEND BUTTON
       ===================================================== */

    if (sendButton) {

        sendButton.addEventListener(
            "click",
            sendMessage
        );

    }


    /* =====================================================
       ENTER TO SEND
       ===================================================== */

    if (messageInput) {

        messageInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();

                }

            }
        );


        /* Auto grow */

        messageInput.addEventListener(
            "input",
            () => {

                messageInput.style.height =
                    "auto";

                messageInput.style.height =
                    Math.min(
                        messageInput.scrollHeight,
                        100
                    ) + "px";

            }
        );

    }


    /* =====================================================
       SIMULATE REPLY
       ===================================================== */

    function simulateReply() {

        if (!typingIndicator) return;


        typingIndicator.classList.add(
            "show"
        );


        scrollChatToBottom();


        setTimeout(() => {

            typingIndicator.classList.remove(
                "show"
            );


            const user =
                users[currentUser];


            const reply = {

                type: "received",

                text:
                    getAutomaticReply(),

                time:
                    "Just now"

            };


            user.messages.push(
                reply
            );


            createMessageElement(
                reply,
                user,
                user.messages.length
            );


            scrollChatToBottom();


        }, 1600);

    }


    /* =====================================================
       AUTOMATIC REPLIES
       ===================================================== */

    function getAutomaticReply() {

        const replies = [

            "Absolutely! 😊",

            "That sounds great!",

            "Sure, I'd be happy to help.",

            "Thanks for sharing that! 🙌",

            "Good question! Let me explain.",

            "Perfect! Let's do it. 🚀",

            "I'll check that and get back to you.",

            "Sounds good to me!"

        ];


        return replies[
            Math.floor(
                Math.random() *
                replies.length
            )
        ];

    }


    /* =====================================================
       BACK BUTTON — MOBILE
       ===================================================== */

    if (backButton) {

        backButton.addEventListener(
            "click",
            () => {

                if (workspace) {

                    workspace.classList.remove(
                        "chat-open"
                    );

                }

            }
        );

    }


    /* =====================================================
       ATTACHMENT MENU
       ===================================================== */

    if (
        attachButton &&
        attachMenu
    ) {

        attachButton.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                attachMenu.classList.toggle(
                    "show"
                );

                if (emojiPanel) {

                    emojiPanel.classList.remove(
                        "show"
                    );

                }

            }
        );

    }


    /* =====================================================
       EMOJI PANEL
       ===================================================== */

    if (
        emojiButton &&
        emojiPanel
    ) {

        emojiButton.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                emojiPanel.classList.toggle(
                    "show"
                );

                if (attachMenu) {

                    attachMenu.classList.remove(
                        "show"
                    );

                }

            }
        );


        emojiPanel.addEventListener(
            "click",
            event => {

                const emoji =
                    event.target.textContent.trim();

                if (
                    emoji &&
                    messageInput
                ) {

                    messageInput.value +=
                        emoji;

                    messageInput.focus();

                }

            }
        );

    }


    /* =====================================================
       CLOSE POPUPS WHEN CLICKING OUTSIDE
       ===================================================== */

    document.addEventListener(
        "click",
        () => {

            if (attachMenu) {

                attachMenu.classList.remove(
                    "show"
                );

            }

            if (emojiPanel) {

                emojiPanel.classList.remove(
                    "show"
                );

            }

        }
    );


    /* =====================================================
       PROFILE ACTION BUTTONS
       ===================================================== */

    const profileButtons =
        document.querySelectorAll(
            ".profile-actions button"
        );


    profileButtons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const label =
                        button.textContent
                            .trim();

                    showToast(
                        `${label} — ${users[currentUser].name}`
                    );

                }
            );

        }
    );


    /* =====================================================
       CHAT HEADER CALL / VIDEO / MORE
       ===================================================== */

    document
        .querySelectorAll(".chat-tools .icon-btn")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const icon =
                        button.textContent.trim();

                    let message =
                        "Action opened";

                    if (icon.includes("☎")) {

                        message =
                            `Calling ${users[currentUser].name}...`;

                    }

                    else if (
                        icon.includes("▣") ||
                        icon.includes("▣")
                    ) {

                        message =
                            `Starting video call with ${users[currentUser].name}...`;

                    }

                    else {

                        message =
                            "More conversation options";

                    }

                    showToast(message);

                }
            );

        });


    /* =====================================================
       TOAST
       ===================================================== */

    function showToast(message) {

        let toast =
            document.querySelector(".toast");


        if (!toast) {

            toast =
                document.createElement("div");

            toast.className =
                "toast";

            document.body.appendChild(
                toast
            );

        }


        toast.textContent =
            message;

        toast.classList.add(
            "show"
        );


        clearTimeout(
            toast.hideTimer
        );


        toast.hideTimer =
            setTimeout(() => {

                toast.classList.remove(
                    "show"
                );

            }, 2500);

    }


    /* =====================================================
       SEARCH CONVERSATIONS
       ===================================================== */

    const searchInput =
        document.querySelector(
            ".search input"
        );


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                const query =
                    searchInput.value
                        .toLowerCase()
                        .trim();


                conversations.forEach(
                    conversation => {

                        const name =
                            conversation
                                .querySelector("strong")
                                ?.textContent
                                .toLowerCase() || "";

                        const message =
                            conversation
                                .querySelector("p")
                                ?.textContent
                                .toLowerCase() || "";


                        const visible =
                            name.includes(query) ||
                            message.includes(query);


                        conversation.style.display =
                            visible
                                ? ""
                                : "none";

                    }
                );

            }
        );

    }


    /* =====================================================
       TABS
       ===================================================== */

    document
        .querySelectorAll(".tab")
        .forEach(tab => {

            tab.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".tab")
                        .forEach(t =>
                            t.classList.remove("active")
                        );

                    tab.classList.add(
                        "active"
                    );


                    const selected =
                        tab.textContent
                            .toLowerCase();


                    conversations.forEach(
                        conversation => {

                            if (
                                selected.includes(
                                    "unread"
                                )
                            ) {

                                const unread =
                                    conversation
                                        .querySelector(".unread");

                                conversation.style.display =
                                    unread
                                        ? ""
                                        : "none";

                            }

                            else {

                                conversation.style.display =
                                    "";

                            }

                        }
                    );

                }
            );

        });


    /* =====================================================
       INITIAL CHAT
       ===================================================== */

    openConversation(
        currentUser
    );

});