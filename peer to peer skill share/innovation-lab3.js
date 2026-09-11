/* =========================================================
   INNOVATION LAB 03
   BUILD STUDIO — COMPLETE INTERACTION ENGINE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    /* =====================================================
       HELPERS
       ===================================================== */

    const $ = (selector, parent = document) =>
        parent.querySelector(selector);

    const $$ = (selector, parent = document) =>
        [...parent.querySelectorAll(selector)];

    const clamp = (value, min, max) =>
        Math.min(Math.max(value, min), max);

    const escapeHTML = value =>
        String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");


    /* =====================================================
       PROJECT STATE
       ===================================================== */

    const project = {
        title: "",
        problem: "",
        users: "",
        solution: "",
        constraints: "",
        projectType: "Prototype",
        technology: [],
        tags: [],
        hypothesis: "",
        successMetric: "",
        stage: "Define",

        progress: 18,
        tests: 0,
        evidence: 0,
        collaborators: 1,
        versions: 1,
        toolsUsed: 0
    };


    const STORAGE_KEY =
        "portal_innovation_build_project";


    /* =====================================================
       LOAD SAVED PROJECT
       ===================================================== */

    function loadProject() {

        try {

            const saved =
                localStorage.getItem(
                    STORAGE_KEY
                );

            if (!saved) return;

            const parsed =
                JSON.parse(saved);

            Object.assign(
                project,
                parsed
            );

        } catch (error) {

            console.warn(
                "Could not restore project.",
                error
            );
        }
    }


    /* =====================================================
       SAVE PROJECT
       ===================================================== */

    function saveProject() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(project)
            );

        } catch (error) {

            console.warn(
                "Could not save project.",
                error
            );
        }
    }


    loadProject();


    /* =====================================================
       NAVBAR
       ===================================================== */

    const navbar =
        $("#navbar");

    const mobileMenu =
        $("#mobileMenu");

    const navLinks =
        $(".nav-links");

    function updateNavbar() {

        navbar?.classList.toggle(
            "scrolled",
            window.scrollY > 30
        );
    }

    window.addEventListener(
        "scroll",
        updateNavbar,
        { passive: true }
    );

    updateNavbar();


    if (
        mobileMenu &&
        navLinks
    ) {

        mobileMenu.addEventListener(
            "click",
            () => {

                navLinks.classList.toggle(
                    "open"
                );

                mobileMenu.classList.toggle(
                    "active"
                );
            }
        );

        $$(
            ".nav-links a"
        ).forEach(link => {

            link.addEventListener(
                "click",
                () => {

                    navLinks.classList.remove(
                        "open"
                    );

                    mobileMenu.classList.remove(
                        "active"
                    );
                }
            );
        });
    }


    /* =====================================================
       CURSOR GLOW
       ===================================================== */

    const cursor =
        $(".cursor-glow");

    if (
        cursor &&
        window.matchMedia(
            "(pointer:fine)"
        ).matches
    ) {

        window.addEventListener(
            "pointermove",
            event => {

                cursor.style.left =
                    `${event.clientX}px`;

                cursor.style.top =
                    `${event.clientY}px`;
            },
            { passive: true }
        );
    }


    /* =====================================================
       REVEAL
       ===================================================== */

    const revealItems =
        $$(".reveal");

    if (
        "IntersectionObserver"
        in window
    ) {

        const observer =
            new IntersectionObserver(
                entries => {

                    entries.forEach(
                        entry => {

                            if (
                                entry.isIntersecting
                            ) {

                                entry.target
                                    .classList
                                    .add(
                                        "visible"
                                    );

                                observer.unobserve(
                                    entry.target
                                );
                            }
                        }
                    );

                },
                {
                    threshold: 0.12
                }
            );

        revealItems.forEach(
            item =>
                observer.observe(item)
        );

    } else {

        revealItems.forEach(
            item =>
                item.classList.add(
                    "visible"
                )
        );
    }


    /* =====================================================
       FORM FIELDS
       ===================================================== */

    const fields =
        $$("[data-field]");

    fields.forEach(field => {

        const key =
            field.dataset.field;

        if (
            typeof project[key] ===
            "string"
        ) {

            field.value =
                project[key];
        }


        field.addEventListener(
            "input",
            () => {

                project[key] =
                    field.value;

                updateFieldUI(field);

                updatePreview();

                updateCompletion();

                updateAutosave();

                saveProject();

            }
        );


        field.addEventListener(
            "focus",
            () => {

                field
                    .closest(
                        ".input-group"
                    )
                    ?.classList.add(
                        "focused"
                    );
            }
        );


        field.addEventListener(
            "blur",
            () => {

                field
                    .closest(
                        ".input-group"
                    )
                    ?.classList.remove(
                        "focused"
                    );

                validateField(field);
            }
        );

    });


    /* =====================================================
       FIELD STATE
       ===================================================== */

    function updateFieldUI(field) {

        const wrapper =
            field.closest(
                ".input-group"
            );

        if (!wrapper) return;

        const hasValue =
            field.value.trim()
                .length > 0;

        wrapper.classList.toggle(
            "has-value",
            hasValue
        );

        wrapper.classList.remove(
            "error"
        );

        if (hasValue) {
            wrapper.classList.add(
                "complete"
            );
        } else {
            wrapper.classList.remove(
                "complete"
            );
        }
    }


    function validateField(field) {

        const wrapper =
            field.closest(
                ".input-group"
            );

        if (!wrapper) return;

        const required =
            field.dataset.required ===
            "true" ||
            field.hasAttribute(
                "required"
            );

        if (
            required &&
            !field.value.trim()
        ) {

            wrapper.classList.add(
                "error"
            );

        } else {

            wrapper.classList.remove(
                "error"
            );
        }
    }


    /* =====================================================
       TEXTAREA AUTO HEIGHT
       ===================================================== */

    $$("textarea").forEach(
        textarea => {

            function resize() {

                textarea.style.height =
                    "auto";

                textarea.style.height =
                    `${textarea.scrollHeight}px`;
            }

            textarea.addEventListener(
                "input",
                resize
            );

            resize();
        }
    );


    /* =====================================================
       CHARACTER COUNTERS
       ===================================================== */

    $$(
        "[data-maxlength]"
    ).forEach(field => {

        const wrapper =
            field.closest(
                ".input-group"
            );

        const counter =
            wrapper?.querySelector(
                ".character-count"
            );

        if (!counter) return;


        function updateCounter() {

            const max =
                Number(
                    field.dataset.maxlength
                );

            const current =
                field.value.length;

            counter.textContent =
                `${current}/${max}`;

            counter.classList.toggle(
                "near-limit",
                current >= max * 0.8
            );

            counter.classList.toggle(
                "limit",
                current >= max
            );
        }


        field.addEventListener(
            "input",
            updateCounter
        );

        updateCounter();

    });


    /* =====================================================
       PROJECT TYPE + TECHNOLOGY CHIPS
       ===================================================== */

    $$(
        "[data-choice]"
    ).forEach(choice => {

        choice.addEventListener(
            "click",
            () => {

                const group =
                    choice.closest(
                        "[data-choice-group]"
                    );

                if (!group) return;

                const key =
                    group.dataset.choiceGroup;

                const value =
                    choice.dataset.choice;

                const multiple =
                    group.dataset.multi ===
                    "true";


                if (multiple) {

                    choice.classList.toggle(
                        "active"
                    );

                    if (
                        choice.classList.contains(
                            "active"
                        )
                    ) {

                        if (
                            !project[key].includes(
                                value
                            )
                        ) {

                            project[key].push(
                                value
                            );
                        }

                    } else {

                        project[key] =
                            project[key].filter(
                                item =>
                                    item !==
                                    value
                            );
                    }

                } else {

                    $$(
                        "[data-choice]",
                        group
                    ).forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );

                    choice.classList.add(
                        "active"
                    );

                    project[key] =
                        value;
                }


                updatePreview();

                updateCompletion();

                saveProject();

            }
        );

    });


    /* =====================================================
       RESTORE CHIPS
       ===================================================== */

    $$(
        "[data-choice]"
    ).forEach(choice => {

        const group =
            choice.closest(
                "[data-choice-group]"
            );

        const key =
            group?.dataset.choiceGroup;

        if (!key) return;

        const value =
            choice.dataset.choice;

        const selected =
            Array.isArray(
                project[key]
            )
                ? project[key].includes(
                    value
                )
                : project[key] === value;

        if (selected) {

            choice.classList.add(
                "active"
            );
        }

    });


    /* =====================================================
       LIVE PREVIEW
       ===================================================== */

    function updatePreview() {

        $$(
            "[data-preview='title']"
        ).forEach(element => {

            element.textContent =
                project.title ||
                "Untitled Innovation";
        });


        $$(
            "[data-preview='problem']"
        ).forEach(element => {

            element.textContent =
                project.problem ||
                "Your problem statement will appear here.";
        });


        $$(
            "[data-preview='users']"
        ).forEach(element => {

            element.textContent =
                project.users ||
                "Define your target users";
        });


        $$(
            "[data-preview='solution']"
        ).forEach(element => {

            element.textContent =
                project.solution ||
                "Your solution direction will appear here.";
        });


        const status =
            $(
                "[data-project-status]"
            );

        if (status) {

            const count = [
                project.title,
                project.problem,
                project.users,
                project.solution
            ].filter(Boolean).length;


            if (count === 0) {

                status.textContent =
                    "DRAFT";

            } else if (count < 4) {

                status.textContent =
                    "IN PROGRESS";

            } else {

                status.textContent =
                    "READY TO BUILD";
            }
        }


        const workspaceTitle =
            $(
                "#workspaceProjectName"
            );

        if (workspaceTitle) {

            workspaceTitle.textContent =
                project.title ||
                "Untitled Innovation";
        }
    }


    /* =====================================================
       COMPLETION
       ===================================================== */

    function updateCompletion() {

        const required = [
            "title",
            "problem",
            "users",
            "solution",
            "hypothesis",
            "successMetric"
        ];

        let completed = 0;

        required.forEach(
            key => {

                if (
                    typeof project[key] ===
                    "string" &&
                    project[key].trim()
                ) {

                    completed++;
                }
            }
        );


        if (
            project.technology.length
        ) {
            completed++;
        }


        const percentage =
            Math.round(
                completed /
                7 *
                100
            );


        $$(
            "[data-completion]"
        ).forEach(
            element =>
                element.textContent =
                    `${percentage}%`
        );


        $$(
            "[data-completion-bar]"
        ).forEach(
            bar =>
                bar.style.width =
                    `${percentage}%`
        );
    }


    /* =====================================================
       AUTOSAVE
       ===================================================== */

    let autosaveTimer;

    function updateAutosave() {

        const indicator =
            $(
                "[data-autosave]"
            );

        if (!indicator) return;

        indicator.textContent =
            "Saving...";

        indicator.classList.add(
            "saving"
        );

        clearTimeout(
            autosaveTimer
        );

        autosaveTimer =
            setTimeout(
                () => {

                    indicator.textContent =
                        "Saved";

                    indicator.classList.remove(
                        "saving"
                    );

                },
                600
            );
    }


    /* =====================================================
       TAG SYSTEM
       ===================================================== */

    const tagInput =
        $("[data-tag-input]");

    const tagContainer =
        $("[data-tags]");


    function renderTags() {

        if (!tagContainer) return;

        tagContainer.innerHTML = "";

        project.tags.forEach(
            tag => {

                const element =
                    document.createElement(
                        "span"
                    );

                element.className =
                    "project-tag";

                element.innerHTML = `
                    ${escapeHTML(tag)}
                    <button
                        type="button"
                        aria-label="Remove tag"
                    >
                        ×
                    </button>
                `;


                element
                    .querySelector("button")
                    .addEventListener(
                        "click",
                        () => {

                            project.tags =
                                project.tags.filter(
                                    item =>
                                        item !==
                                        tag
                                );

                            renderTags();
                            saveProject();

                        }
                    );


                tagContainer.appendChild(
                    element
                );
            }
        );
    }


    if (tagInput) {

        tagInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key !==
                        "Enter" &&
                    event.key !== ","
                ) {
                    return;
                }

                event.preventDefault();

                const value =
                    tagInput.value
                        .trim()
                        .replace(
                            /,$/,
                            ""
                        );

                if (!value) return;

                if (
                    !project.tags.includes(
                        value
                    )
                ) {

                    project.tags.push(
                        value
                    );

                    renderTags();
                    saveProject();
                }

                tagInput.value = "";
            }
        );
    }


    renderTags();


    /* =====================================================
       BLUEPRINT ENGINE
       ===================================================== */

    const blueprintButton =
        $(
            "[data-action='generate-blueprint']"
        );

    const blueprint =
        $("[data-blueprint]");


    if (blueprintButton) {

        blueprintButton.addEventListener(
            "click",
            () => {

                if (
                    !project.title &&
                    !project.problem
                ) {

                    showToast(
                        "Add your project idea first."
                    );

                    $("#projectName")
                        ?.focus();

                    return;
                }


                blueprint.innerHTML = `

                    <div class="blueprint-result">

                        <span class="blueprint-label">
                            BUILD BLUEPRINT GENERATED
                        </span>

                        <h3>
                            ${escapeHTML(
                                project.title ||
                                "Untitled Innovation"
                            )}
                        </h3>

                        <div class="blueprint-row">
                            <span>PROBLEM</span>

                            <strong>
                                ${escapeHTML(
                                    project.problem ||
                                    "Problem to be defined"
                                )}
                            </strong>
                        </div>

                        <div class="blueprint-row">
                            <span>USER</span>

                            <strong>
                                ${escapeHTML(
                                    project.users ||
                                    "Target users"
                                )}
                            </strong>
                        </div>

                        <div class="blueprint-row">
                            <span>SOLUTION</span>

                            <strong>
                                ${escapeHTML(
                                    project.solution ||
                                    "Solution direction"
                                )}
                            </strong>
                        </div>

                        <div class="blueprint-row">
                            <span>TECHNOLOGY</span>

                            <strong>
                                ${
                                    project.technology.length
                                    ? project.technology
                                        .map(escapeHTML)
                                        .join(" · ")
                                    : "Technology not selected"
                                }
                            </strong>
                        </div>

                        <div class="blueprint-actions">

                            <button
                                type="button"
                                data-action="start-prototype"
                            >
                                START PROTOTYPE →
                            </button>

                        </div>

                    </div>
                `;


                project.stage =
                    "Build";

                project.progress =
                    Math.max(
                        project.progress,
                        36
                    );


                saveProject();

                updateProgress();

                updateCompletion();

                showToast(
                    "Build blueprint generated."
                );
            }
        );
    }


    /* =====================================================
       WORKFLOW
       ===================================================== */

    const workflowSteps =
        $$(".workflow-step");


    const stageProgress = {
        Define: 18,
        Design: 36,
        Build: 58,
        Test: 78,
        Iterate: 94
    };


    function setStage(stage) {

        if (
            !stageProgress[stage]
        ) return;

        project.stage =
            stage;

        project.progress =
            stageProgress[stage];


        workflowSteps.forEach(
            step => {

                const stepStage =
                    step.dataset.stage;

                const stages =
                    Object.keys(
                        stageProgress
                    );

                const current =
                    stages.indexOf(
                        stage
                    );

                const index =
                    stages.indexOf(
                        stepStage
                    );


                step.classList.toggle(
                    "active",
                    stepStage === stage
                );

                step.classList.toggle(
                    "completed",
                    index < current
                );
            }
        );


        updateProgress();

        saveProject();
    }


    workflowSteps.forEach(
        step => {

            step.addEventListener(
                "click",
                () => {

                    setStage(
                        step.dataset.stage
                    );
                }
            );
        }
    );


    function updateProgress() {

        $$(".progress-fill")
            .forEach(
                bar =>
                    bar.style.width =
                        `${project.progress}%`
            );

        $$(".progress-value")
            .forEach(
                element =>
                    element.textContent =
                        `${project.progress}%`
            );
    }


    /* =====================================================
       CANVAS
       ===================================================== */

    const canvas =
        $("#canvas");

    const canvasEmpty =
        $("#canvasEmpty");


    let selectedNode = null;


    function selectNode(node) {

        $$(".canvas-node")
            .forEach(
                item =>
                    item.classList.remove(
                        "selected"
                    )
            );

        node.classList.add(
            "selected"
        );

        selectedNode =
            node;


        const inspectorTitle =
            $("#inspectorTitle");

        const inspectorType =
            $("#inspectorType");


        if (inspectorTitle) {

            inspectorTitle.value =
                node.querySelector(
                    "strong"
                )?.textContent ||
                "";
        }


        if (inspectorType) {

            inspectorType.textContent =
                node.dataset.type ||
                "ELEMENT";
        }


        $(".inspector")
            ?.classList.add(
                "has-selection"
            );
    }


    function createNode(
        type,
        name
    ) {

        if (!canvas) return;


        canvasEmpty?.classList.add(
            "hidden"
        );


        const node =
            document.createElement(
                "div"
            );


        node.className =
            "canvas-node generated-node";


        node.dataset.type =
            type;


        const count =
            $$(".canvas-node")
                .length;


        node.style.left =
            `${120 + ((count * 97) % 580)}px`;

        node.style.top =
            `${90 + ((count * 61) % 280)}px`;


        node.innerHTML = `

            <span class="node-type">
                ${escapeHTML(type)}
            </span>

            <strong>
                ${escapeHTML(name)}
            </strong>

            <button
                class="node-delete"
                type="button"
            >
                ×
            </button>
        `;


        canvas.appendChild(
            node
        );


        makeDraggable(node);


        node.addEventListener(
            "click",
            event => {

                if (
                    event.target.closest(
                        ".node-delete"
                    )
                ) {

                    node.remove();

                    selectedNode =
                        null;

                    updateCanvasEmpty();

                    return;
                }


                selectNode(node);
            }
        );


        selectNode(node);


        project.toolsUsed++;

        updateReadiness();

        saveProject();
    }


    /* =====================================================
       DRAG NODES
       ===================================================== */

    function makeDraggable(node) {

        let dragging = false;

        let startX = 0;
        let startY = 0;

        let startLeft = 0;
        let startTop = 0;


        node.addEventListener(
            "pointerdown",
            event => {

                if (
                    event.target.closest(
                        ".node-delete"
                    )
                ) {
                    return;
                }


                dragging = true;


                startX =
                    event.clientX;

                startY =
                    event.clientY;


                startLeft =
                    node.offsetLeft;

                startTop =
                    node.offsetTop;


                node.setPointerCapture(
                    event.pointerId
                );


                node.classList.add(
                    "dragging"
                );
            }
        );


        node.addEventListener(
            "pointermove",
            event => {

                if (!dragging) return;


                const dx =
                    event.clientX -
                    startX;

                const dy =
                    event.clientY -
                    startY;


                node.style.left =
                    `${Math.max(
                        0,
                        startLeft + dx
                    )}px`;


                node.style.top =
                    `${Math.max(
                        0,
                        startTop + dy
                    )}px`;
            }
        );


        node.addEventListener(
            "pointerup",
            event => {

                dragging = false;

                node.releasePointerCapture(
                    event.pointerId
                );

                node.classList.remove(
                    "dragging"
                );
            }
        );
    }


    $$(".canvas-node")
        .forEach(
            node => {

                makeDraggable(node);

                node.addEventListener(
                    "click",
                    event => {

                        if (
                            event.target.closest(
                                ".node-delete"
                            )
                        ) {

                            node.remove();

                            updateCanvasEmpty();

                            return;
                        }

                        selectNode(node);
                    }
                );
            }
        );


    function updateCanvasEmpty() {

        const nodes =
            $$(".canvas-node");

        if (canvasEmpty) {

            canvasEmpty.classList.toggle(
                "hidden",
                nodes.length > 0
            );
        }
    }


    /* =====================================================
       TOOLS
       ===================================================== */

    const tools =
        $$(".build-tool");


    tools.forEach(
        tool => {

            tool.addEventListener(
                "click",
                () => {

                    tools.forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );

                    tool.classList.add(
                        "active"
                    );


                    const type =
                        tool.dataset.tool;


                    const names = {
                        text:
                            [
                                "Problem",
                                "Idea",
                                "Insight",
                                "Hypothesis"
                            ],

                        component:
                            [
                                "Interface",
                                "Feature",
                                "Dashboard",
                                "System"
                            ],

                        shape:
                            [
                                "Concept",
                                "Module",
                                "Service"
                            ],

                        flow:
                            [
                                "User Flow",
                                "Decision",
                                "Action"
                            ],

                        note:
                            [
                                "Research Note",
                                "Feedback",
                                "Observation"
                            ],

                        image:
                            [
                                "Reference",
                                "Visual",
                                "Mockup"
                            ]
                    };


                    if (
                        names[type]
                    ) {

                        const list =
                            names[type];

                        const name =
                            list[
                                Math.floor(
                                    Math.random() *
                                    list.length
                                )
                            ];


                        createNode(
                            type.toUpperCase(),
                            name
                        );
                    }


                    project.toolsUsed++;

                    saveProject();
                }
            );
        }
    );


    /* =====================================================
       DELETE / CLEAR CANVAS
       ===================================================== */

    $("#clearCanvas")
        ?.addEventListener(
            "click",
            () => {

                $$(".generated-node")
                    .forEach(
                        node =>
                            node.remove()
                    );

                selectedNode =
                    null;

                updateCanvasEmpty();

                showToast(
                    "Generated elements cleared."
                );
            }
        );


    /* =====================================================
       INSPECTOR
       ===================================================== */

    $("#inspectorTitle")
        ?.addEventListener(
            "input",
            event => {

                if (!selectedNode)
                    return;

                const title =
                    selectedNode.querySelector(
                        "strong"
                    );

                if (title) {

                    title.textContent =
                        event.target.value ||
                        "Untitled";
                }

                saveProject();
            }
        );


    /* =====================================================
       ZOOM
       ===================================================== */

    let zoom =
        1;


    const zoomValue =
        $("#zoomValue");


    function applyZoom() {

        if (!canvas) return;

        const nodes =
            $$(".canvas-node");

        const centerX =
            canvas.clientWidth / 2;

        const centerY =
            canvas.clientHeight / 2;


        nodes.forEach(
            node => {

                node.style.transform =
                    `scale(${zoom})`;
            }
        );


        if (zoomValue) {

            zoomValue.textContent =
                `${Math.round(
                    zoom * 100
                )}%`;
        }
    }


    $(
        "[data-zoom='in']"
    )?.addEventListener(
        "click",
        () => {

            zoom =
                clamp(
                    zoom + 0.1,
                    0.5,
                    1.8
                );

            applyZoom();
        }
    );


    $(
        "[data-zoom='out']"
    )?.addEventListener(
        "click",
        () => {

            zoom =
                clamp(
                    zoom - 0.1,
                    0.5,
                    1.8
                );

            applyZoom();
        }
    );


    $(
        "[data-zoom='reset']"
    )?.addEventListener(
        "click",
        () => {

            zoom = 1;

            applyZoom();
        }
    );


    /* =====================================================
       TEST METHODS
       ===================================================== */

    $$(".test-method")
        .forEach(
            method => {

                method.addEventListener(
                    "click",
                    () => {

                        $$(".test-method")
                            .forEach(
                                item =>
                                    item.classList.remove(
                                        "active"
                                    )
                            );

                        method.classList.add(
                            "active"
                        );
                    }
                );
            }
        );


    /* =====================================================
       TEST ENGINE
       ===================================================== */

    $("#runTest")
        ?.addEventListener(
            "click",
            event => {

                const button =
                    event.currentTarget;

                const result =
                    $("#testResult");


                if (
                    !project.hypothesis
                ) {

                    showToast(
                        "Add a hypothesis before testing."
                    );

                    $("#hypothesis")
                        ?.focus();

                    return;
                }


                button.disabled =
                    true;

                button.textContent =
                    "Running experiment...";


                if (result) {

                    result.textContent =
                        "Collecting signal...";
                }


                setTimeout(
                    () => {

                        project.tests++;


                        const success =
                            Math.random() >
                            0.3;


                        if (result) {

                            result.classList.remove(
                                "success",
                                "warning"
                            );


                            result.classList.add(
                                success
                                    ? "success"
                                    : "warning"
                            );


                            result.textContent =
                                success
                                    ? "✓ Strong signal detected. Your hypothesis has evidence."
                                    : "△ Weak signal detected. Your idea needs another iteration.";
                        }


                        button.disabled =
                            false;

                        button.textContent =
                            success
                                ? "Run Again →"
                                : "Retry Experiment →";


                        project.progress =
                            clamp(
                                project.progress +
                                (
                                    success
                                        ? 5
                                        : 2
                                ),
                                0,
                                100
                            );


                        setStage(
                            success
                                ? "Test"
                                : "Build"
                        );


                        updateMetric(
                            "tests",
                            project.tests
                        );


                        updateReadiness();

                        saveProject();


                        showToast(
                            success
                                ? "Experiment produced a strong signal."
                                : "Experiment needs another iteration."
                        );

                    },
                    1400
                );
            }
        );


    /* =====================================================
       EVIDENCE UPLOAD
       ===================================================== */

    const uploadZone =
        $("[data-upload-zone]");

    const fileInput =
        $("[data-file-input]");

    const fileList =
        $("[data-file-list]");


    if (
        uploadZone &&
        fileInput
    ) {

        uploadZone.addEventListener(
            "click",
            () =>
                fileInput.click()
        );


        [
            "dragenter",
            "dragover"
        ].forEach(
            eventName => {

                uploadZone.addEventListener(
                    eventName,
                    event => {

                        event.preventDefault();

                        uploadZone.classList.add(
                            "dragging"
                        );
                    }
                );
            }
        );


        [
            "dragleave",
            "drop"
        ].forEach(
            eventName => {

                uploadZone.addEventListener(
                    eventName,
                    event => {

                        event.preventDefault();

                        uploadZone.classList.remove(
                            "dragging"
                        );
                    }
                );
            }
        );


        uploadZone.addEventListener(
            "drop",
            event => {

                processFiles(
                    event.dataTransfer.files
                );
            }
        );


        fileInput.addEventListener(
            "change",
            () => {

                processFiles(
                    fileInput.files
                );

                fileInput.value = "";
            }
        );
    }


    function processFiles(files) {

        if (!fileList) return;


        const empty =
            fileList.querySelector(
                ".empty-evidence"
            );

        empty?.remove();


        [...files].forEach(
            file => {

                project.evidence++;


                const item =
                    document.createElement(
                        "div"
                    );

                item.className =
                    "uploaded-file";


                item.innerHTML = `

                    <span class="file-icon">
                        ↗
                    </span>

                    <div class="file-info">

                        <strong>
                            ${escapeHTML(
                                file.name
                            )}
                        </strong>

                        <small>
                            ${formatFileSize(
                                file.size
                            )}
                        </small>

                    </div>

                    <span class="file-status">
                        ADDED
                    </span>
                `;


                fileList.prepend(
                    item
                );
            }
        );


        updateMetric(
            "evidence",
            project.evidence
        );


        project.progress =
            clamp(
                project.progress + 2,
                0,
                100
            );


        updateProgress();

        updateReadiness();

        saveProject();


        showToast(
            `${files.length} evidence file${files.length > 1 ? "s" : ""} added.`
        );
    }


    function formatFileSize(bytes) {

        if (!bytes)
            return "0 KB";


        const units = [
            "B",
            "KB",
            "MB",
            "GB"
        ];


        const index =
            Math.min(
                Math.floor(
                    Math.log(bytes) /
                    Math.log(1024)
                ),
                units.length - 1
            );


        return `${
            (
                bytes /
                Math.pow(
                    1024,
                    index
                )
            ).toFixed(1)
        } ${units[index]}`;
    }


    /* =====================================================
       COLLABORATORS
       ===================================================== */

    $(
        "#addCollaborator"
    )?.addEventListener(
        "click",
        () => {

            project.collaborators++;


            const team =
                $(".team-grid");


            if (team) {

                const member =
                    document.createElement(
                        "div"
                    );


                member.className =
                    "team-member";


                member.innerHTML = `

                    <div class="avatar">
                        +
                    </div>

                    <div>

                        <strong>
                            New collaborator
                        </strong>

                        <span>
                            Invited
                        </span>

                    </div>

                    <b>
                        PENDING
                    </b>
                `;


                team.appendChild(
                    member
                );
            }


            saveProject();

            showToast(
                "Collaboration invitation created."
            );
        }
    );


    /* =====================================================
       VERSION CONTROL
       ===================================================== */

    function saveVersion() {

        project.versions++;


        const timeline =
            $("#versionTimeline");


        if (timeline) {

            const item =
                document.createElement(
                    "div"
                );


            item.className =
                "version-item";


            item.innerHTML = `

                <span class="version-dot"></span>

                <div>

                    <strong>
                        Version ${
                            project.versions
                        }
                    </strong>

                    <small>
                        Saved just now
                    </small>

                </div>
            `;


            timeline.prepend(
                item
            );
        }


        saveProject();


        showToast(
            `Version ${project.versions} saved.`
        );
    }


    $("#saveVersion")
        ?.addEventListener(
            "click",
            saveVersion
        );


    $("#saveVersionSecondary")
        ?.addEventListener(
            "click",
            saveVersion
        );


    /* =====================================================
       READINESS
       ===================================================== */

    function calculateReadiness() {

        let score = 15;


        if (project.title)
            score += 8;

        if (project.problem)
            score += 12;

        if (project.users)
            score += 8;

        if (project.solution)
            score += 12;

        if (project.technology.length)
            score += 5;

        if (project.tests)
            score += 15;

        if (project.evidence)
            score += 10;

        if (project.collaborators > 1)
            score += 5;

        if (
            project.stage ===
            "Test"
        )
            score += 5;

        if (
            project.stage ===
            "Iterate"
        )
            score += 10;


        return clamp(
            score,
            0,
            100
        );
    }


    function updateReadiness() {

        const score =
            calculateReadiness();


        const value =
            $("#readinessValue");

        const bar =
            $("#readinessBar");


        if (value) {

            value.textContent =
                `${score}%`;
        }


        if (bar) {

            bar.style.width =
                `${score}%`;
        }
    }


    /* =====================================================
       CHECKLIST
       ===================================================== */

    function updateChecklist() {

        const checks = {

            problem:
                Boolean(
                    project.problem
                ),

            concept:
                Boolean(
                    project.solution
                ),

            prototype:
                $$(".canvas-node")
                    .length > 0,

            test:
                project.tests > 0,

            evidence:
                project.evidence > 0
        };


        $$(
            "[data-check]"
        ).forEach(
            item => {

                const key =
                    item.dataset.check;

                const complete =
                    checks[key];


                item.classList.toggle(
                    "complete",
                    complete
                );


                const icon =
                    item.querySelector(
                        ".check-icon"
                    );


                if (icon) {

                    icon.textContent =
                        complete
                            ? "✓"
                            : "○";
                }
            }
        );
    }


    $("#reviewBuild")
        ?.addEventListener(
            "click",
            () => {

                updateChecklist();

                updateReadiness();

                showToast(
                    "Build review updated."
                );

                $("#reviewPanel")
                    ?.scrollIntoView({
                        behavior:
                            "smooth",
                        block:
                            "center"
                    });
            }
        );


    /* =====================================================
       PRESENTATION MODE
       ===================================================== */

    const overlay =
        $("#presentationOverlay");


    $("#presentBuild")
        ?.addEventListener(
            "click",
            () => {

                overlay?.classList.add(
                    "active"
                );
            }
        );


    $("#exitPresentation")
        ?.addEventListener(
            "click",
            () => {

                overlay?.classList.remove(
                    "active"
                );
            }
        );


    /* =====================================================
       IMPACT
       ===================================================== */

    $("#goToImpact")
        ?.addEventListener(
            "click",
            () => {

                saveProject();

                window.location.href =
                    "innovation-lab4.html";
            }
        );


    /* =====================================================
       START BUILD
       ===================================================== */

    $("#startBuild")
        ?.addEventListener(
            "click",
            () => {

                setStage(
                    "Define"
                );

                $("#projectSetup")
                    ?.scrollIntoView({
                        behavior:
                            "smooth",
                        block:
                            "start"
                    });

                showToast(
                    "Build workspace initialized."
                );
            }
        );


    /* =====================================================
       KEYBOARD SHORTCUTS
       ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            const active =
                document.activeElement;


            const typing =
                active &&
                [
                    "INPUT",
                    "TEXTAREA",
                    "SELECT"
                ].includes(
                    active.tagName
                );


            if (typing) return;


            switch (
                event.key.toLowerCase()
            ) {

                case "v":
                    $(
                        "[data-tool='select']"
                    )?.click();
                    break;


                case "t":
                    $(
                        "[data-tool='text']"
                    )?.click();
                    break;


                case "c":
                    $(
                        "[data-tool='component']"
                    )?.click();
                    break;


                case "f":
                    $(
                        "[data-tool='flow']"
                    )?.click();
                    break;


                case "n":
                    $(
                        "[data-tool='note']"
                    )?.click();
                    break;


                case "escape":
                    overlay?.classList.remove(
                        "active"
                    );
                    break;
            }
        }
    );


    /* =====================================================
       METRICS
       ===================================================== */

    function updateMetric(
        metric,
        value
    ) {

        $$(
            `[data-metric="${metric}"]`
        ).forEach(
            element =>
                element.textContent =
                    value
        );
    }


    /* =====================================================
       TOAST
       ===================================================== */

    let toastTimer;


    function showToast(message) {

        const toast =
            $("#toast");


        if (!toast) return;


        toast.textContent =
            message;


        toast.classList.add(
            "show"
        );


        clearTimeout(
            toastTimer
        );


        toastTimer =
            setTimeout(
                () => {

                    toast.classList.remove(
                        "show"
                    );

                },
                2600
            );
    }


    /* =====================================================
       AUTO SAVE
       ===================================================== */

    setInterval(
        () => {

            saveProject();

            updateReadiness();

            updateChecklist();

        },
        5000
    );


    /* =====================================================
       INITIALIZE
       ===================================================== */

    updatePreview();

    updateCompletion();

    updateProgress();

    updateReadiness();

    updateChecklist();

    updateCanvasEmpty();


    console.log(
        "PORTAL Innovation Lab 03 — Build Studio ready."
    );

});