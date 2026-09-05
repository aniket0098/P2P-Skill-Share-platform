document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       DATA
    ===================================================== */

    const defaultSkills = [];


    let skills =
        JSON.parse(
            localStorage.getItem("skillConnectSkills")
        ) || defaultSkills;


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const $ = id =>
        document.getElementById(id);


    const reanalyzeBtn =
        $("reanalyzeBtn");

    const profileButton =
        $("profileButton");

    const profileDropdown =
        $("profileDropdown");

    const modalOverlay =
        $("modalOverlay");

    const modalContent =
        $("modalContent");

    const toastElement =
        $("toast");


    /* =====================================================
       SAVE DATA
    ===================================================== */

    function saveData(){

        localStorage.setItem(
            "skillConnectSkills",
            JSON.stringify(skills)
        );

    }


    /* =====================================================
       TOAST
    ===================================================== */

    function showToast(message){

        toastElement.textContent =
            message;

        toastElement.classList.add("show");

        clearTimeout(window.toastTimer);

        window.toastTimer =
            setTimeout(() => {

                toastElement.classList.remove("show");

            }, 2500);

    }


    /* =====================================================
       OVERALL SCORE
    ===================================================== */

    function calculateOverall(){

        if (!skills.length) return 0;

        const total =
            skills.reduce(
                (sum, skill) =>
                    sum + skill.score,
                0
            );

        return Math.round(
            total / skills.length
        );

    }


    /* =====================================================
       JOB MATCH
    ===================================================== */

    function calculateJobMatch(){

        let score =
            calculateOverall();

        /*
            JavaScript + React are weighted
            more heavily for frontend jobs.
        */

        const js =
            skills.find(
                s => s.name === "JavaScript"
            );

        const react =
            skills.find(
                s => s.name === "React.js"
            );

        if(js){
            score +=
                (js.score - score) * .12;
        }

        if(react){
            score +=
                (react.score - score) * .08;
        }

        return Math.max(
            0,
            Math.min(
                100,
                Math.round(score)
            )
        );

    }


    /* =====================================================
       UPDATE SCORE
    ===================================================== */

    function updateOverallScore(){

        const score =
            calculateOverall();

        $("overallScore")
            .textContent =
            score + "%";


        $("scoreMessage")
            .textContent =
            score + "%";


        let status =
            "Needs Improvement";

        if(score >= 80){

            status = "Excellent";

        }
        else if(score >= 65){

            status = "Good";

        }
        else if(score >= 50){

            status = "Average";

        }


        $("scoreStatus")
            .textContent =
            status;


        $("scoreCircle").style.background =
            `conic-gradient(
                #7140ff 0 ${score}%,
                #27334c ${score}% 100%
            )`;

    }


    /* =====================================================
       JOB MATCH UI
    ===================================================== */

    function updateJobMatch(){

        const match =
            calculateJobMatch();


        $("jobMatchScore")
            .textContent =
            match + "%";


        $("jobGauge").style.background =
            `conic-gradient(
                from 270deg,
                #28c46c 0 ${match}%,
                #23324b ${match}% 100%
            )`;


        let role =
            "Frontend Developer";


        if(match >= 80){

            role =
                "Frontend Developer";

        }
        else if(match >= 65){

            role =
                "Junior Frontend Developer";

        }
        else{

            role =
                "Entry-Level Web Developer";

        }


        $("jobMatchText").textContent =
            `You currently match ${role} roles.
             Improve the recommended skills
             to increase your chances.`;

    }


    /* =====================================================
       RENDER YOUR SKILLS
    ===================================================== */

    function renderSkills(){

        const container =
            $("skillsList");

        container.innerHTML = "";


        skills
            .slice(0,6)
            .forEach(skill => {

                const row =
                    document.createElement("div");

                row.className =
                    "skill-row";


                row.innerHTML = `

                    <div class="skill-top">

                        <div class="skill-name">

                            <span class="skill-icon">
                                ✦
                            </span>

                            ${skill.name}

                            <span class="skill-level">
                                ${skill.level}
                            </span>

                        </div>

                        <span class="skill-value">
                            ${skill.score}%
                        </span>

                    </div>


                    <div class="progress">

                        <div
                            class="progress-fill"
                            style="width:${skill.score}%"
                        ></div>

                    </div>

                `;


                container.appendChild(row);

            });

    }


    /* =====================================================
       INDUSTRY COMPARISON
    ===================================================== */

    function renderIndustry(){

        const container =
            $("industryComparison");

        container.innerHTML = "";


        skills
            .slice(0,6)
            .forEach(skill => {

                const row =
                    document.createElement("div");

                row.className =
                    "compare-row";


                row.innerHTML = `

                    <div class="compare-name">
                        ${skill.name}
                    </div>


                    <div class="compare-bars">

                        <div class="bar-box">

                            <div class="bar">

                                <span
                                    class="your-bar"
                                    style="
                                    width:${skill.score}%
                                    "
                                ></span>

                            </div>

                            <small>
                                ${skill.score}%
                            </small>

                        </div>


                        <div class="bar-box">

                            <div class="bar">

                                <span
                                    class="industry-bar"
                                    style="
                                    width:${skill.industry}%
                                    "
                                ></span>

                            </div>

                            <small>
                                ${skill.industry}%
                            </small>

                        </div>

                    </div>

                `;


                container.appendChild(row);

            });

    }


    /* =====================================================
       GAP ANALYSIS
    ===================================================== */

    function renderGap(){

        const container =
            $("gapList");

        container.innerHTML = "";


        skills
            .slice(0,5)
            .forEach(skill => {

                const gap =
                    Math.max(
                        0,
                        skill.industry -
                        skill.score
                    );


                const row =
                    document.createElement("div");

                row.className =
                    "gap-row";


                row.innerHTML = `

                    <span class="gap-name">
                        ${skill.name}
                    </span>


                    <div class="gap-bar">

                        <span
                            class="gap-you"
                            style="
                            width:${skill.score}%
                            "
                        ></span>

                    </div>


                    <div class="gap-bar">

                        <span
                            class="gap-required"
                            style="
                            width:${skill.industry}%
                            "
                        ></span>

                    </div>


                    <span class="gap-percent">
                        ${gap}%
                    </span>

                `;


                container.appendChild(row);

            });

    }


    /* =====================================================
       CAREER ROLES
    ===================================================== */

    function calculateRoleMatch(
        role
    ){

        const averages =
            role.skills.map(
                required => {

                    const found =
                        skills.find(
                            s =>
                            s.name ===
                            required
                        );

                    return found
                        ? found.score
                        : 20;

                }
            );


        return Math.round(
            averages.reduce(
                (a,b) => a+b,
                0
            ) / averages.length
        );

    }


    const roles = [

        {
            name:"Frontend Developer",
            icon:"🤖",
            skills:[
                "HTML",
                "CSS",
                "JavaScript",
                "React.js"
            ]
        },

        {
            name:"Web Developer",
            icon:"◉",
            skills:[
                "HTML",
                "CSS",
                "JavaScript"
            ]
        },

        {
            name:"UI Developer",
            icon:"🎨",
            skills:[
                "HTML",
                "CSS",
                "JavaScript"
            ]
        },

        {
            name:"Full Stack Developer",
            icon:"♟",
            skills:[
                "HTML",
                "CSS",
                "JavaScript",
                "React.js",
                "Node.js",
                "MongoDB"
            ]
        },

        {
            name:"React Developer",
            icon:"⚛",
            skills:[
                "JavaScript",
                "React.js"
            ]
        },

        {
            name:"JavaScript Developer",
            icon:"JS",
            skills:[
                "HTML",
                "CSS",
                "JavaScript"
            ]
        }

    ];


    function renderRoles(){

        const container =
            $("rolesList");

        container.innerHTML = "";


        roles
            .slice(0,5)
            .forEach(role => {

                const match =
                    calculateRoleMatch(
                        role
                    );


                const row =
                    document.createElement("div");

                row.className =
                    "role";


                row.innerHTML = `

                    <div class="role-icon">
                        ${role.icon}
                    </div>

                    <div class="role-info">
                        ${role.name}
                    </div>

                    <span class="role-match">
                        ${match}% Match
                    </span>

                `;


                container.appendChild(row);

            });

    }


    /* =====================================================
       RECOMMENDED SKILLS
    ===================================================== */

    function renderRecommendations(){

        const missing =
            skills
                .filter(
                    s =>
                    s.score <
                    s.industry
                )
                .sort(
                    (a,b) =>
                    (b.industry-b.score) -
                    (a.industry-a.score)
                )
                .slice(0,5);


        const container =
            $("recommendedSkills");

        container.innerHTML = "";


        missing.forEach(skill => {

            const gap =
                skill.industry -
                skill.score;


            const item =
                document.createElement("div");

            item.className =
                "recommendation";


            item.innerHTML = `

                <div class="recommendation-icon">
                    ✦
                </div>

                <div class="recommendation-info">

                    <strong>
                        ${skill.name}
                    </strong>

                    <small>
                        Industry demand:
                        ${skill.industry}%
                        • Your level:
                        ${skill.score}%
                    </small>

                </div>

                <span class="priority">
                    ${gap >= 30
                        ? "High"
                        : gap >= 15
                        ? "Medium"
                        : "Low"}
                </span>

            `;


            container.appendChild(item);

        });

    }


    /* =====================================================
       RADAR CHART
    ===================================================== */

    const radarCategories = [

        "Technical",
        "Problem",
        "Tools",
        "Communication",
        "Industry"

    ];


    function radarPoints(values){

        const centerX = 200;
        const centerY = 155;

        const radius = 120;

        return values
            .map(
                (value,index) => {

                    const angle =
                        -Math.PI / 2 +
                        index *
                        (Math.PI * 2 / 5);


                    const r =
                        radius *
                        value /
                        100;


                    const x =
                        centerX +
                        Math.cos(angle) * r;


                    const y =
                        centerY +
                        Math.sin(angle) * r;


                    return `${x},${y}`;

                }
            )
            .join(" ");

    }


    function updateRadar(){

        const technical =
            average(
                ["HTML","CSS","JavaScript"]
            );

        const problem =
            average(
                ["JavaScript","React.js"]
            );

        const tools =
            average(
                ["React.js","Node.js","MongoDB"]
            );

        const communication =
            0;

        const industry =
            average(
                ["HTML","JavaScript","React.js"]
            );


        const userValues = [

            technical,
            problem,
            tools,
            communication,
            industry

        ];


        const industryValues = [

            92,
            88,
            82,
            75,
            90

        ];


        $("userPolygon")
            .setAttribute(
                "points",
                radarPoints(userValues)
            );


        $("industryPolygon")
            .setAttribute(
                "points",
                radarPoints(industryValues)
            );


        const pointGroup =
            $("radarPoints");

        pointGroup.innerHTML = "";


        userValues.forEach(
            (value,index) => {

                const points =
                    radarPoints(
                        userValues
                    )
                    .split(" ");


                const [x,y] =
                    points[index]
                    .split(",");


                const circle =
                    document.createElementNS(
                        "http://www.w3.org/2000/svg",
                        "circle"
                    );


                circle.setAttribute(
                    "cx",
                    x
                );

                circle.setAttribute(
                    "cy",
                    y
                );

                circle.setAttribute(
                    "r",
                    "4"
                );

                circle.setAttribute(
                    "class",
                    "radar-point"
                );


                pointGroup.appendChild(
                    circle
                );

            }
        );

    }


    function average(names){

        const values =
            names
                .map(
                    name => {

                        const s =
                            skills.find(
                                x =>
                                x.name ===
                                name
                            );

                        return s
                            ? s.score
                            : 0;

                    }
                );


        return Math.round(
            values.reduce(
                (a,b)=>a+b,
                0
            ) / values.length
        );

    }


    /* =====================================================
       FULL REPORT
    ===================================================== */

    function showFullReport(){

        const score =
            calculateOverall();

        const match =
            calculateJobMatch();


        let html = `

            <h2>
                📊 Complete Skill Analysis Report
            </h2>

            <div class="modal-card">

                <strong>
                    Overall Skill Score
                </strong>

                <span>
                    ${score}%
                </span>

            </div>


            <div class="modal-card">

                <strong>
                    Job Match
                </strong>

                <span>
                    ${match}%
                </span>

            </div>


            <h3 style="margin:20px 0 10px">
                Skill Performance
            </h3>

        `;


        skills.forEach(skill => {

            html += `

                <div class="modal-card">

                    <strong>
                        ${skill.name}
                    </strong>

                    <span>
                        ${skill.score}%
                    </span>

                    <p>
                        Industry requirement:
                        ${skill.industry}%
                        <br>
                        Gap:
                        ${Math.max(
                            0,
                            skill.industry -
                            skill.score
                        )}%
                    </p>

                </div>

            `;

        });


        openModal(html);

    }


    /* =====================================================
       VIEW ALL SKILLS
    ===================================================== */

    function showAllSkills(){

        let html = `
            <h2>
                ✦ All Your Skills
            </h2>
        `;


        skills.forEach(skill => {

            html += `

                <div class="modal-card">

                    <strong>
                        ${skill.name}
                    </strong>

                    <span>
                        ${skill.score}%
                    </span>

                    <p>
                        Level:
                        ${skill.level}
                    </p>

                </div>

            `;

        });


        openModal(html);

    }


    /* =====================================================
       INDUSTRY SKILLS
    ===================================================== */

    function showIndustrySkills(){

        let html = `
            <h2>
                📈 Industry Skill Demand
            </h2>
        `;


        skills
            .slice()
            .sort(
                (a,b) =>
                b.industry -
                a.industry
            )
            .forEach(skill => {

                html += `

                    <div class="modal-card">

                        <strong>
                            ${skill.name}
                        </strong>

                        <span>
                            ${skill.industry}%
                        </span>

                        <p>
                            Current industry demand
                        </p>

                    </div>

                `;

            });


        openModal(html);

    }


    /* =====================================================
       GAP REPORT
    ===================================================== */

    function showGapReport(){

        let html = `
            <h2>
                📊 Complete Skill Gap Report
            </h2>

            <p>
                These gaps show how far your current
                skills are from industry requirements.
            </p>
        `;


        skills
            .slice()
            .sort(
                (a,b) =>
                (b.industry-b.score) -
                (a.industry-a.score)
            )
            .forEach(skill => {

                const gap =
                    Math.max(
                        0,
                        skill.industry -
                        skill.score
                    );


                html += `

                    <div class="modal-card">

                        <strong>
                            ${skill.name}
                        </strong>

                        <span>
                            ${gap}% Gap
                        </span>

                        <p>
                            Your Score:
                            ${skill.score}%
                            <br>

                            Required:
                            ${skill.industry}%
                        </p>

                    </div>

                `;

            });


        openModal(html);

    }


    /* =====================================================
       ALL ROLES
    ===================================================== */

    function showAllRoles(){

        let html = `
            <h2>
                💼 Career Roles For You
            </h2>
        `;


        roles.forEach(role => {

            const match =
                calculateRoleMatch(
                    role
                );


            html += `

                <div class="modal-card">

                    <strong>
                        ${role.icon}
                        ${role.name}
                    </strong>

                    <span>
                        ${match}% Match
                    </span>

                    <p>
                        Required skills:
                        ${role.skills.join(", ")}
                    </p>

                </div>

            `;

        });


        openModal(html);

    }


    /* =====================================================
       JOBS
    ===================================================== */

    function showJobs(){

        const match =
            calculateJobMatch();


        openModal(`

            <h2>
                💼 Jobs Matching Your Skills
            </h2>

            <div class="modal-card">

                <strong>
                    Frontend Developer
                </strong>

                <span>
                    ${match}% Match
                </span>

                <p>
                    React • JavaScript • HTML • CSS
                </p>

            </div>


            <div class="modal-card">

                <strong>
                    React Developer
                </strong>

                <span>
                    ${calculateRoleMatch(
                        roles[4]
                    )}% Match
                </span>

                <p>
                    React.js • JavaScript
                </p>

            </div>


            <div class="modal-card">

                <strong>
                    Web Developer
                </strong>

                <span>
                    ${calculateRoleMatch(
                        roles[1]
                    )}% Match
                </span>

                <p>
                    HTML • CSS • JavaScript
                </p>

            </div>

        `);

    }


    /* =====================================================
       MODAL
    ===================================================== */

    function openModal(content){

        modalContent.innerHTML =
            content;

        modalOverlay.classList.add(
            "show"
        );

        document.body.style.overflow =
            "hidden";

    }


    function closeModal(){

        modalOverlay.classList.remove(
            "show"
        );

        document.body.style.overflow =
            "";

    }


    $("modalClose")
        .addEventListener(
            "click",
            closeModal
        );


    modalOverlay
        .addEventListener(
            "click",
            event => {

                if(
                    event.target ===
                    modalOverlay
                ){

                    closeModal();

                }

            }
        );


    /* =====================================================
       RE-ANALYZE
       SIMULATES NEW ANALYSIS
    ===================================================== */

    reanalyzeBtn
        .addEventListener(
            "click",
            () => {

                const icon =
                    $("refreshIcon");


                icon.classList.add(
                    "rotating"
                );


                reanalyzeBtn.disabled =
                    true;


                reanalyzeBtn.style.opacity =
                    ".6";


                showToast(
                    "🔍 Analyzing your skills..."
                );


                setTimeout(
                    () => {

                        skills =
                            skills.map(
                                skill => {

                                    /*
                                    Small realistic
                                    improvement/random
                                    analysis change
                                    */

                                    const change =
                                        Math.floor(
                                            Math.random()*7
                                        ) - 2;


                                    return {

                                        ...skill,

                                        score:
                                            Math.max(
                                                10,
                                                Math.min(
                                                    100,
                                                    skill.score +
                                                    change
                                                )
                                            )

                                    };

                                }
                            );


                        saveData();

                        updateEverything();


                        icon.classList.remove(
                            "rotating"
                        );


                        reanalyzeBtn.disabled =
                            false;


                        reanalyzeBtn.style.opacity =
                            "1";


                        showToast(
                            "✅ Skill analysis updated!"
                        );

                    },
                    1800
                );

            }
        );


    /* =====================================================
       PROFILE DROPDOWN
    ===================================================== */

    profileButton
        .addEventListener(
            "click",
            event => {

                event.stopPropagation();

                profileDropdown
                    .classList.toggle(
                        "show"
                    );

            }
        );


    document.addEventListener(
        "click",
        event => {

            if(
                !profileDropdown.contains(
                    event.target
                ) &&
                !profileButton.contains(
                    event.target
                )
            ){

                profileDropdown
                    .classList.remove(
                        "show"
                    );

            }

        }
    );


    /* PROFILE MENU */

    profileDropdown
        .addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        "button"
                    );


                if(!button)
                    return;


                const action =
                    button.dataset.profile;


                profileDropdown
                    .classList.remove(
                        "show"
                    );


                if(
                    action ===
                    "profile"
                ){

                    openModal(`

                        <h2>
                            👤 Anonymous
                        </h2>

                        <div class="modal-card">

                            <strong>
                                Role
                            </strong>

                            <span>
                                Learner
                            </span>

                        </div>

                        <div class="modal-card">

                            <strong>
                                Skill Score
                            </strong>

                            <span>
                                ${calculateOverall()}%
                            </span>

                        </div>

                    `);

                }


                else if(
                    action ===
                    "skills"
                ){

                    showAllSkills();

                }


                else if(
                    action ===
                    "settings"
                ){

                    showToast(
                        "⚙ Settings selected"
                    );

                }


                else if(
                    action ===
                    "logout"
                ){

                    showToast(
                        "↪ Logout selected"
                    );

                }

            }
        );


    /* =====================================================
       BUTTON EVENTS
    ===================================================== */

    $("fullReportBtn")
        .onclick =
        showFullReport;


    $("viewAllSkillsBtn")
        .onclick =
        showAllSkills;


    $("viewIndustryBtn")
        .onclick =
        showIndustrySkills;


    $("fullGapReportBtn")
        .onclick =
        showGapReport;


    $("allRolesBtn")
        .onclick =
        showAllRoles;


    $("exploreJobsBtn")
        .onclick =
        showJobs;


    $("startAnalysisBtn")
        .onclick =
        () => {

            reanalyzeBtn.click();

        };


    $("learningPathBtn")
        .onclick =
        () => {

            openModal(`

                <h2>
                    📚 Recommended Learning Path
                </h2>

                <div class="modal-card">

                    <strong>
                        1. TypeScript
                    </strong>

                    <span>
                        High Priority
                    </span>

                    <p>
                        Learn types, interfaces,
                        generics and TypeScript with React.
                    </p>

                </div>


                <div class="modal-card">

                    <strong>
                        2. Node.js
                    </strong>

                    <span>
                        High Priority
                    </span>

                    <p>
                        Learn APIs, authentication,
                        Express and backend development.
                    </p>

                </div>


                <div class="modal-card">

                    <strong>
                        3. MongoDB
                    </strong>

                    <span>
                        Medium Priority
                    </span>

                    <p>
                        Learn database design,
                        queries and aggregation.
                    </p>

                </div>

            `);

        };


    $("notificationBtn")
        .onclick =
        () => {

            openModal(`

                <h2>
                    🔔 Notifications
                </h2>

                <div class="modal-card">
                    <strong>
                        Skill analysis completed
                    </strong>
                    <p>
                        Your latest skill analysis is ready.
                    </p>
                </div>

                <div class="modal-card">
                    <strong>
                        New job match
                    </strong>
                    <p>
                        You have new Frontend Developer
                        opportunities.
                    </p>
                </div>

            `);

        };


    /* =====================================================
       SIDEBAR NAV
    ===================================================== */

    document
        .querySelectorAll(".nav-item")
        .forEach(item => {

            item.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    if(
                        !item.classList.contains(
                            "active"
                        )
                    ){

                        showToast(
                            item.textContent.trim()
                            + " selected"
                        );

                    }

                }
            );

        });


    /* =====================================================
       UPDATE EVERYTHING
    ===================================================== */

    function updateEverything(){

        updateOverallScore();

        updateJobMatch();

        renderSkills();

        renderIndustry();

        renderGap();

        renderRoles();

        renderRecommendations();

        updateRadar();

    }


    /* =====================================================
       INITIAL LOAD
    ===================================================== */

    updateEverything();

});