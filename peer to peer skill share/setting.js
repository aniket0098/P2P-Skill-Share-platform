/* =========================================================
   SKILLSHARE SETTINGS
   settings.js
   ========================================================= */


/* =========================================================
   GLOBAL SETTINGS OBJECT
   ========================================================= */

const DEFAULT_SETTINGS = {

    profile: {
        firstName: "",
        lastName: "",
        username: "",
        bio: "Learning, teaching and building something new every day.",
        location: "",
        website: "",
        avatar: ""
    },

    skills: [
        "HTML",
        "CSS",
        "JavaScript",
        "UI/UX"
    ],

    privacy: {
        publicProfile: true,
        onlineStatus: true,
        learningProgress: true,
        allowMessages: true,
        searchVisibility: true,
        showInterests: true,
        personalizedRecommendations: true,
        showLikes: false,
        showSaved: false
    },

    notifications: {
        messages: true,
        community: true,
        connections: true,
        learning: true,
        updates: false,
        email: true,
        push: true
    },

    appearance: {
        darkMode: true,
        compactMode: false,
        reduceAnimations: false,
        theme: "dark"
    },

    security: {
        twoFactor: false
    }

};


/* =========================================================
   LOAD SETTINGS
   ========================================================= */

let settings = loadSettings();


function loadSettings() {

    try {

        const saved = localStorage.getItem(
            "skillshareSettings"
        );

        if (!saved) {

            return structuredClone(DEFAULT_SETTINGS);

        }

        const parsed = JSON.parse(saved);

        return deepMerge(
            structuredClone(DEFAULT_SETTINGS),
            parsed
        );

    } catch (error) {

        console.error(
            "Unable to load settings:",
            error
        );

        return structuredClone(DEFAULT_SETTINGS);

    }

}


/* =========================================================
   DEEP MERGE
   ========================================================= */

function deepMerge(target, source) {

    Object.keys(source || {}).forEach(key => {

        if (
            source[key] &&
            typeof source[key] === "object" &&
            !Array.isArray(source[key])
        ) {

            target[key] = deepMerge(
                target[key] || {},
                source[key]
            );

        } else {

            target[key] = source[key];

        }

    });

    return target;

}


/* =========================================================
   SAVE SETTINGS
   ========================================================= */

function saveSettings(showMessage = false) {

    try {

        localStorage.setItem(
            "skillshareSettings",
            JSON.stringify(settings)
        );

        if (showMessage) {

            showToast(
                "Changes saved successfully",
                "success"
            );

        }

    } catch (error) {

        console.error(
            "Unable to save settings:",
            error
        );

        showToast(
            "Could not save your changes",
            "error"
        );

    }

}


/* =========================================================
   DOM READY
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    initializeSettings
);


function initializeSettings() {

    console.log(
        "SkillShare Settings initialized."
    );


    initializeTabs();

    initializeProfile();

    initializeSkills();

    initializeSwitches();

    initializeAppearance();

    initializeModals();

    initializeNavigation();

    initializeLogout();

    initializeAccountActions();

    initializeSessions();

    initializeBlockedUsers();

    initializeSupport();

    initializePayments();

    initializeSearch();

    initializeUserMenu();

    initializeGlobalButtons();

    initializeKeyboardShortcuts();

    loadSettingsIntoInterface();

}


/* =========================================================
   LOAD EVERYTHING INTO UI
   ========================================================= */

function loadSettingsIntoInterface() {

    loadProfile();

    loadSkills();

    loadPrivacy();

    loadNotifications();

    loadAppearance();

}


/* =========================================================
   SETTINGS TABS
   ========================================================= */

function initializeTabs() {

    const tabs = document.querySelectorAll(
        ".settings-tab[data-target]"
    );

    const panels = document.querySelectorAll(
        ".settings-panel"
    );


    tabs.forEach(tab => {

        tab.addEventListener(
            "click",
            () => {

                const targetId =
                    tab.dataset.target;

                if (!targetId) return;


                tabs.forEach(item => {

                    item.classList.remove(
                        "active"
                    );

                });


                panels.forEach(panel => {

                    panel.classList.remove(
                        "active"
                    );

                });


                tab.classList.add(
                    "active"
                );


                const target =
                    document.getElementById(
                        targetId
                    );


                if (target) {

                    target.classList.add(
                        "active"
                    );

                    window.scrollTo({
                        top: 0,
                        behavior: "smooth"
                    });

                }

            }
        );

    });

}


/* =========================================================
   PROFILE
   ========================================================= */

function initializeProfile() {

    const firstName =
        document.getElementById("firstName");

    const lastName =
        document.getElementById("lastName");

    const username =
        document.getElementById("username");

    const bio =
        document.getElementById("profileBio");

    const location =
        document.getElementById("location");

    const website =
        document.getElementById("website");


    const fields = [
        firstName,
        lastName,
        username,
        bio,
        location,
        website
    ];


    fields.forEach(field => {

        if (!field) return;

        field.addEventListener(
            "input",
            updateProfileFromUI
        );

    });


    if (bio) {

        updateBioCounter();

        bio.addEventListener(
            "input",
            updateBioCounter
        );

    }


    const changeAvatar =
        document.getElementById(
            "changeAvatar"
        );

    const avatarInput =
        document.getElementById(
            "avatarInput"
        );


    if (
        changeAvatar &&
        avatarInput
    ) {

        changeAvatar.addEventListener(
            "click",
            () => avatarInput.click()
        );


        avatarInput.addEventListener(
            "change",
            handleAvatarUpload
        );

    }


    const removeAvatar =
        document.getElementById(
            "removeAvatar"
        );


    if (removeAvatar) {

        removeAvatar.addEventListener(
            "click",
            removeAvatarImage
        );

    }


    const previewProfile =
        document.getElementById(
            "previewProfile"
        );


    if (previewProfile) {

        previewProfile.addEventListener(
            "click",
            previewProfilePage
        );

    }

}


/* =========================================================
   UPDATE PROFILE
   ========================================================= */

function updateProfileFromUI() {

    const firstName =
        document.getElementById(
            "firstName"
        );

    const lastName =
        document.getElementById(
            "lastName"
        );

    const username =
        document.getElementById(
            "username"
        );

    const bio =
        document.getElementById(
            "profileBio"
        );

    const location =
        document.getElementById(
            "location"
        );

    const website =
        document.getElementById(
            "website"
        );


    settings.profile.firstName =
        firstName?.value.trim() || "";


    settings.profile.lastName =
        lastName?.value.trim() || "";


    settings.profile.username =
        username?.value.trim() || "";


    settings.profile.bio =
        bio?.value.trim() || "";


    settings.profile.location =
        location?.value.trim() || "";


    settings.profile.website =
        website?.value.trim() || "";

}


/* =========================================================
   LOAD PROFILE
   ========================================================= */

function loadProfile() {

    const profile =
        settings.profile;


    setValue(
        "firstName",
        profile.firstName
    );


    setValue(
        "lastName",
        profile.lastName
    );


    setValue(
        "username",
        profile.username
    );


    setValue(
        "profileBio",
        profile.bio
    );


    setValue(
        "location",
        profile.location
    );


    setValue(
        "website",
        profile.website
    );


    const avatar =
        document.getElementById(
            "profileAvatar"
        );


    if (avatar) {

        avatar.src =
            profile.avatar;

    }


    updateBioCounter();

}


/* =========================================================
   SET VALUE HELPER
   ========================================================= */

function setValue(id, value) {

    const element =
        document.getElementById(id);

    if (element) {

        element.value =
            value ?? "";

    }

}


/* =========================================================
   BIO COUNTER
   ========================================================= */

function updateBioCounter() {

    const bio =
        document.getElementById(
            "profileBio"
        );

    if (!bio) return;


    const field =
        bio.closest(".field");

    if (!field) return;


    const counter =
        field.querySelector("em");


    if (counter) {

        counter.textContent =
            `${bio.value.length}/160`;

    }

}


/* =========================================================
   AVATAR UPLOAD
   ========================================================= */

function handleAvatarUpload(event) {

    const file =
        event.target.files?.[0];

    if (!file) return;


    if (!file.type.startsWith("image/")) {

        showToast(
            "Please select an image file.",
            "error"
        );

        return;

    }


    if (file.size > 5 * 1024 * 1024) {

        showToast(
            "Image must be smaller than 5 MB.",
            "error"
        );

        return;

    }


    const reader =
        new FileReader();


    reader.onload = function () {

        const image =
            reader.result;


        settings.profile.avatar =
            image;


        const avatar =
            document.getElementById(
                "profileAvatar"
            );


        if (avatar) {

            avatar.src =
                image;

        }


        saveSettings();

        showToast(
            "Profile photo updated.",
            "success"
        );

    };


    reader.readAsDataURL(file);

}


/* =========================================================
   REMOVE AVATAR
   ========================================================= */

function removeAvatarImage() {

    const defaultAvatar =
        "";


    settings.profile.avatar =
        defaultAvatar;


    const avatar =
        document.getElementById(
            "profileAvatar"
        );


    if (avatar) {

        avatar.src =
            defaultAvatar;

    }


    saveSettings();


    showToast(
        "Profile photo removed.",
        "success"
    );

}


/* =========================================================
   PROFILE PREVIEW
   ========================================================= */

function previewProfilePage() {

    saveSettings();


    const profileUrl =
        "profile.html";


    if (
        typeof profileUrl ===
        "string"
    ) {

        window.location.href =
            profileUrl;

    }

}


/* =========================================================
   SKILLS
   ========================================================= */

function initializeSkills() {

    const addButton =
        document.getElementById(
            "addSkill"
        );

    const showInput =
        document.getElementById(
            "showSkillInput"
        );

    const input =
        document.getElementById(
            "newSkill"
        );


    if (showInput) {

        showInput.addEventListener(
            "click",
            () => {

                const row =
                    document.getElementById(
                        "skillAddRow"
                    );

                if (!row) return;


                row.hidden =
                    !row.hidden;


                if (!row.hidden) {

                    input?.focus();

                }

            }
        );

    }


    if (addButton) {

        addButton.addEventListener(
            "click",
            addSkill
        );

    }


    if (input) {

        input.addEventListener(
            "keydown",
            event => {

                if (
                    event.key ===
                    "Enter"
                ) {

                    event.preventDefault();

                    addSkill();

                }

            }
        );

    }


    document.addEventListener(
        "click",
        event => {

            const remove =
                event.target.closest(
                    ".skill-remove"
                );


            if (!remove) return;


            const tag =
                remove.closest(
                    ".skill-tag"
                );


            const skill =
                tag?.dataset.skill ||
                tag?.textContent
                    .replace("×", "")
                    .trim();


            removeSkill(
                skill
            );

        }
    );

}


/* =========================================================
   LOAD SKILLS
   ========================================================= */

function loadSkills() {

    const editor =
        document.getElementById(
            "skillEditor"
        );


    if (!editor) return;


    editor.innerHTML = "";


    settings.skills.forEach(
        skill => {

            createSkillElement(
                skill
            );

        }
    );

}


/* =========================================================
   CREATE SKILL
   ========================================================= */

function createSkillElement(
    skill
) {

    const editor =
        document.getElementById(
            "skillEditor"
        );


    if (!editor) return;


    const tag =
        document.createElement(
            "span"
        );


    tag.className =
        "skill-tag";


    tag.dataset.skill =
        skill;


    tag.innerHTML = `

        <span>
            ${escapeHTML(skill)}
        </span>

        <button
            class="skill-remove"
            type="button"
            aria-label="Remove ${escapeHTML(skill)}"
        >
            ×
        </button>

    `;


    editor.appendChild(
        tag
    );

}


/* =========================================================
   ADD SKILL
   ========================================================= */

function addSkill() {

    const input =
        document.getElementById(
            "newSkill"
        );


    if (!input) return;


    const skill =
        input.value.trim();


    if (!skill) {

        showToast(
            "Enter a skill first.",
            "error"
        );

        input.focus();

        return;

    }


    if (
        settings.skills.some(
            item =>
                item.toLowerCase() ===
                skill.toLowerCase()
        )
    ) {

        showToast(
            "That skill is already added.",
            "error"
        );

        input.focus();

        return;

    }


    if (settings.skills.length >= 15) {

        showToast(
            "You can add up to 15 skills.",
            "error"
        );

        return;

    }


    settings.skills.push(
        skill
    );


    input.value = "";


    loadSkills();

    saveSettings();


    showToast(
        `${skill} added to your skills.`,
        "success"
    );


    input.focus();

}


/* =========================================================
   REMOVE SKILL
   ========================================================= */

function removeSkill(
    skill
) {

    if (!skill) return;


    settings.skills =
        settings.skills.filter(
            item =>
                item.toLowerCase() !==
                skill.toLowerCase()
        );


    loadSkills();

    saveSettings();


    showToast(
        `${skill} removed.`,
        "success"
    );

}


/* =========================================================
   PRIVACY SWITCHES
   ========================================================= */

function initializeSwitches() {

    const switchMap = {

        publicProfile:
            [
                "privacy",
                "publicProfile"
            ],

        onlineStatus:
            [
                "privacy",
                "onlineStatus"
            ],

        learningProgress:
            [
                "privacy",
                "learningProgress"
            ],

        allowMessages:
            [
                "privacy",
                "allowMessages"
            ],

        searchVisibility:
            [
                "privacy",
                "searchVisibility"
            ],

        showInterests:
            [
                "privacy",
                "showInterests"
            ],

        personalizedRecommendations:
            [
                "privacy",
                "personalizedRecommendations"
            ],

        showLikes:
            [
                "privacy",
                "showLikes"
            ],

        showSaved:
            [
                "privacy",
                "showSaved"
            ],

        notifyMessages:
            [
                "notifications",
                "messages"
            ],

        notifyCommunity:
            [
                "notifications",
                "community"
            ],

        notifyConnections:
            [
                "notifications",
                "connections"
            ],

        notifyLearning:
            [
                "notifications",
                "learning"
            ],

        notifyUpdates:
            [
                "notifications",
                "updates"
            ],

        emailNotifications:
            [
                "notifications",
                "email"
            ],

        pushNotifications:
            [
                "notifications",
                "push"
            ],

        twoFactor:
            [
                "security",
                "twoFactor"
            ]

    };


    Object.entries(
        switchMap
    ).forEach(
        ([id, path]) => {

            const checkbox =
                document.getElementById(
                    id
                );


            if (!checkbox) return;


            checkbox.addEventListener(
                "change",
                () => {

                    setNestedValue(
                        settings,
                        path,
                        checkbox.checked
                    );


                    saveSettings();

                    handleSwitchSideEffects(
                        id,
                        checkbox.checked
                    );

                }
            );

        }
    );

}


/* =========================================================
   LOAD PRIVACY
   ========================================================= */

function loadPrivacy() {

    const map = {

        publicProfile:
            settings.privacy.publicProfile,

        onlineStatus:
            settings.privacy.onlineStatus,

        learningProgress:
            settings.privacy.learningProgress,

        allowMessages:
            settings.privacy.allowMessages,

        searchVisibility:
            settings.privacy.searchVisibility,

        showInterests:
            settings.privacy.showInterests,

        personalizedRecommendations:
            settings.privacy.personalizedRecommendations,

        showLikes:
            settings.privacy.showLikes,

        showSaved:
            settings.privacy.showSaved,

        twoFactor:
            settings.security.twoFactor

    };


    Object.entries(map)
        .forEach(
            ([id, value]) => {

                setChecked(
                    id,
                    value
                );

            }
        );

}


/* =========================================================
   LOAD NOTIFICATIONS
   ========================================================= */

function loadNotifications() {

    const map = {

        notifyMessages:
            settings.notifications.messages,

        notifyCommunity:
            settings.notifications.community,

        notifyConnections:
            settings.notifications.connections,

        notifyLearning:
            settings.notifications.learning,

        notifyUpdates:
            settings.notifications.updates,

        emailNotifications:
            settings.notifications.email,

        pushNotifications:
            settings.notifications.push

    };


    Object.entries(map)
        .forEach(
            ([id, value]) => {

                setChecked(
                    id,
                    value
                );

            }
        );

}


/* =========================================================
   CHECKBOX HELPER
   ========================================================= */

function setChecked(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (element) {

        element.checked =
            Boolean(value);

    }

}


/* =========================================================
   NESTED VALUE SETTER
   ========================================================= */

function setNestedValue(
    object,
    path,
    value
) {

    let current =
        object;


    for (
        let i = 0;
        i < path.length - 1;
        i++
    ) {

        current =
            current[path[i]];

    }


    current[
        path[path.length - 1]
    ] = value;

}


/* =========================================================
   SWITCH SIDE EFFECTS
   ========================================================= */

function handleSwitchSideEffects(
    id,
    value
) {

    if (
        id ===
        "twoFactor"
    ) {

        showToast(
            value
                ? "Two-factor authentication enabled."
                : "Two-factor authentication disabled.",
            "success"
        );

    }


    if (
        id ===
        "allowMessages" &&
        !value
    ) {

        showToast(
            "New direct messages are now restricted.",
            "info"
        );

    }

}


/* =========================================================
   APPEARANCE
   ========================================================= */

function initializeAppearance() {

    const darkMode =
        document.getElementById(
            "darkMode"
        );

    const compactMode =
        document.getElementById(
            "compactMode"
        );

    const reduceAnimations =
        document.getElementById(
            "reduceAnimations"
        );


    if (darkMode) {

        darkMode.addEventListener(
            "change",
            () => {

                settings.appearance.darkMode =
                    darkMode.checked;


                settings.appearance.theme =
                    darkMode.checked
                        ? "dark"
                        : "light";


                applyAppearance();

                saveSettings();

            }
        );

    }


    if (compactMode) {

        compactMode.addEventListener(
            "change",
            () => {

                settings.appearance.compactMode =
                    compactMode.checked;


                applyCompactMode();

                saveSettings();

            }
        );

    }


    if (reduceAnimations) {

        reduceAnimations.addEventListener(
            "change",
            () => {

                settings.appearance.reduceAnimations =
                    reduceAnimations.checked;


                applyReducedMotion();

                saveSettings();

            }
        );

    }


    const darkButton =
        document.getElementById(
            "previewDark"
        );

    const lightButton =
        document.getElementById(
            "previewLight"
        );

    const systemButton =
        document.getElementById(
            "previewSystem"
        );


    darkButton?.addEventListener(
        "click",
        () => {

            setTheme(
                "dark"
            );

        }
    );


    lightButton?.addEventListener(
        "click",
        () => {

            setTheme(
                "light"
            );

        }
    );


    systemButton?.addEventListener(
        "click",
        () => {

            setTheme(
                "system"
            );

        }
    );


    loadAppearance();

}


/* =========================================================
   LOAD APPEARANCE
   ========================================================= */

function loadAppearance() {

    const darkMode =
        document.getElementById(
            "darkMode"
        );

    const compactMode =
        document.getElementById(
            "compactMode"
        );

    const reduceAnimations =
        document.getElementById(
            "reduceAnimations"
        );


    if (darkMode) {

        darkMode.checked =
            settings.appearance.darkMode;

    }


    if (compactMode) {

        compactMode.checked =
            settings.appearance.compactMode;

    }


    if (reduceAnimations) {

        reduceAnimations.checked =
            settings.appearance.reduceAnimations;

    }


    applyAppearance();

    applyCompactMode();

    applyReducedMotion();

}


/* =========================================================
   SET THEME
   ========================================================= */

function setTheme(
    theme
) {

    settings.appearance.theme =
        theme;


    if (theme === "dark") {

        settings.appearance.darkMode =
            true;

    }


    if (theme === "light") {

        settings.appearance.darkMode =
            false;

    }


    if (theme === "system") {

        const prefersDark =
            window.matchMedia(
                "(prefers-color-scheme: dark)"
            ).matches;


        settings.appearance.darkMode =
            prefersDark;

    }


    const darkMode =
        document.getElementById(
            "darkMode"
        );


    if (darkMode) {

        darkMode.checked =
            settings.appearance.darkMode;

    }


    applyAppearance();

    saveSettings();


    showToast(
        `${capitalize(theme)} theme selected.`,
        "success"
    );

}


/* =========================================================
   APPLY APPEARANCE
   ========================================================= */

function applyAppearance() {

    const root =
        document.documentElement;


    root.classList.toggle(
        "light-theme",
        !settings.appearance.darkMode
    );


    document.body.classList.toggle(
        "light-theme",
        !settings.appearance.darkMode
    );


    root.dataset.theme =
        settings.appearance.darkMode
            ? "dark"
            : "light";

}


/* =========================================================
   COMPACT MODE
   ========================================================= */

function applyCompactMode() {

    document.body.classList.toggle(
        "compact-mode",
        settings.appearance.compactMode
    );

}


/* =========================================================
   REDUCED MOTION
   ========================================================= */

function applyReducedMotion() {

    document.body.classList.toggle(
        "reduce-motion",
        settings.appearance.reduceAnimations
    );

}


/* =========================================================
   MODALS
   ========================================================= */

function initializeModals() {

    document.querySelectorAll(
        "[data-close-modal]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    closeModal(
                        button.dataset.closeModal
                    );

                }
            );

        }
    );


    document.querySelectorAll(
        ".modal-backdrop"
    ).forEach(
        backdrop => {

            backdrop.addEventListener(
                "click",
                event => {

                    if (
                        event.target ===
                        backdrop
                    ) {

                        backdrop.classList.remove(
                            "active"
                        );

                    }

                }
            );

        }
    );


    const changePassword =
        document.getElementById(
            "changePassword"
        );


    changePassword?.addEventListener(
        "click",
        () => {

            openModal(
                "passwordModal"
            );

        }
    );


    const changeEmail =
        document.getElementById(
            "changeEmail"
        );


    changeEmail?.addEventListener(
        "click",
        () => {

            openModal(
                "emailModal"
            );

        }
    );


    const deleteAccount =
        document.getElementById(
            "deleteAccount"
        );


    deleteAccount?.addEventListener(
        "click",
        () => {

            openModal(
                "deleteModal"
            );

        }
    );


    const contactSupport =
        document.getElementById(
            "contactSupport"
        );


    contactSupport?.addEventListener(
        "click",
        () => {

            openModal(
                "supportModal"
            );

        }
    );


    const addPayment =
        document.getElementById(
            "addPayment"
        );


    addPayment?.addEventListener(
        "click",
        () => {

            openModal(
                "paymentModal"
            );

        }
    );


    initializePassword();

    initializeEmail();

    initializeDeleteAccount();

}


/* =========================================================
   OPEN MODAL
   ========================================================= */

function openModal(
    id
) {

    const modal =
        document.getElementById(
            id
        );


    if (!modal) return;


    modal.classList.add(
        "active"
    );


    document.body.classList.add(
        "modal-open"
    );


    setTimeout(
        () => {

            const firstInput =
                modal.querySelector(
                    "input, textarea, button"
                );


            firstInput?.focus();

        },
        100
    );

}


/* =========================================================
   CLOSE MODAL
   ========================================================= */

function closeModal(
    id
) {

    const modal =
        document.getElementById(
            id
        );


    if (!modal) return;


    modal.classList.remove(
        "active"
    );


    if (
        !document.querySelector(
            ".modal-backdrop.active"
        )
    ) {

        document.body.classList.remove(
            "modal-open"
        );

    }

}


/* =========================================================
   PASSWORD
   ========================================================= */

function initializePassword() {

    const newPassword =
        document.getElementById(
            "newPassword"
        );

    const confirmPassword =
        document.getElementById(
            "confirmPassword"
        );

    const savePassword =
        document.getElementById(
            "savePassword"
        );


    newPassword?.addEventListener(
        "input",
        updatePasswordStrength
    );


    savePassword?.addEventListener(
        "click",
        saveNewPassword
    );


    confirmPassword?.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                saveNewPassword();

            }

        }
    );

}


/* =========================================================
   PASSWORD STRENGTH
   ========================================================= */

function updatePasswordStrength() {

    const password =
        document.getElementById(
            "newPassword"
        )?.value || "";


    const bars =
        document.querySelectorAll(
            ".password-strength i"
        );


    let score = 0;


    if (
        password.length >= 8
    ) {

        score++;

    }


    if (
        /[A-Z]/.test(password)
    ) {

        score++;

    }


    if (
        /[0-9]/.test(password)
    ) {

        score++;

    }


    if (
        /[^A-Za-z0-9]/.test(password)
    ) {

        score++;

    }


    bars.forEach(
        (bar, index) => {

            bar.classList.toggle(
                "filled",
                index < score
            );

        }
    );

}


/* =========================================================
   SAVE NEW PASSWORD
   ========================================================= */

function saveNewPassword() {

    const current =
        document.getElementById(
            "currentPassword"
        )?.value;


    const password =
        document.getElementById(
            "newPassword"
        )?.value;


    const confirmation =
        document.getElementById(
            "confirmPassword"
        )?.value;


    if (!current) {

        showToast(
            "Enter your current password.",
            "error"
        );

        return;

    }


    if (!password) {

        showToast(
            "Enter a new password.",
            "error"
        );

        return;

    }


    if (
        password.length < 8
    ) {

        showToast(
            "Password must contain at least 8 characters.",
            "error"
        );

        return;

    }


    if (
        password !==
        confirmation
    ) {

        showToast(
            "Passwords do not match.",
            "error"
        );

        return;

    }


    closeModal(
        "passwordModal"
    );


    document.getElementById(
        "currentPassword"
    ).value = "";


    document.getElementById(
        "newPassword"
    ).value = "";


    document.getElementById(
        "confirmPassword"
    ).value = "";


    showToast(
        "Password updated successfully.",
        "success"
    );

}


/* =========================================================
   EMAIL
   ========================================================= */

function initializeEmail() {

    const saveEmail =
        document.getElementById(
            "saveEmail"
        );


    saveEmail?.addEventListener(
        "click",
        saveNewEmail
    );

}


/* =========================================================
   SAVE EMAIL
   ========================================================= */

function saveNewEmail() {

    const input =
        document.getElementById(
            "newEmail"
        );


    const email =
        input?.value.trim();


    if (!email) {

        showToast(
            "Enter your new email address.",
            "error"
        );

        return;

    }


    const validEmail =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


    if (
        !validEmail.test(email)
    ) {

        showToast(
            "Enter a valid email address.",
            "error"
        );

        return;

    }


    closeModal(
        "emailModal"
    );


    if (input) {

        input.value = "";

    }


    showToast(
        "Email change request submitted.",
        "success"
    );

}


/* =========================================================
   DELETE ACCOUNT
   ========================================================= */

function initializeDeleteAccount() {

    const confirmation =
        document.getElementById(
            "deleteConfirmation"
        );


    const button =
        document.getElementById(
            "confirmDeleteAccount"
        );


    confirmation?.addEventListener(
        "input",
        () => {

            const valid =
                confirmation.value
                    .trim()
                    .toUpperCase() ===
                "DELETE";


            if (button) {

                button.disabled =
                    !valid;

            }

        }
    );


    button?.addEventListener(
        "click",
        permanentlyDeleteAccount
    );

}


/* =========================================================
   DELETE ACCOUNT
   ========================================================= */

function permanentlyDeleteAccount() {

    const confirmation =
        document.getElementById(
            "deleteConfirmation"
        );


    if (
        confirmation?.value
            .trim()
            .toUpperCase() !==
        "DELETE"
    ) {

        return;

    }


    localStorage.removeItem(
        "skillshareSettings"
    );


    localStorage.removeItem(
        "skillshareUser"
    );


    closeModal(
        "deleteModal"
    );


    showToast(
        "Your account has been deleted.",
        "success"
    );


    setTimeout(
        () => {

            window.location.href =
                "login.html";

        },
        1500
    );

}


/* =========================================================
   NAVIGATION
   ========================================================= */

function initializeNavigation() {

    document.querySelectorAll(
        "[data-go]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const destination =
                        button.dataset.go;


                    if (
                        destination ===
                        "profile"
                    ) {

                        window.location.href =
                            "profile.html";

                    }


                    if (
                        destination ===
                        "settings"
                    ) {

                        window.location.href =
                            "settings.html";

                    }

                }
            );

        }
    );


    const startTeaching =
        document.getElementById(
            "startTeaching"
        );


    startTeaching?.addEventListener(
        "click",
        () => {

            window.location.href =
                "teach.html";

        }
    );

}


/* =========================================================
   LOGOUT
   ========================================================= */

function initializeLogout() {

    const logoutButtons = [

        document.getElementById(
            "sidebarLogout"
        ),

        document.getElementById(
            "settingsLogout"
        ),

        document.getElementById(
            "dropdownLogout"
        )

    ];


    logoutButtons.forEach(
        button => {

            button?.addEventListener(
                "click",
                event => {

                    event.preventDefault();

                    openModal(
                        "logoutModal"
                    );

                }
            );

        }
    );


    const confirmLogout =
        document.getElementById(
            "confirmLogout"
        );


    confirmLogout?.addEventListener(
        "click",
        performLogout
    );

}


/* =========================================================
   PERFORM LOGOUT
   ========================================================= */

function performLogout() {

    closeModal(
        "logoutModal"
    );


    /*
       Remove temporary session data.
       Keep normal settings so the user's
       preferences remain available later.
    */

    localStorage.removeItem(
        "skillshareSession"
    );


    localStorage.setItem(
        "skillshareLoggedOut",
        "true"
    );


    showToast(
        "You have been logged out.",
        "success"
    );


    setTimeout(
        () => {

            window.location.href =
                "login.html";

        },
        900
    );

}


/* =========================================================
   ACCOUNT ACTIONS
   ========================================================= */

function initializeAccountActions() {

    const logoutOtherDevices =
        document.getElementById(
            "logoutOtherDevices"
        );


    logoutOtherDevices?.addEventListener(
        "click",
        () => {

            document.querySelectorAll(
                "[data-session]"
            ).forEach(
                button => {

                    const item =
                        button.closest(
                            ".session-item"
                        );


                    item?.remove();

                }
            );


            showToast(
                "Other devices have been signed out.",
                "success"
            );

        }
    );

}


/* =========================================================
   SESSIONS
   ========================================================= */

function initializeSessions() {

    document.querySelectorAll(
        "[data-session]"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const item =
                        button.closest(
                            ".session-item"
                        );


                    if (!item) return;


                    item.style.opacity =
                        "0";


                    item.style.transform =
                        "translateX(20px)";


                    setTimeout(
                        () => {

                            item.remove();

                        },
                        250
                    );


                    showToast(
                        "Session revoked.",
                        "success"
                    );

                }
            );

        }
    );

}


/* =========================================================
   BLOCKED USERS
   ========================================================= */

function initializeBlockedUsers() {

    document.querySelectorAll(
        ".unblock-user"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const user =
                        button.closest(
                            ".blocked-user"
                        );


                    const name =
                        user?.querySelector(
                            "strong"
                        )?.textContent ||
                        "User";


                    if (!user) return;


                    user.style.opacity =
                        "0";


                    user.style.transform =
                        "translateX(20px)";


                    setTimeout(
                        () => {

                            user.remove();

                        },
                        250
                    );


                    showToast(
                        `${name} has been unblocked.`,
                        "success"
                    );

                }
            );

        }
    );

}


/* =========================================================
   SUPPORT
   ========================================================= */

function initializeSupport() {

    const sendSupport =
        document.getElementById(
            "sendSupport"
        );


    sendSupport?.addEventListener(
        "click",
        () => {

            const subject =
                document.getElementById(
                    "supportSubject"
                )?.value.trim();


            const message =
                document.getElementById(
                    "supportMessage"
                )?.value.trim();


            if (!subject) {

                showToast(
                    "Please enter a subject.",
                    "error"
                );

                return;

            }


            if (!message) {

                showToast(
                    "Please describe your problem.",
                    "error"
                );

                return;

            }


            closeModal(
                "supportModal"
            );


            document.getElementById(
                "supportSubject"
            ).value = "";


            document.getElementById(
                "supportMessage"
            ).value = "";


            showToast(
                "Support request sent successfully.",
                "success"
            );

        }
    );


    const help =
        document.getElementById(
            "openHelpCenter"
        );


    help?.addEventListener(
        "click",
        () => {

            window.location.href =
                "help.html";

        }
    );


    const report =
        document.getElementById(
            "reportProblem"
        );


    report?.addEventListener(
        "click",
        () => {

            openModal(
                "supportModal"
            );

        }
    );


    const guidelines =
        document.getElementById(
            "communityGuidelines"
        );


    guidelines?.addEventListener(
        "click",
        () => {

            window.location.href =
                "community-guidelines.html";

        }
    );

}


/* =========================================================
   PAYMENTS
   ========================================================= */

function initializePayments() {

    const savePayment =
        document.getElementById(
            "savePayment"
        );


    savePayment?.addEventListener(
        "click",
        savePaymentMethod
    );


    const cardNumber =
        document.getElementById(
            "cardNumber"
        );


    cardNumber?.addEventListener(
        "input",
        () => {

            cardNumber.value =
                formatCardNumber(
                    cardNumber.value
                );

        }
    );


    const expiry =
        document.getElementById(
            "cardExpiry"
        );


    expiry?.addEventListener(
        "input",
        () => {

            let value =
                expiry.value
                    .replace(/\D/g, "")
                    .slice(0, 4);


            if (value.length >= 3) {

                value =
                    value.slice(0, 2) +
                    "/" +
                    value.slice(2);

            }


            expiry.value =
                value;

        }
    );


    document.querySelectorAll(
        ".more-btn"
    ).forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    showToast(
                        "Payment options opened.",
                        "info"
                    );

                }
            );

        }
    );

}


/* =========================================================
   FORMAT CARD NUMBER
   ========================================================= */

function formatCardNumber(
    value
) {

    return value
        .replace(/\D/g, "")
        .slice(0, 16)
        .replace(
            /(\d{4})(?=\d)/g,
            "$1 "
        );

}


/* =========================================================
   SAVE PAYMENT
   ========================================================= */

function savePaymentMethod() {

    const number =
        document.getElementById(
            "cardNumber"
        )?.value.trim();


    const expiry =
        document.getElementById(
            "cardExpiry"
        )?.value.trim();


    const cvv =
        document.getElementById(
            "cardCvv"
        )?.value.trim();


    const name =
        document.getElementById(
            "cardName"
        )?.value.trim();


    if (
        number.replace(/\s/g, "").length <
        16
    ) {

        showToast(
            "Enter a valid card number.",
            "error"
        );

        return;

    }


    if (
        !/^\d{2}\/\d{2}$/.test(expiry)
    ) {

        showToast(
            "Enter a valid expiry date.",
            "error"
        );

        return;

    }


    if (
        cvv.length < 3
    ) {

        showToast(
            "Enter a valid CVV.",
            "error"
        );

        return;

    }


    if (!name) {

        showToast(
            "Enter the name on the card.",
            "error"
        );

        return;

    }


    closeModal(
        "paymentModal"
    );


    document.getElementById(
        "cardNumber"
    ).value = "";


    document.getElementById(
        "cardExpiry"
    ).value = "";


    document.getElementById(
        "cardCvv"
    ).value = "";


    document.getElementById(
        "cardName"
    ).value = "";


    showToast(
        "Payment method added.",
        "success"
    );

}


/* =========================================================
   SEARCH
   ========================================================= */

function initializeSearch() {

    const searchButton =
        document.getElementById(
            "searchButton"
        );


    searchButton?.addEventListener(
        "click",
        () => {

            window.location.href =
                "search.html";

        }
    );


    const notificationButton =
        document.getElementById(
            "notificationButton"
        );


    notificationButton?.addEventListener(
        "click",
        () => {

            showToast(
                "You have 3 new notifications.",
                "info"
            );

        }
    );

}


/* =========================================================
   USER DROPDOWN
   ========================================================= */

function initializeUserMenu() {

    const button =
        document.getElementById(
            "userMenuButton"
        );


    const dropdown =
        document.getElementById(
            "userDropdown"
        );


    if (
        !button ||
        !dropdown
    ) {

        return;

    }


    button.addEventListener(
        "click",
        event => {

            event.stopPropagation();


            const isOpen =
                dropdown.classList.toggle(
                    "active"
                );


            button.setAttribute(
                "aria-expanded",
                String(isOpen)
            );

        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                !dropdown.contains(
                    event.target
                ) &&
                !button.contains(
                    event.target
                )
            ) {

                dropdown.classList.remove(
                    "active"
                );


                button.setAttribute(
                    "aria-expanded",
                    "false"
                );

            }

        }
    );

}


/* =========================================================
   GLOBAL BUTTONS
   ========================================================= */

function initializeGlobalButtons() {

    const saveButton =
        document.getElementById(
            "saveAllSettings"
        );


    saveButton?.addEventListener(
        "click",
        () => {

            updateProfileFromUI();

            saveSettings(
                true
            );

            animateSaveButton(
                saveButton
            );

        }
    );


    const resetButton =
        document.getElementById(
            "resetSettings"
        );


    resetButton?.addEventListener(
        "click",
        resetAllSettings
    );

}


/* =========================================================
   SAVE BUTTON ANIMATION
   ========================================================= */

function animateSaveButton(
    button
) {

    const original =
        button.innerHTML;


    button.innerHTML = `
        <i class="fa-solid fa-check"></i>
        Saved
    `;


    button.classList.add(
        "saved"
    );


    setTimeout(
        () => {

            button.innerHTML =
                original;

            button.classList.remove(
                "saved"
            );

        },
        1800
    );

}


/* =========================================================
   RESET SETTINGS
   ========================================================= */

function resetAllSettings() {

    const confirmed =
        window.confirm(
            "Reset all SkillShare settings to their default values?"
        );


    if (!confirmed) {

        return;

    }


    settings =
        structuredClone(
            DEFAULT_SETTINGS
        );


    saveSettings();


    loadSettingsIntoInterface();


    showToast(
        "Settings restored to defaults.",
        "success"
    );

}


/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */

function initializeKeyboardShortcuts() {

    document.addEventListener(
        "keydown",
        event => {

            /*
               ESC closes modal
            */

            if (
                event.key ===
                "Escape"
            ) {

                document.querySelectorAll(
                    ".modal-backdrop.active"
                ).forEach(
                    modal => {

                        modal.classList.remove(
                            "active"
                        );

                    }
                );


                document.body.classList.remove(
                    "modal-open"
                );


                return;

            }


            /*
               CTRL/CMD + S
            */

            if (
                (
                    event.ctrlKey ||
                    event.metaKey
                ) &&
                event.key.toLowerCase() ===
                "s"
            ) {

                event.preventDefault();


                const button =
                    document.getElementById(
                        "saveAllSettings"
                    );


                button?.click();

            }

        }
    );

}


/* =========================================================
   TOAST SYSTEM
   ========================================================= */

function showToast(
    message,
    type = "info"
) {

    const container =
        document.getElementById(
            "toastContainer"
        );


    if (!container) {

        console.log(
            message
        );

        return;

    }


    const toast =
        document.createElement(
            "div"
        );


    toast.className =
        `toast toast-${type}`;


    let icon =
        "fa-circle-info";


    if (
        type ===
        "success"
    ) {

        icon =
            "fa-circle-check";

    }


    if (
        type ===
        "error"
    ) {

        icon =
            "fa-circle-xmark";

    }


    if (
        type ===
        "warning"
    ) {

        icon =
            "fa-triangle-exclamation";

    }


    toast.innerHTML = `

        <div class="toast-icon">

            <i class="fa-solid ${icon}"></i>

        </div>

        <div class="toast-message">

            ${escapeHTML(message)}

        </div>

        <button
            class="toast-close"
            type="button"
            aria-label="Close notification"
        >

            ×

        </button>

    `;


    container.appendChild(
        toast
    );


    requestAnimationFrame(
        () => {

            toast.classList.add(
                "show"
            );

        }
    );


    const close =
        toast.querySelector(
            ".toast-close"
        );


    close?.addEventListener(
        "click",
        () => {

            removeToast(
                toast
            );

        }
    );


    setTimeout(
        () => {

            removeToast(
                toast
            );

        },
        4000
    );

}


/* =========================================================
   REMOVE TOAST
   ========================================================= */

function removeToast(
    toast
) {

    if (!toast) return;


    toast.classList.remove(
        "show"
    );


    setTimeout(
        () => {

            toast.remove();

        },
        250
    );

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(
    value
) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


/* =========================================================
   CAPITALIZE
   ========================================================= */

function capitalize(
    value
) {

    if (!value) return "";

    return (
        value.charAt(0).toUpperCase() +
        value.slice(1)
    );

}


/* =========================================================
   AUTO SAVE BEFORE LEAVING
   ========================================================= */

window.addEventListener(
    "beforeunload",
    () => {

        updateProfileFromUI();

        saveSettings();

    }
);


/* =========================================================
   SYSTEM THEME CHANGE
   ========================================================= */

const systemTheme =
    window.matchMedia(
        "(prefers-color-scheme: dark)"
    );


systemTheme.addEventListener(
    "change",
    event => {

        if (
            settings.appearance.theme !==
            "system"
        ) {

            return;

        }


        settings.appearance.darkMode =
            event.matches;


        applyAppearance();

    }
);


/* =========================================================
   PREVENT UNSAVED DATA LOSS
   ========================================================= */

let settingsChanged =
    false;


document.addEventListener(
    "input",
    event => {

        if (
            event.target.closest(
                ".settings-content"
            )
        ) {

            settingsChanged =
                true;

        }

    }
);


document.addEventListener(
    "change",
    event => {

        if (
            event.target.closest(
                ".settings-content"
            )
        ) {

            settingsChanged =
                true;

        }

    }
);


/* =========================================================
   SETTINGS SAVED STATE
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        if (
            event.target.closest(
                "#saveAllSettings"
            )
        ) {

            settingsChanged =
                false;

        }

    }
);


/* =========================================================
   FINAL INITIALIZATION MESSAGE
   ========================================================= */

console.log(
    "%cSkillShare Settings loaded successfully.",
    "font-weight:700;"
);
