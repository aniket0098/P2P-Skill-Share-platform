/* =========================================
   SKILLCONNECT INDUSTRY SKILLS JS
========================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================
       ELEMENTS
    ===================================== */

    const profileButton =
        document.getElementById("profileButton");

    const profileDropdown =
        document.getElementById("profileDropdown");

    const notificationBtn =
        document.getElementById("notificationBtn");

    const notificationDropdown =
        document.getElementById("notificationDropdown");

    const searchInput =
        document.getElementById("skillSearch");

    const searchBtn =
        document.getElementById("searchBtn");

    const searchResults =
        document.getElementById("searchResults");

    const modalOverlay =
        document.getElementById("modalOverlay");

    const modalClose =
        document.getElementById("modalClose");

    const modalContent =
        document.getElementById("modalContent");


    /* =====================================
       DATA
    ===================================== */

    const skills = [

        {
            name: "Full Stack Development",
            domain: "Technology",
            jobs: "23.5K"
        },

        {
            name: "Data Science",
            domain: "Technology",
            jobs: "18.2K"
        },

        {
            name: "Cloud Computing",
            domain: "Technology",
            jobs: "15.7K"
        },

        {
            name: "AI / Machine Learning",
            domain: "Technology",
            jobs: "14.8K"
        },

        {
            name: "Cybersecurity",
            domain: "Technology",
            jobs: "12.9K"
        },

        {
            name: "Generative AI",
            domain: "Technology",
            jobs: "11.8K"
        },

        {
            name: "UI/UX Design",
            domain: "Design",
            jobs: "9.4K"
        },

        {
            name: "Digital Marketing",
            domain: "Marketing",
            jobs: "8.7K"
        },

        {
            name: "Financial Analytics",
            domain: "Finance",
            jobs: "7.8K"
        },

        {
            name: "Healthcare Analytics",
            domain: "Healthcare",
            jobs: "6.4K"
        },

        {
            name: "Space Technology",
            domain: "Space",
            jobs: "4.2K"
        }

    ];


    /* =====================================
       PROFILE DROPDOWN
    ===================================== */

    profileButton.addEventListener("click", (event) => {

        event.stopPropagation();

        profileDropdown.classList.toggle("show");

        notificationDropdown.classList.remove("show");

    });


    /* =====================================
       NOTIFICATION DROPDOWN
    ===================================== */

    notificationBtn.addEventListener("click", (event) => {

        event.stopPropagation();

        notificationDropdown.classList.toggle("show");

        profileDropdown.classList.remove("show");

    });


    /* =====================================
       CLOSE DROPDOWNS
    ===================================== */

    document.addEventListener("click", () => {

        profileDropdown.classList.remove("show");

        notificationDropdown.classList.remove("show");

    });


    /* =====================================
       SEARCH
    ===================================== */

    function performSearch() {

        const query =
            searchInput.value
                .trim()
                .toLowerCase();

        searchResults.innerHTML = "";

        if (!query) {

            searchResults.classList.remove("show");

            return;

        }


        const results =
            skills.filter(skill =>
                skill.name.toLowerCase().includes(query) ||
                skill.domain.toLowerCase().includes(query)
            );


        if (results.length === 0) {

            searchResults.innerHTML = `
                <div class="search-result">
                    No skills found for "<strong>${escapeHTML(query)}</strong>"
                </div>
            `;

        } else {

            results.forEach(skill => {

                const item =
                    document.createElement("div");

                item.className = "search-result";

                item.innerHTML = `
                    <strong>${skill.name}</strong>
                    <br>
                    <small>
                        ${skill.domain} · ${skill.jobs} Job Openings
                    </small>
                `;

                item.addEventListener("click", () => {

                    openSkillModal(skill);

                });

                searchResults.appendChild(item);

            });

        }

        searchResults.classList.add("show");

    }


    searchBtn.addEventListener(
        "click",
        performSearch
    );


    searchInput.addEventListener(
        "input",
        performSearch
    );


    searchInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {

                performSearch();

            }

        }
    );


    /* =====================================
       DOMAIN FILTER
    ===================================== */

    const domainButtons =
        document.querySelectorAll(".domain-btn");

    domainButtons.forEach(button => {

        button.addEventListener("click", () => {

            const domain =
                button.dataset.domain;

            domainButtons.forEach(btn =>
                btn.classList.remove("selected")
            );

            button.classList.add("selected");

            filterSkills(domain);

        });

    });


    function filterSkills(domain) {

        const cards =
            document.querySelectorAll(".skill-card");

        cards.forEach(card => {

            if (
                domain === "all" ||
                card.dataset.domain === domain
            ) {

                card.style.display = "";

                requestAnimationFrame(() => {

                    card.style.opacity = "1";

                });

            } else {

                card.style.opacity = "0";

                setTimeout(() => {

                    card.style.display = "none";

                }, 200);

            }

        });

    }


    /* =====================================
       TOP DOMAIN CLICK
    ===================================== */

    window.selectDomain = function(domain) {

        const button =
            [...domainButtons]
                .find(btn =>
                    btn.dataset.domain === domain
                );

        if (button) {

            button.click();

            document
                .querySelector(".demand-panel")
                .scrollIntoView({
                    behavior: "smooth"
                });

        }

    };


    /* =====================================
       MODAL
    ===================================== */

    function openModal(content) {

        modalContent.innerHTML = content;

        modalOverlay.classList.add("show");

    }


    function closeModal() {

        modalOverlay.classList.remove("show");

    }


    modalClose.addEventListener(
        "click",
        closeModal
    );


    modalOverlay.addEventListener(
        "click",
        event => {

            if (event.target === modalOverlay) {

                closeModal();

            }

        }
    );


    document.addEventListener(
        "keydown",
        event => {

            if (event.key === "Escape") {

                closeModal();

            }

        }
    );


    /* =====================================
       SKILL MODAL
    ===================================== */

    function openSkillModal(skill) {

        openModal(`

            <h2>${escapeHTML(skill.name)}</h2>

            <p>
                This skill currently belongs to the
                <strong>${escapeHTML(skill.domain)}</strong>
                domain.
            </p>

            <div class="modal-list">

                <div>
                    <strong>Job Openings</strong>
                    <br>
                    ${skill.jobs}
                </div>

                <div>
                    <strong>Demand Level</strong>
                    <br>
                    Very High
                </div>

                <div>
                    <strong>Recommended Action</strong>
                    <br>
                    Add this skill to your learning plan
                    and check relevant career opportunities.
                </div>

            </div>

        `);

    }


    /* =====================================
       VIEW ALL SKILLS
    ===================================== */

    window.showAllSkills = function() {

        openModal(`

            <h2>All In-Demand Skills</h2>

            <p>
                Explore skills currently showing strong
                demand across industries.
            </p>

            <div class="modal-list">

                ${skills.map(skill => `

                    <div>

                        <strong>
                            ${escapeHTML(skill.name)}
                        </strong>

                        <br>

                        <small>
                            ${escapeHTML(skill.domain)}
                            ·
                            ${skill.jobs}
                            Job Openings
                        </small>

                    </div>

                `).join("")}

            </div>

        `);

    };


    /* =====================================
       GROWTH VIEW ALL
    ===================================== */

    window.showGrowthSkills = function() {

        openModal(`

            <h2>Skills by Growth</h2>

            <p>
                Fast-growing skills that can improve
                future employability.
            </p>

            <div class="modal-list">

                <div>
                    🥇 Generative AI — ↑ 125%
                </div>

                <div>
                    🥈 Data Engineering — ↑ 98%
                </div>

                <div>
                    🥉 Prompt Engineering — ↑ 85%
                </div>

                <div>
                    DevOps — ↑ 72%
                </div>

                <div>
                    Blockchain — ↑ 65%
                </div>

                <div>
                    Cloud Security — ↑ 61%
                </div>

                <div>
                    AI Product Management — ↑ 57%
                </div>

            </div>

        `);

    };


    /* =====================================
       DOMAINS VIEW ALL
    ===================================== */

    window.showDomains = function() {

        openModal(`

            <h2>Explore All Domains</h2>

            <p>
                Select a domain to discover relevant skills.
            </p>

            <div class="modal-list">

                <div onclick="selectDomain('technology')">
                    💻 Technology
                </div>

                <div onclick="selectDomain('business')">
                    💼 Business
                </div>

                <div onclick="selectDomain('design')">
                    🎨 Design
                </div>

                <div onclick="selectDomain('marketing')">
                    📢 Marketing
                </div>

                <div onclick="selectDomain('healthcare')">
                    ❤️ Healthcare
                </div>

                <div onclick="selectDomain('finance')">
                    💰 Finance
                </div>

                <div onclick="selectDomain('education')">
                    📚 Education
                </div>

                <div onclick="selectDomain('space')">
                    🚀 Space
                </div>

            </div>

        `);

    };


    /* =====================================
       FUTURE SKILLS
    ===================================== */

    window.showFutureSkills = function() {

        openModal(`

            <h2>Future Skills</h2>

            <p>
                Emerging technologies and competencies
                that may shape future employment.
            </p>

            <div class="modal-list">

                <div>
                    1. Quantum Computing — 3-5 Years
                </div>

                <div>
                    2. Space Technology — 3-5 Years
                </div>

                <div>
                    3. Sustainable Technology — 2-4 Years
                </div>

                <div>
                    4. Neural Interfaces — 4-6 Years
                </div>

                <div>
                    5. Bioinformatics — 3-5 Years
                </div>

                <div>
                    6. Robotics Engineering — 2-5 Years
                </div>

                <div>
                    7. Autonomous Systems — 3-6 Years
                </div>

            </div>

        `);

    };


    /* =====================================
       LEARNING PATHS
    ===================================== */

    window.showLearningPaths = function() {

        openModal(`

            <h2>Learning Path Recommendations</h2>

            <p>
                Choose a learning path according to
                your career goal.
            </p>

            <div class="modal-list">

                <div>
                    🚀 Full Stack Developer
                    <br>
                    9 Skills · 6 Months
                </div>

                <div>
                    📊 Data Scientist
                    <br>
                    8 Skills · 5 Months
                </div>

                <div>
                    ☁ Cloud Engineer
                    <br>
                    7 Skills · 4 Months
                </div>

                <div>
                    🤖 AI Engineer
                    <br>
                    10 Skills · 7 Months
                </div>

            </div>

        `);

    };


    /* =====================================
       SPOTLIGHT DETAILS
    ===================================== */

    document
        .getElementById("viewSkillDetails")
        .addEventListener("click", () => {

            openModal(`

                <h2>Python Programming</h2>

                <p>
                    Python is widely used for web development,
                    data science, artificial intelligence,
                    automation and scientific computing.
                </p>

                <div class="modal-list">

                    <div>
                        💼 26.4K Job Openings
                    </div>

                    <div>
                        💰 $95K Average Salary
                    </div>

                    <div>
                        👥 12.5K Active Learners
                    </div>

                    <div>
                        🔥 Very High Demand
                    </div>

                    <div>
                        ⭐ Beginner Friendly
                    </div>

                </div>

            `);

        });


    /* =====================================
       SKILL SPOTLIGHT GRAPH
    ===================================== */

    const spotlightCanvas =
        document.getElementById(
            "spotlightCanvas"
        );

    const spotlightCtx =
        spotlightCanvas.getContext("2d");


    function resizeCanvas(canvas) {

        const rect =
            canvas.getBoundingClientRect();

        const ratio =
            window.devicePixelRatio || 1;

        canvas.width =
            rect.width * ratio;

        canvas.height =
            rect.height * ratio;

        const ctx =
            canvas.getContext("2d");

        ctx.scale(ratio, ratio);

        return {
            width: rect.width,
            height: rect.height
        };

    }


    function drawSpotlightChart(
        period = 6
    ) {

        const size =
            resizeCanvas(spotlightCanvas);

        const width = size.width;
        const height = size.height;

        spotlightCtx.clearRect(
            0,
            0,
            width,
            height
        );


        let data;


        if (period === 6) {

            data = [
                43,
                48,
                55,
                63,
                72,
                86
            ];

        } else if (period === 12) {

            data = [
                30,
                34,
                39,
                43,
                48,
                53,
                58,
                65,
                70,
                76,
                83,
                91
            ];

        } else {

            data = [
                20,
                24,
                29,
                33,
                39,
                44,
                49,
                55,
                60,
                65,
                71,
                78,
                82,
                87,
                93
            ];

        }


        const padding = 10;

        const chartWidth =
            width - padding * 2;

        const chartHeight =
            height - padding * 2;


        /* GRID */

        spotlightCtx.strokeStyle =
            "rgba(255,255,255,.05)";

        spotlightCtx.lineWidth = 1;

        for (
            let y = padding;
            y < height;
            y += 25
        ) {

            spotlightCtx.beginPath();

            spotlightCtx.moveTo(
                0,
                y
            );

            spotlightCtx.lineTo(
                width,
                y
            );

            spotlightCtx.stroke();

        }


        /* POINTS */

        const points =
            data.map((value, index) => {

                const x =
                    padding +
                    (index /
                        (data.length - 1)) *
                    chartWidth;

                const y =
                    height -
                    padding -
                    ((value - 20) / 80) *
                    chartHeight;

                return {
                    x,
                    y
                };

            });


        /* GRADIENT AREA */

        const gradient =
            spotlightCtx.createLinearGradient(
                0,
                0,
                0,
                height
            );

        gradient.addColorStop(
            0,
            "rgba(140,50,255,.35)"
        );

        gradient.addColorStop(
            1,
            "rgba(140,50,255,0)"
        );


        spotlightCtx.beginPath();

        spotlightCtx.moveTo(
            points[0].x,
            height
        );

        points.forEach(point => {

            spotlightCtx.lineTo(
                point.x,
                point.y
            );

        });

        spotlightCtx.lineTo(
            points[points.length - 1].x,
            height
        );

        spotlightCtx.closePath();

        spotlightCtx.fillStyle =
            gradient;

        spotlightCtx.fill();


        /* LINE */

        spotlightCtx.beginPath();

        points.forEach((point, index) => {

            if (index === 0) {

                spotlightCtx.moveTo(
                    point.x,
                    point.y
                );

            } else {

                spotlightCtx.lineTo(
                    point.x,
                    point.y
                );

            }

        });


        spotlightCtx.strokeStyle =
            "#9b42ff";

        spotlightCtx.lineWidth = 2.5;

        spotlightCtx.lineJoin = "round";

        spotlightCtx.stroke();


        /* DOTS */

        points.forEach(point => {

            spotlightCtx.beginPath();

            spotlightCtx.arc(
                point.x,
                point.y,
                2.5,
                0,
                Math.PI * 2
            );

            spotlightCtx.fillStyle =
                "#c16cff";

            spotlightCtx.fill();

        });

    }


    document
        .getElementById("spotlightPeriod")
        .addEventListener(
            "change",
            event => {

                drawSpotlightChart(
                    Number(event.target.value)
                );

            }
        );


    /* =====================================
       MARKET GRAPH
    ===================================== */

    const marketCanvas =
        document.getElementById(
            "marketCanvas"
        );

    const marketCtx =
        marketCanvas.getContext("2d");


    function drawMarketChart(
        period = "month"
    ) {

        const size =
            resizeCanvas(marketCanvas);

        const width = size.width;
        const height = size.height;


        marketCtx.clearRect(
            0,
            0,
            width,
            height
        );


        let data;


        if (period === "month") {

            data = [
                250,
                420,
                460,
                720,
                780,
                610,
                690,
                870,
                1100,
                850,
                930,
                1200,
                1080,
                1150,
                1240
            ];

        } else if (period === "quarter") {

            data = [
                430,
                500,
                620,
                590,
                710,
                780,
                850,
                790,
                940,
                1010,
                970,
                1150
            ];

        } else {

            data = [
                350,
                390,
                430,
                470,
                510,
                560,
                610,
                680,
                720,
                780,
                850,
                910,
                980,
                1080,
                1160
            ];

        }


        const max =
            Math.max(...data) * 1.1;

        const points =
            data.map((value, index) => {

                const x =
                    (index /
                        (data.length - 1)) *
                    width;

                const y =
                    height -
                    (value / max) *
                    height;

                return {
                    x,
                    y
                };

            });


        /* GRID */

        marketCtx.strokeStyle =
            "rgba(255,255,255,.045)";

        marketCtx.lineWidth = 1;


        for (
            let y = 15;
            y < height;
            y += 25
        ) {

            marketCtx.beginPath();

            marketCtx.moveTo(
                0,
                y
            );

            marketCtx.lineTo(
                width,
                y
            );

            marketCtx.stroke();

        }


        /* AREA */

        const gradient =
            marketCtx.createLinearGradient(
                0,
                0,
                0,
                height
            );

        gradient.addColorStop(
            0,
            "rgba(141,41,255,.30)"
        );

        gradient.addColorStop(
            1,
            "rgba(141,41,255,0)"
        );


        marketCtx.beginPath();

        marketCtx.moveTo(
            points[0].x,
            height
        );

        points.forEach(point => {

            marketCtx.lineTo(
                point.x,
                point.y
            );

        });

        marketCtx.lineTo(
            points[points.length - 1].x,
            height
        );

        marketCtx.closePath();

        marketCtx.fillStyle =
            gradient;

        marketCtx.fill();


        /* LINE */

        marketCtx.beginPath();

        points.forEach((point, index) => {

            if (index === 0) {

                marketCtx.moveTo(
                    point.x,
                    point.y
                );

            } else {

                marketCtx.lineTo(
                    point.x,
                    point.y
                );

            }

        });

        marketCtx.strokeStyle =
            "#a53dff";

        marketCtx.lineWidth = 2;

        marketCtx.lineJoin = "round";

        marketCtx.stroke();


        /* ANIMATION DOT */

        let index = 0;

        const animateDot = () => {

            if (index >= points.length) {

                index = 0;

            }

            marketCtx.beginPath();

            marketCtx.arc(
                points[index].x,
                points[index].y,
                3,
                0,
                Math.PI * 2
            );

            marketCtx.fillStyle =
                "#d071ff";

            marketCtx.fill();

            index++;

            setTimeout(
                animateDot,
                450
            );

        };

        animateDot();

    }


    document
        .getElementById("marketPeriod")
        .addEventListener(
            "change",
            event => {

                drawMarketChart(
                    event.target.value
                );

            }
        );


    /* =====================================
       FUTURE SKILL CLICK
    ===================================== */

    document
        .querySelectorAll(".future-item")
        .forEach(item => {

            item.addEventListener("click", () => {

                const name =
                    item.querySelector(
                        "strong"
                    ).textContent;

                openModal(`

                    <h2>
                        ${escapeHTML(name)}
                    </h2>

                    <p>
                        This is an emerging skill with
                        potential relevance to future
                        industries and employment.
                    </p>

                    <div class="modal-list">

                        <div>
                            🚀 Future-ready technology
                        </div>

                        <div>
                            📈 Emerging market demand
                        </div>

                        <div>
                            🎯 Recommended for long-term
                            career planning
                        </div>

                    </div>

                `);

            });

        });


    /* =====================================
       DEMAND CARD CLICK
    ===================================== */

    document
        .querySelectorAll(".skill-card")
        .forEach(card => {

            card.addEventListener("click", () => {

                const title =
                    card.querySelector("h3")
                        .textContent;

                const job =
                    card.querySelector("p")
                        .textContent;

                openModal(`

                    <h2>
                        ${escapeHTML(title)}
                    </h2>

                    <p>
                        Detailed industry demand
                        information for this skill.
                    </p>

                    <div class="modal-list">

                        <div>
                            💼 ${escapeHTML(job)}
                        </div>

                        <div>
                            🔥 High Demand
                        </div>

                        <div>
                            📚 Recommended for learning
                        </div>

                        <div>
                            💼 Explore matching jobs
                        </div>

                    </div>

                `);

            });

        });


    /* =====================================
       MORE DOMAIN
    ===================================== */

    document
        .getElementById("moreDomainBtn")
        .addEventListener("click", () => {

            openModal(`

                <h2>More Domains</h2>

                <p>
                    Explore additional industry categories.
                </p>

                <div class="modal-list">

                    <div>⚙ Engineering</div>
                    <div>🔬 Science</div>
                    <div>🎮 Gaming</div>
                    <div>📱 Mobile Development</div>
                    <div>🤖 Robotics</div>
                    <div>🌐 Web3</div>
                    <div>🎬 Media & Entertainment</div>

                </div>

            `);

        });


    /* =====================================
       SKILL ANALYZER
    ===================================== */

    document
        .getElementById("skillAnalyzerBtn")
        .addEventListener("click", () => {

            window.location.href =
                "skill-analyzer.html";

        });


    /* =====================================
       EXPLORE INSIGHTS
    ===================================== */

    document
        .getElementById("exploreInsightsBtn")
        .addEventListener("click", () => {

            document
                .querySelector(".future-panel")
                .scrollIntoView({
                    behavior: "smooth"
                });

        });


    /* =====================================
       DOWNLOAD REPORT
    ===================================== */

    document
        .getElementById("downloadReportBtn")
        .addEventListener("click", () => {

            const report = `

SKILLCONNECT
INDUSTRY SKILLS REPORT

Generated: ${new Date().toLocaleDateString()}

-----------------------------------

TOP IN-DEMAND SKILLS

1. Full Stack Development
2. Data Science
3. Cloud Computing
4. AI / Machine Learning
5. Cybersecurity

-----------------------------------

FASTEST GROWING SKILLS

Generative AI - 125%
Data Engineering - 98%
Prompt Engineering - 85%
DevOps - 72%
Blockchain - 65%

-----------------------------------

FUTURE SKILLS

Quantum Computing
Space Technology
Sustainable Technology
Neural Interfaces
Bioinformatics

-----------------------------------

SkillConnect
Learn. Share. Get Hired.

            `;


            const blob =
                new Blob(
                    [report],
                    {
                        type:
                            "text/plain"
                    }
                );


            const url =
                URL.createObjectURL(blob);


            const link =
                document.createElement("a");

            link.href = url;

            link.download =
                "SkillConnect-Industry-Report.txt";

            link.click();

            URL.revokeObjectURL(url);

        });


    /* =====================================
       PROFILE FUNCTIONS
    ===================================== */

    window.openProfile = function() {

        window.location.href =
            "profile.html";

    };


    window.openSettings = function() {

        window.location.href =
            "settings.html";

    };


    window.logoutUser = function() {

        localStorage.removeItem(
            "skillshareToken"
        );

        localStorage.removeItem(
            "skillshareUser"
        );

        sessionStorage.clear();

        window.location.href =
            "login.html";

    };


    /* =====================================
       ESCAPE HTML
    ===================================== */

    function escapeHTML(value) {

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");

    }


    /* =====================================
       INITIAL CHARTS
    ===================================== */

    drawSpotlightChart(6);

    drawMarketChart("month");


    /* =====================================
       RESIZE CHARTS
    ===================================== */

    window.addEventListener(
        "resize",
        () => {

            drawSpotlightChart(
                Number(
                    document
                        .getElementById(
                            "spotlightPeriod"
                        )
                        .value
                )
            );

            drawMarketChart(
                document
                    .getElementById(
                        "marketPeriod"
                    )
                    .value
            );

        }
    );

});