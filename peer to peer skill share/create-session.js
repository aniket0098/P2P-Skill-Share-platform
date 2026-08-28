/* =========================================================
   SKILLSHARE — CREATE SESSION
   Advanced Session Creation System
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    "use strict";

    /* =====================================================
       ELEMENTS
       ===================================================== */

    const form = document.getElementById("sessionForm");

    const title = document.getElementById("title");
    const skill = document.getElementById("skill");
    const level = document.getElementById("level");
    const duration = document.getElementById("duration");
    const description = document.getElementById("description");
    const availability = document.getElementById("availability");

    const publishButton = form?.querySelector(".primary");
    const toast = document.getElementById("toast");

    if (!form) return;


    /* =====================================================
       STATE
       ===================================================== */

    const DRAFT_KEY = "skillshare_create_session_draft";
    const SESSION_KEY = "skillshare_sessions";

    let toastTimer = null;
    let autosaveTimer = null;


    /* =====================================================
       INITIALIZE
       ===================================================== */

    initialize();

    function initialize() {

        addCharacterCounter();

        addLivePreview();

        addDraftStatus();

        restoreDraft();

        setupAutosave();

        setupValidation();

        setupFormSubmission();

        setupRipple();

        setupKeyboardShortcuts();

        setupNavigation();

        updatePreview();

        updateCharacterCount();

    }


    /* =====================================================
       CHARACTER COUNTER
       ===================================================== */

    function addCharacterCounter() {

        if (!description) return;

        const counter = document.createElement("div");

        counter.className = "char-count";
        counter.id = "descriptionCounter";

        description.parentElement.appendChild(counter);

        updateCharacterCount();
    }


    function updateCharacterCount() {

        const counter =
            document.getElementById("descriptionCounter");

        if (!counter || !description) return;

        const maximum = 800;
        const length = description.value.length;

        counter.textContent =
            `${length} / ${maximum} characters`;

        counter.classList.remove(
            "warning",
            "danger"
        );

        if (length >= 650) {
            counter.classList.add("warning");
        }

        if (length >= 760) {
            counter.classList.add("danger");
        }

        if (length > maximum) {
            description.value =
                description.value.substring(0, maximum);
        }
    }


    description?.addEventListener("input", () => {

        updateCharacterCount();

        updatePreview();

        scheduleAutosave();

    });


    /* =====================================================
       LIVE PREVIEW
       ===================================================== */

    function addLivePreview() {

        const preview =
            document.querySelector(".preview");

        if (!preview) return;

        const livePreview =
            document.createElement("div");

        livePreview.className = "live-preview";

        livePreview.innerHTML = `

            <div class="live-preview-title">
                LIVE PREVIEW
            </div>

            <h3 class="preview-title">
                Your session title
            </h3>

            <p class="preview-description">
                Your session description will appear here.
            </p>

            <div class="preview-tags">

                <span class="preview-tag">
                    UI/UX Design
                </span>

                <span class="preview-tag">
                    Beginner
                </span>

                <span class="preview-tag">
                    45 minutes
                </span>

            </div>

        `;

        preview.appendChild(livePreview);
    }


    function updatePreview() {

        const previewTitle =
            document.querySelector(".preview-title");

        const previewDescription =
            document.querySelector(".preview-description");

        const previewTags =
            document.querySelector(".preview-tags");

        if (
            !previewTitle ||
            !previewDescription ||
            !previewTags
        ) {
            return;
        }

        const titleValue =
            title.value.trim();

        const descriptionValue =
            description.value.trim();

        previewTitle.textContent =
            titleValue || "Your session title";

        previewDescription.textContent =
            descriptionValue ||
            "Your session description will appear here.";

        previewTags.innerHTML = `

            <span class="preview-tag">
                ${escapeHTML(skill.value)}
            </span>

            <span class="preview-tag">
                ${escapeHTML(level.value)}
            </span>

            <span class="preview-tag">
                ${escapeHTML(duration.value)}
            </span>

        `;
    }


    [
        title,
        skill,
        level,
        duration,
        availability
    ].forEach(field => {

        field?.addEventListener("input", () => {

            updatePreview();

            scheduleAutosave();

        });

        field?.addEventListener("change", () => {

            updatePreview();

            scheduleAutosave();

        });

    });


    /* =====================================================
       DRAFT STATUS
       ===================================================== */

    function addDraftStatus() {

        const helper =
            form.querySelector(".helper");

        if (!helper) return;

        const status =
            document.createElement("div");

        status.id = "draftStatus";

        status.className = "draft-status";

        status.textContent =
            "Your progress is saved automatically.";

        helper.after(status);
    }


    function setDraftStatus(message, saved = false) {

        const status =
            document.getElementById("draftStatus");

        if (!status) return;

        status.textContent = message;

        status.classList.toggle(
            "saved",
            saved
        );
    }


    /* =====================================================
       AUTOSAVE
       ===================================================== */

    function setupAutosave() {

        [
            title,
            skill,
            level,
            duration,
            description,
            availability
        ].forEach(field => {

            field?.addEventListener(
                "input",
                scheduleAutosave
            );

            field?.addEventListener(
                "change",
                scheduleAutosave
            );

        });

    }


    function scheduleAutosave() {

        clearTimeout(autosaveTimer);

        setDraftStatus(
            "Saving draft..."
        );

        autosaveTimer =
            setTimeout(
                saveDraft,
                700
            );
    }


    function saveDraft() {

        const draft = {

            title: title.value,

            skill: skill.value,

            level: level.value,

            duration: duration.value,

            description: description.value,

            availability: availability.value,

            savedAt: Date.now()

        };


        try {

            localStorage.setItem(
                DRAFT_KEY,
                JSON.stringify(draft)
            );

            setDraftStatus(
                "Draft saved just now.",
                true
            );

        } catch (error) {

            console.warn(
                "Could not save draft.",
                error
            );

        }
    }


    /* =====================================================
       RESTORE DRAFT
       ===================================================== */

    function restoreDraft() {

        try {

            const raw =
                localStorage.getItem(DRAFT_KEY);

            if (!raw) return;

            const draft =
                JSON.parse(raw);

            if (!draft) return;

            const draftAge =
                Date.now() -
                Number(draft.savedAt || 0);

            const sevenDays =
                7 * 24 * 60 * 60 * 1000;

            if (draftAge > sevenDays) {

                localStorage.removeItem(
                    DRAFT_KEY
                );

                return;
            }


            const shouldRestore =
                confirm(
                    "A saved session draft was found. Would you like to restore it?"
                );


            if (!shouldRestore) return;


            title.value =
                draft.title || "";

            skill.value =
                draft.skill ||
                skill.options[0]?.value ||
                "";

            level.value =
                draft.level ||
                level.options[0]?.value ||
                "";

            duration.value =
                draft.duration ||
                duration.options[0]?.value ||
                "";

            description.value =
                draft.description || "";

            availability.value =
                draft.availability || "";


            updateCharacterCount();

            updatePreview();


            setDraftStatus(
                "Saved draft restored.",
                true
            );


            showToast(
                "Your previous draft has been restored.",
                "success"
            );

        } catch (error) {

            console.warn(
                "Could not restore draft.",
                error
            );

        }
    }


    /* =====================================================
       VALIDATION
       ===================================================== */

    function setupValidation() {

        [
            title,
            description,
            availability
        ].forEach(field => {

            field?.addEventListener(
                "blur",
                () => validateField(field)
            );

            field?.addEventListener(
                "input",
                () => clearFieldError(field)
            );

        });

    }


    function validateField(field) {

        if (!field) return true;

        clearFieldError(field);


        if (!field.value.trim()) {

            showFieldError(
                field,
                "This field is required."
            );

            return false;
        }


        if (
            field === title &&
            field.value.trim().length < 8
        ) {

            showFieldError(
                field,
                "Please enter a more descriptive session title."
            );

            return false;
        }


        if (
            field === description &&
            field.value.trim().length < 30
        ) {

            showFieldError(
                field,
                "Please describe the session using at least 30 characters."
            );

            return false;
        }


        return true;
    }


    function validateForm() {

        const fields = [
            title,
            description,
            availability
        ];

        let valid = true;

        fields.forEach(field => {

            if (!validateField(field)) {
                valid = false;
            }

        });

        return valid;
    }


    function showFieldError(field, message) {

        field.classList.add("field-error");

        let error =
            field.parentElement.querySelector(
                ".form-error"
            );

        if (!error) {

            error =
                document.createElement("div");

            error.className =
                "form-error";

            field.after(error);
        }

        error.textContent = message;
    }


    function clearFieldError(field) {

        if (!field) return;

        field.classList.remove(
            "field-error"
        );

        const error =
            field.parentElement.querySelector(
                ".form-error"
            );

        if (error) {
            error.remove();
        }
    }


    /* =====================================================
       FORM SUBMISSION
       ===================================================== */

    function setupFormSubmission() {

        form.addEventListener(
            "submit",
            event => {

                event.preventDefault();

                if (!validateForm()) {

                    showToast(
                        "Please complete all required fields.",
                        "error"
                    );

                    const firstError =
                        form.querySelector(
                            ".field-error"
                        );

                    if (firstError) {

                        firstError.focus();

                        firstError.scrollIntoView({
                            behavior: "smooth",
                            block: "center"
                        });

                    }

                    return;
                }

                publishSession();

            }
        );
    }


    /* =====================================================
       PUBLISH SESSION
       ===================================================== */

    function publishSession() {

        if (!publishButton) return;


        const originalText =
            publishButton.textContent;


        publishButton.classList.add(
            "loading"
        );

        publishButton.textContent = "";


        setDraftStatus(
            "Publishing session..."
        );


        /*
         * FRONTEND DEMO
         *
         * Later replace this setTimeout()
         * with your backend API request.
         */

        setTimeout(() => {

            const session = {

                id:
                    `session-${Date.now()}`,

                title:
                    title.value.trim(),

                skill:
                    skill.value,

                level:
                    level.value,

                duration:
                    duration.value,

                description:
                    description.value.trim(),

                availability:
                    availability.value.trim(),

                status:
                    "published",

                createdAt:
                    new Date().toISOString()

            };


            savePublishedSession(
                session
            );


            localStorage.removeItem(
                DRAFT_KEY
            );


            publishButton.classList.remove(
                "loading"
            );

            publishButton.textContent =
                originalText;


            showPublishSuccess();

        }, 1000);
    }


    /* =====================================================
       SAVE PUBLISHED SESSION
       ===================================================== */

    function savePublishedSession(session) {

        try {

            const sessions =
                JSON.parse(
                    localStorage.getItem(
                        SESSION_KEY
                    )
                ) || [];


            sessions.push(session);


            localStorage.setItem(
                SESSION_KEY,
                JSON.stringify(sessions)
            );

        } catch (error) {

            console.warn(
                "Could not save published session.",
                error
            );

        }
    }


    /* =====================================================
       SUCCESS MODAL
       ===================================================== */

    function showPublishSuccess() {

        const overlay =
            document.createElement("div");

        overlay.className =
            "publish-overlay";


        overlay.innerHTML = `

            <div
                class="publish-box"
                role="dialog"
                aria-modal="true"
                aria-labelledby="publishTitle"
            >

                <div class="success-icon">
                    ✓
                </div>

                <h2 id="publishTitle">
                    Session published!
                </h2>

                <p>
                    Your teaching session is now live
                    and ready to be discovered by learners.
                </p>

                <div class="success-actions">

                    <a
                        href="explore.html"
                        class="primary"
                    >
                        View in Explore
                    </a>

                    <a
                        href="dashboard.html"
                        class="success-dashboard"
                    >
                        Go to Dashboard
                    </a>

                </div>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        requestAnimationFrame(() => {

            overlay.classList.add(
                "show"
            );

        });


        document.body.style.overflow =
            "hidden";


        overlay.addEventListener(
            "click",
            event => {

                if (
                    event.target === overlay
                ) {

                    closeSuccessModal(
                        overlay
                    );

                }

            }
        );
    }


    function closeSuccessModal(overlay) {

        overlay.classList.remove(
            "show"
        );

        setTimeout(() => {

            overlay.remove();

            document.body.style.overflow =
                "";

        }, 300);
    }


    /* =====================================================
       TOAST
       ===================================================== */

    function showToast(
        message,
        type = "info"
    ) {

        if (!toast) return;


        clearTimeout(
            toastTimer
        );


        toast.className =
            `toast show ${type}`;


        const icon =
            type === "success"
                ? "✓"
                : type === "error"
                    ? "!"
                    : "i";


        toast.innerHTML = `

            <span>
                ${icon}
            </span>

            <span>
                ${escapeHTML(message)}
            </span>

        `;


        toastTimer =
            setTimeout(() => {

                toast.classList.remove(
                    "show"
                );

            }, 3200);

    }


    /* =====================================================
       RIPPLE
       ===================================================== */

    function setupRipple() {

        document.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        "button.primary"
                    );

                if (!button) return;


                const rect =
                    button.getBoundingClientRect();


                const ripple =
                    document.createElement(
                        "span"
                    );


                ripple.className =
                    "ripple";


                const size =
                    Math.max(
                        rect.width,
                        rect.height
                    );


                ripple.style.width =
                    `${size}px`;

                ripple.style.height =
                    `${size}px`;

                ripple.style.left =
                    `${event.clientX -
                    rect.left -
                    size / 2
                    }px`;

                ripple.style.top =
                    `${event.clientY -
                    rect.top -
                    size / 2
                    }px`;


                button.appendChild(
                    ripple
                );


                setTimeout(() => {

                    ripple.remove();

                }, 650);

            }
        );
    }


    /* =====================================================
       KEYBOARD SHORTCUTS
       ===================================================== */

    function setupKeyboardShortcuts() {

        document.addEventListener(
            "keydown",
            event => {

                /*
                 * Ctrl + S
                 * Save draft
                 */

                if (
                    (event.ctrlKey ||
                        event.metaKey) &&
                    event.key.toLowerCase() === "s"
                ) {

                    event.preventDefault();

                    saveDraft();

                    showToast(
                        "Draft saved.",
                        "success"
                    );
                }


                /*
                 * Escape
                 */

                if (
                    event.key === "Escape"
                ) {

                    const modal =
                        document.querySelector(
                            ".publish-overlay"
                        );

                    if (modal) {
                        closeSuccessModal(
                            modal
                        );
                    }

                }

            }
        );
    }


    /* =====================================================
       ACTIVE NAVIGATION
       ===================================================== */

    function setupNavigation() {

        const currentPage =
            window.location.pathname
                .split("/")
                .pop()
                .toLowerCase();


        document
            .querySelectorAll(
                ".app-nav a"
            )
            .forEach(link => {

                const href =
                    link
                        .getAttribute("href")
                        ?.split("/")
                        .pop()
                        .toLowerCase();


                if (
                    href === currentPage
                ) {

                    link.style.color =
                        "var(--primary)";

                    link.style.background =
                        "rgba(99,91,255,.07)";

                }

            });
    }


    /* =====================================================
       ESCAPE HTML
       ===================================================== */

    function escapeHTML(value) {

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

});
