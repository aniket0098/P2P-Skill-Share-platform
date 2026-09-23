/* ============================================================================
 * CareerBridge · SkillShare — PROFILE PAGE CONTROLLER (v5, full rebuild)
 * ----------------------------------------------------------------------------
 * One page, two modes, ONE aggregate request per view:
 *   own   ->  GET /api/profile/me/summary     (JWT identity, completion,
 *                                               privacy — private data)
 *   other ->  GET /api/profile/view/{user_id} (?id=<numeric user id>,
 *                                               server-enforced visibility)
 *
 * Every rendered fact comes from that payload. Nothing is invented: no fake
 * presence dot, no fabricated statistics, no placeholder content. Sections
 * handle LOADING / EMPTY / ERROR / RETRY; the page has a fatal state for
 * 404 (private or missing) and for network failures.
 *
 * Mutations reuse the existing coherent APIs only:
 *   PATCH   /api/users/me                 identity fields
 *   PUT     /api/profile/me               role-profile fields
 *   CRUD    /api/profile/education[/{id}]
 *   CRUD    /api/profile/skills[/{id}]
 *   POST    /api/requests                 connect
 *   PATCH   /api/requests/{id}/accept     accept connection
 *   POST    /api/communication/direct/{id}  open DM (privacy-enforced)
 * ==========================================================================*/
(function () {
    "use strict";

    var state = {
        mode: null,            // "own" | "other"
        targetId: null,        // numeric id of the shown profile
        viewerId: null,        // signed-in member's id
        payload: null,         // aggregate response
        relationship: null,    // viewer -> target relationship block
        allowMessages: true,   // target's DM preference from the payload
        editEducationId: null, // id being edited in the education modal
        projectFilter: null,   // active "view projects" skill filter
        lastFocus: null,       // element to restore focus to after a modal
        activity: {            // timeline pagination (bounded by the API)
            events: [],
            shown: 0,
            requestedLimit: 15
        }
    };

    var ACTIVITY_PAGE = 15;
    var ACTIVITY_MAX = 100;    /* server clamp on activity_limit */

    /* ------------------------------------------------------------------ *
     * SMALL UTILITIES (one escape helper for the whole page)
     * ------------------------------------------------------------------ */
    function $(id) { return document.getElementById(id); }

    function esc(v) {
        return String(v == null ? "" : v)
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function txt(id, value) {
        var el = typeof id === "string" ? $(id) : id;
        if (el) el.textContent = value == null ? "" : String(value);
    }

    function show(el) { if (el) el.hidden = false; }
    function hide(el) { if (el) el.hidden = true; }

    function nonEmpty(v) {
        if (Array.isArray(v)) return v.filter(function (x) {
            return x != null && String(x).trim() !== "";
        });
        if (v == null) return null;
        var s = String(v).trim();
        return s === "" ? null : s;
    }

    function uniqLower(list) {
        var seen = {}, out = [];
        (list || []).forEach(function (v) {
            var k = String(v).toLowerCase();
            if (!seen[k]) { seen[k] = true; out.push(v); }
        });
        return out;
    }

    function prefersReducedMotion() {
        try {
            return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch (e) { return false; }
    }

    function parseDate(iso) {
        if (!iso) return null;
        var d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
    }

    function fmtDate(iso, opts) {
        var d = parseDate(iso);
        if (!d) return "";
        try {
            return d.toLocaleDateString("en-GB", opts ||
                { day: "numeric", month: "short", year: "numeric" });
        } catch (e) { return d.toISOString().slice(0, 10); }
    }

    function monthYear(iso) {
        return fmtDate(iso, { month: "short", year: "numeric" });
    }

    function fmtTime(iso) {
        var d = parseDate(iso);
        if (!d) return "";
        try {
            return d.toLocaleTimeString("en-GB",
                { hour: "2-digit", minute: "2-digit" });
        } catch (e) { return ""; }
    }

    function dayLabel(iso) {
        var d = parseDate(iso);
        if (!d) return "Earlier";
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        var diff = Math.round((today - that) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Yesterday";
        if (diff > 1 && diff < 7) {
            try { return d.toLocaleDateString("en-GB", { weekday: "long" }); }
            catch (e) { /* fall through */ }
        }
        return fmtDate(d.toISOString());
    }

    function initials(name) {
        var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "?";
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function fmtSeconds(sec) {
        var s = Number(sec) || 0;
        if (s < 60) return s + "s";
        var m = Math.round(s / 60);
        if (m < 60) return m + "m";
        return Math.floor(m / 60) + "h " + (m % 60) + "m";
    }

    function titleCase(v) {
        return String(v || "").replace(/[_-]+/g, " ")
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function normalizeUrl(url) {
        var s = String(url || "").trim();
        if (!s) return null;
        if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
        return s;
    }

    function hostOf(url) {
        try { return new URL(url).host.replace(/^www\./, ""); }
        catch (e) {
            return String(url).replace(/^https?:\/\//, "").split("/")[0];
        }
    }

    /* ------------------------------------------------------------------ *
     * SECTION STATE MACHINE — loading / empty / error / content
     * ------------------------------------------------------------------ */
    function setSection(name, mode, message) {
        var body = document.querySelector('[data-section="' + name + '"]');
        if (!body) return;
        ["loading", "empty", "error", "content"].forEach(function (s) {
            var el = body.querySelector('[data-state="' + s + '"]');
            if (el) el.hidden = (s !== mode);
        });
        if (mode === "empty" && message) {
            var p = body.querySelector('[data-state="empty"] p');
            if (p) p.textContent = message;
        }
    }

    var toastTimer = null;
    function toast(message) {
        var el = $("pfToast");
        if (!el) return;
        el.textContent = message;
        el.hidden = false;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
        announce(message);
    }

    function announce(message) {
        var live = $("pfLive");
        if (live) live.textContent = message;
    }

    function errDetail(err, fallback) {
        if (err && typeof err.detail === "string" && err.detail) return err.detail;
        if (err && Array.isArray(err.detail) && err.detail[0] &&
                err.detail[0].msg) {
            return err.detail[0].msg;
        }
        if (err && err.status) return fallback + " (error " + err.status + ")";
        return fallback;
    }

    /* ------------------------------------------------------------------ *
     * LABEL + TONE MAPS (only states the backend really defines)
     * ------------------------------------------------------------------ */
    var SKILL_LEVELS = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
    var SKILL_LEVEL_LABEL = {
        beginner: "Beginner", intermediate: "Intermediate",
        advanced: "Advanced", expert: "Expert"
    };
    var SKILL_SOURCE_LABEL = {
        self_reported: "Self-reported", learning: "Coursework",
        project: "Project evidence", sandbox: "Sandbox review",
        innovation: "Innovation Lab", verified: "Assessment"
    };

    /* Project status is free-form text in the DB; tones cover the editor's
       documented workflow states and degrade to neutral otherwise. */
    function projectStatusTone(status) {
        var s = String(status || "").toLowerCase();
        if (s === "completed" || s === "published" || s === "live") {
            return "positive";
        }
        if (s === "in_progress" || s === "in progress" || s === "active" ||
                s === "planning") {
            return "accent";
        }
        return "muted";
    }

    function ideaStatusTone(status) {
        var s = String(status || "").toLowerCase();
        if (s === "published" || s === "completed" || s === "implemented") {
            return "positive";
        }
        if (["idea", "validating", "building", "review", "pitch_ready",
             "prototype"].indexOf(s) !== -1) {
            return "accent";
        }
        return "muted";
    }

    /* Industry panels: dot colour AND a written state — never colour alone. */
    var IND_STATE = {
        active:    { tone: "active",    label: "Active",    glyph: "" },
        completed: { tone: "completed", label: "Completed", glyph: "✓" },
        idle:      { tone: "idle",      label: "Inactive",  glyph: "" },
        submitted: { tone: "accent",    label: "Submitted", glyph: "" },
        reviewed:  { tone: "accent",    label: "Reviewed",  glyph: "" },
        closed:    { tone: "idle",      label: "Closed",    glyph: "" }
    };

    function indState(key) {
        return IND_STATE[String(key || "").toLowerCase()] ||
            { tone: "idle", label: titleCase(key || "Unknown"), glyph: "" };
    }

    /* ==================================================================
     * RENDER — HERO (identity)
     * ================================================================== */
    function headlineFor(p) {
        var rp = p.role_profile || {}, role = p.role;
        if (role === "student") {
            return [rp.target_job_role, rp.preferred_industry]
                .filter(Boolean).join(" · ");
        }
        if (role === "recruiter") {
            return [rp.job_title, rp.company_name].filter(Boolean).join(" · ");
        }
        if (role === "mentor") {
            return [rp.job_title, rp.company].filter(Boolean).join(" · ");
        }
        return "";
    }

    function metaItemsFor(p) {
        var rp = p.role_profile || {}, u = p.user || {}, items = [];
        function push(icon, label) {
            var v = nonEmpty(label);
            if (v) items.push({ icon: icon, text: v });
        }
        push("fa-solid fa-location-dot", u.location);
        if (p.role === "student") {
            var edu0 = (p.education && p.education[0]) || null;
            var degree = rp.degree || (edu0 && edu0.degree);
            var branch = rp.branch || (edu0 && edu0.field_of_study);
            var college = rp.college || (edu0 && edu0.institution_name);
            push("fa-solid fa-graduation-cap",
                [degree, branch].filter(Boolean).join(", "));
            push("fa-solid fa-building-columns", college);
            if (rp.graduation_year) {
                push("fa-solid fa-calendar", "Grad " + rp.graduation_year);
            }
        } else if (p.role === "recruiter") {
            push("fa-solid fa-industry", rp.industry);
            push("fa-solid fa-map-pin", rp.company_location);
        } else if (p.role === "mentor") {
            push("fa-solid fa-briefcase", rp.company);
            push("fa-solid fa-industry", rp.industry);
            if (rp.years_experience != null) {
                push("fa-solid fa-clock-rotate-left",
                    rp.years_experience + " yrs experience");
            }
        }
        return items;
    }

    function setHeroAvatar(u) {
        var av = $("heroAvatar");
        if (!av) return;
        av.textContent = "";
        var url = nonEmpty(u.avatar) || nonEmpty(u.avatar_url);
        if (!url) { av.textContent = initials(u.name); return; }
        var img = document.createElement("img");
        img.alt = "";
        img.src = url;
        img.addEventListener("error", function () {
            av.textContent = initials(u.name);
        });
        av.appendChild(img);
    }

    function renderHero(p) {
        var u = p.user || {}, rp = p.role_profile || {};
        show($("pfHero"));
        document.title = (u.name || "Profile") + " · CareerBridge — SkillShare";

        setHeroAvatar(u);
        txt("heroName", u.name || "Member");
        txt("heroPublicId", u.public_id || p.public_id || "");

        var handleEl = $("heroHandle");
        var handle = nonEmpty(u.username);
        if (handleEl) {
            if (handle) {
                handleEl.textContent = "@" + handle;
                handleEl.hidden = false;
            } else { handleEl.hidden = true; }
        }

        var rolePill = $("heroRole");
        if (rolePill) {
            rolePill.textContent = titleCase(p.role || "member");
            rolePill.hidden = false;
        }

        /* Verification chip only where the platform really stores it. */
        if (rp.verification_status === "verified") {
            txt("heroVerifiedLabel", "Company verified");
            show($("heroVerified"));
        } else { hide($("heroVerified")); }

        var headEl = $("heroHeadline");
        var headline = headlineFor(p);
        if (headEl) {
            if (headline) { headEl.textContent = headline; headEl.hidden = false; }
            else { headEl.hidden = true; }
        }

        var meta = $("heroMeta");
        if (meta) {
            meta.innerHTML = metaItemsFor(p).map(function (it) {
                return '<li class="pf-meta-item"><i class="' + it.icon +
                    '" aria-hidden="true"></i>' + esc(it.text) + "</li>";
            }).join("");
        }

        var bio = nonEmpty(u.bio) || nonEmpty(rp.bio);
        var bioEl = $("heroBio");
        if (bioEl) {
            if (bio) { bioEl.textContent = bio; bioEl.hidden = false; }
            else { bioEl.hidden = true; }
        }

        /* Presence stays hidden: the aggregate carries no presence data and
           a fabricated "online" dot would be a lie. */
        hide($("heroPresence"));
    }

    /* ==================================================================
     * RENDER — COMPLETION (own mode only) + CAREER SIGNALS
     * ================================================================== */
    var MISSING_LABEL = {
        basic_information: "Add a photo, bio and location",
        education: "Add your education",
        skills: "Add at least one skill",
        projects: "Publish a project",
        career_interests: "Set career interests",
        experience: "Log a learning activity",
        achievements: "Earn a connection or a verified skill"
    };

    function renderCompletion(p) {
        var card = $("completionCard");
        if (!card) return;
        if (state.mode !== "own" || !p.completion) { hide(card); return; }

        var pct = Math.max(0, Math.min(100, Number(p.completion.percentage) || 0));
        show(card);
        txt("completionPct", pct + "%");
        var bar = $("completionBar");
        if (bar) bar.setAttribute("aria-valuenow", String(pct));
        var fill = $("completionBarFill");
        if (fill) fill.style.width = pct + "%";

        var missing = (p.completion.missing || []).map(function (k) {
            return '<li><i class="fa-solid fa-circle-plus" aria-hidden="true"></i>' +
                esc(MISSING_LABEL[k] || titleCase(k)) + "</li>";
        }).join("");
        var missEl = $("completionMissing");
        if (missEl) {
            if (missing) {
                missEl.innerHTML = "<p>Next steps</p><ul>" + missing + "</ul>";
                missing = null;
            } else {
                missEl.innerHTML =
                    "<p><i class=\"fa-solid fa-circle-check\" aria-hidden=\"true\"></i> " +
                    "Your profile is complete.</p>";
            }
        }
    }

    function signalTiles(p) {
        var s = p.career_signals || {}, out = [];
        function add(value, label) {
            if (value == null) return;
            out.push('<li class="pf-signal"><b>' + esc(value) +
                "</b><span>" + esc(label) + "</span></li>");
        }
        add(s.projects_total, "Projects");
        add(s.projects_active, "Active now");
        add(s.innovations_total, "Innovations");
        add(s.industry_challenges_attempted, "Challenges");
        add(s.industry_challenges_completed, "Challenges solved");
        /* learning fields are null when the owner hides learning activity —
           then the tile simply does not exist (never faked with a zero). */
        if (s.learning_completed != null) {
            add(s.learning_completed, "Learning completed");
        } else { add(s.learning_total, "Learning records"); }
        add(s.connections, "Connections");
        add(s.verified_skills, "Verified skills");
        return out;
    }

    function renderSignals(p) {
        var strip = $("signalStrip"), list = $("signalList");
        if (!strip || !list) return;
        var tiles = signalTiles(p);
        if (!tiles.length) { hide(strip); return; }
        list.innerHTML = tiles.join("");
        show(strip);
    }

    /* ==================================================================
     * RENDER — SUMMARY (role-aware; never repeats hero text)
     * ================================================================== */
    function summaryRowsFor(p) {
        var rp = p.role_profile || {}, u = p.user || {}, rows = [];
        function row(label, value, isList) {
            var v = nonEmpty(value);
            if (isList) {
                if (!v || !v.length) return;
                rows.push({ label: label, value: v.join(" · ") });
            } else if (v) { rows.push({ label: label, value: String(v) }); }
        }
        if (p.role === "student") {
            var academic = [];
            if (rp.semester) academic.push("Semester " + rp.semester);
            if (rp.cgpa != null) academic.push("CGPA " + rp.cgpa);
            if (academic.length) row("Academic", academic.join(" · "));
            row("Looking for", rp.looking_for, true);
            row("Interests", u.interests, true);
        } else if (p.role === "recruiter") {
            row("Company size", rp.company_size);
            row("Hiring for", rp.hiring_for, true);
            row("Job roles", rp.job_roles, true);
            row("Internships", rp.internship_availability);
        } else if (p.role === "mentor") {
            row("Expertise", rp.expertise_areas, true);
            row("Mentorship topics", rp.mentorship_topics, true);
            row("Mentorship types", rp.mentorship_types, true);
            var avail = [];
            if ((rp.available_days || []).length) {
                avail.push(rp.available_days.join(", "));
            }
            if (rp.available_hours) avail.push(rp.available_hours);
            if (avail.length) row("Availability", avail.join(" · "));
        }
        return rows;
    }

    function renderSummary(p) {
        var grid = $("summaryGrid");
        if (!grid) return;
        var rows = summaryRowsFor(p);
        if (!rows.length) {
            setSection("summary", "empty", state.mode === "own"
                ? "Nothing to summarise yet — add your career interests with Edit profile."
                : "No public summary yet.");
            return;
        }
        grid.innerHTML = rows.map(function (r) {
            return '<div class="pf-summary-item">' +
                '<dt class="pf-summary-term">' + esc(r.label) + "</dt>" +
                '<dd class="pf-summary-desc">' + esc(r.value) + "</dd></div>";
        }).join("");
        setSection("summary", "content");
    }

    /* ==================================================================
     * RENDER — SKILLS (structured rows + honest chip groups)
     * ================================================================== */
    function skillItemHtml(s) {
        var name = s.name || "Skill";
        var level = SKILL_LEVELS[s.level] || 0;
        var pips = "", i;
        for (i = 1; i <= 4; i++) {
            pips += '<i class="' + (i <= level ? "on" : "") + '"></i>';
        }
        var levelLabel = SKILL_LEVEL_LABEL[s.level] || "Level not set";
        var meta = [esc(levelLabel)];
        if (s.is_verified) {
            meta.push('<span class="pf-verified-tag">' +
                '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> ' +
                "Verified</span>");
        }
        if (s.evidence_count) meta.push(esc(s.evidence_count) + " evidence");
        if (s.learning_count) meta.push(esc(s.learning_count) + " learning");
        if (s.project_count) meta.push(esc(s.project_count) + " projects");
        if (s.years_of_experience) meta.push(esc(s.years_of_experience) + " yrs");
        if (s.source_type && SKILL_SOURCE_LABEL[s.source_type]) {
            meta.push(esc(SKILL_SOURCE_LABEL[s.source_type]));
        }
        var actions = "";
        if (s.project_count) {
            actions += '<button type="button" class="pf-skill-link" ' +
                'data-skill-filter="' + esc(name) + '">' +
                '<i class="fa-solid fa-cube" aria-hidden="true"></i> ' +
                "View projects (" + esc(s.project_count) + ")</button>";
        }
        if (state.mode === "own" && s.id != null) {
            actions += '<button type="button" class="pf-skill-remove" ' +
                'data-skill-del="' + esc(s.id) + '" data-skill-name="' +
                esc(name) + '">Remove</button>';
        }
        return '<div class="pf-skill-item" data-verified="' +
            (s.is_verified ? "true" : "false") + '">' +
            '<div class="pf-skill-main"><h4 class="pf-skill-name">' +
            esc(name) + '</h4><span class="pf-skill-meter" role="img" ' +
            'aria-label="Level: ' + esc(levelLabel) + '">' + pips +
            "</span></div>" +
            '<p class="pf-skill-meta">' + meta.join(" · ") + "</p>" +
            (actions ? '<div class="pf-skill-actions">' + actions + "</div>" : "") +
            "</div>";
    }

    function chipGroupHtml(label, values) {
        var chips = values.map(function (v) {
            return '<span class="pf-chip">' + esc(v) + "</span>";
        }).join("");
        return '<div class="pf-skill-group">' +
            '<div class="pf-skill-group-head"><h3>' + esc(label) + "</h3>" +
            '<span class="pf-count">' + values.length + "</span></div>" +
            '<div class="pf-chip-row">' + chips + "</div></div>";
    }

    function renderSkills(p) {
        var container = $("skillGroups");
        if (!container) return;
        var skills = p.skills || [], chips = p.skill_chips || {};
        var structuredNames = {};
        skills.forEach(function (s) {
            if (s.name) structuredNames[String(s.name).toLowerCase()] = true;
        });

        var groupsHtml = [];

        /* structured skills grouped by their real category */
        var byCat = {};
        skills.forEach(function (s) {
            var cat = nonEmpty(s.category) || "Skills";
            (byCat[cat] = byCat[cat] || []).push(s);
        });
        Object.keys(byCat).forEach(function (cat) {
            var items = byCat[cat];
            groupsHtml.push('<div class="pf-skill-group">' +
                '<div class="pf-skill-group-head"><h3>' + esc(cat) + "</h3>" +
                '<span class="pf-count">' + items.length + "</span></div>" +
                '<div class="pf-skill-items">' +
                items.map(skillItemHtml).join("") + "</div></div>");
        });

        /* keyword groups from the member's own profile columns, minus names
           already represented as structured skills */
        var chipDefs = [
            { key: "top_skills", label: "Core skills" },
            { key: "programming_languages", label: "Programming" },
            { key: "technologies", label: "Tools & technologies" },
            { key: "teachable",
              label: p.role === "student" ? "Can teach" : "Skills" }
        ];
        chipDefs.forEach(function (def) {
            var values = uniqLower(nonEmpty(chips[def.key] || []))
                .filter(function (v) {
                    return !structuredNames[String(v).toLowerCase()];
                });
            if (values.length) groupsHtml.push(chipGroupHtml(def.label, values));
        });

        var isOwn = state.mode === "own";
        if (!groupsHtml.length) {
            txt("skillsEmptyMsg", isOwn
                ? "No skills yet — add skills and their evidence will fill in " +
                  "from your real activity."
                : "No public skills yet.");
            if (isOwn) { show($("addSkillEmptyBtn")); }
            else { hide($("addSkillEmptyBtn")); }
            setSection("skills", "empty");
            return;
        }
        if (isOwn) { show($("addSkillBtn")); } else { hide($("addSkillBtn")); }
        hide($("skillChipsBlock")); /* chips always render inside skillGroups */
        container.innerHTML = groupsHtml.join("");
        setSection("skills", "content");
    }

    /* ==================================================================
     * RENDER — EXPERIENCE  (real placements / role data only)
     * ================================================================== */
    var EXP_STATUS_TONE = {
        placed: "positive", employed: "positive", working: "positive",
        internship: "accent", intern: "accent",
        higher_studies: "accent", higher_study: "accent"
    };

    function expItemHtml(exp, kind) {
        var title = nonEmpty(exp.title) || "Role";
        var tone = EXP_STATUS_TONE[String(exp.status || "").toLowerCase()] ||
            "muted";
        var badge = exp.status
            ? '<span class="pf-badge" data-tone="' + tone + '">' +
              esc(titleCase(exp.status)) + "</span>"
            : '<span class="pf-badge" data-tone="accent">' +
              (kind === "current" ? "Current" : "Previous") + "</span>";
        var meta = [];
        if (exp.placement_date) {
            meta.push((kind === "current" ? "Since " : "") +
                monthYear(exp.placement_date));
        }
        if (exp.years_experience != null) {
            meta.push(exp.years_experience + " yrs");
        }
        if (exp.source && exp.source !== "placement") {
            meta.push(titleCase(exp.source));
        }
        return '<div class="pf-exp-item">' +
            '<div class="pf-exp-head">' +
            '<div><h3 class="pf-exp-title">' + esc(title) + "</h3>" +
            (exp.company ? '<p class="pf-exp-company">' +
                esc(exp.company) + "</p>" : "") + "</div>" + badge + "</div>" +
            (meta.length ? '<p class="pf-exp-meta">' +
                meta.map(function (m) { return "<span>" + esc(m) + "</span>"; })
                    .join("") + "</p>" : "") +
            "</div>";
    }

    function renderExperience(p) {
        var list = $("experienceList");
        if (!list) return;
        var exp = p.experience || {};
        var items = [];
        if (exp.current) items.push(expItemHtml(exp.current, "current"));
        (exp.previous || []).forEach(function (e) {
            items.push(expItemHtml(e, "previous"));
        });

        var note = $("experienceNote");
        if (note) {
            var srcs = (exp.sources || []).map(titleCase);
            if (srcs.length) {
                note.textContent = "Recorded from: " + srcs.join(", ") +
                    ". Package details and internal notes never appear here.";
                note.hidden = false;
            } else { note.hidden = true; }
        }

        if (!items.length) {
            setSection("experience", "empty", state.mode === "own"
                ? "No work experience yet — placements and role details appear " +
                  "here automatically."
                : "No public experience listed.");
            return;
        }
        list.innerHTML = items.join("");
        setSection("experience", "content");
    }

    /* ==================================================================
     * RENDER — EDUCATION (rows + owner-only edit/delete)
     * ================================================================== */
    function fmtEduDate(value) {
        var s = nonEmpty(value);
        if (!s) return "";
        if (/^\d{4}$/.test(s)) return s;
        var d = parseDate(s);
        return d ? monthYear(s) : s;
    }

    function eduItemHtml(row) {
        var title = [row.degree, row.field_of_study].filter(Boolean).join(", ") ||
            nonEmpty(row.education_level) || "Education";
        var dates = [fmtEduDate(row.start_date), fmtEduDate(row.end_date)]
            .filter(Boolean).join(" – ");
        var badge = row.currently_studying
            ? '<span class="pf-badge" data-tone="accent">' +
              "Currently studying</span>"
            : "";
        var meta = [];
        if (dates) {
            meta.push(dates + (row.currently_studying ? " – present" : ""));
        }
        if (row.cgpa != null) meta.push("CGPA " + row.cgpa);
        if (row.grade) meta.push("Grade " + row.grade);
        if (row.percentage != null) meta.push(row.percentage + "%");
        if (row.location) meta.push(row.location);
        var actions = "";
        if (state.mode === "own" && row.id != null) {
            actions = '<div class="pf-edu-actions">' +
                '<button type="button" class="pf-skill-link" data-edu-edit="' +
                esc(row.id) + '">Edit</button>' +
                '<button type="button" class="pf-skill-remove" data-edu-del="' +
                esc(row.id) + '" data-edu-name="' + esc(title) +
                '">Delete</button></div>';
        }
        return '<div class="pf-edu-item" id="edu-' + esc(row.id) + '">' +
            '<div class="pf-edu-head"><div><h3 class="pf-edu-title">' +
            esc(title) + "</h3>" +
            (row.institution_name ? '<p class="pf-edu-school">' +
                esc(row.institution_name) + "</p>" : "") + "</div>" + badge +
            "</div>" +
            (meta.length ? '<p class="pf-edu-meta">' +
                meta.map(function (m) { return "<span>" + esc(m) + "</span>"; })
                    .join("") + "</p>" : "") +
            (row.description ? '<p class="pf-edu-desc">' +
                esc(row.description) + "</p>" : "") + actions + "</div>";
    }

    function renderEducation(p) {
        var list = $("educationList");
        if (!list) return;
        var rows = p.education || [];
        var isOwn = state.mode === "own";
        if (isOwn) { show($("addEducationBtn")); }
        else { hide($("addEducationBtn")); }

        if (!rows.length) {
            var vis = (p.visibility || {}).education;
            txt("educationEmptyMsg", isOwn
                ? "No education added yet."
                : (vis === false
                    ? "This member keeps their education private."
                    : "No public education available."));
            if (isOwn) { show($("addEducationEmptyBtn")); }
            else { hide($("addEducationEmptyBtn")); }
            setSection("education", "empty");
            return;
        }
        if (isOwn) { show($("addEducationEmptyBtn")); }
        list.innerHTML = rows.map(eduItemHtml).join("");
        setSection("education", "content");
    }

    /* ==================================================================
     * RENDER — PROJECT PORTFOLIO
     * ================================================================== */
    function projectCardHtml(p) {
        var title = p.title || "Untitled project";
        var statusLabel = titleCase(p.status || "in_progress");
        var tone = projectStatusTone(p.status);
        var media;
        if (nonEmpty(p.image_url)) {
            media = '<div class="pf-proj-media"><img src="' + esc(p.image_url) +
                '" alt="" loading="lazy"><span class="pf-proj-status">' +
                '<span class="pf-badge" data-tone="' + tone + '">' +
                esc(statusLabel) + "</span></span></div>";
        } else {
            media = '<div class="pf-proj-media">' +
                '<div class="pf-proj-initials" aria-hidden="true">' +
                esc(initials(title)) + '</div><span class="pf-proj-status">' +
                '<span class="pf-badge" data-tone="' + tone + '">' +
                esc(statusLabel) + "</span></span></div>";
        }
        var tech = nonEmpty(p.technologies || []).slice(0, 5);
        var extra = (p.technologies || []).length - tech.length;
        var chips = tech.map(function (t) {
            return '<span class="pf-chip">' + esc(t) + "</span>";
        }).join("");
        if (extra > 0) {
            chips += '<span class="pf-chip"><small>+' + extra + "</small></span>";
        }
        var links = "";
        var gh = normalizeUrl(p.github_url);
        var demo = normalizeUrl(p.demo_url);
        if (gh) {
            links += '<a href="' + esc(gh) + '" target="_blank" ' +
                'rel="noopener noreferrer">GitHub</a>';
        }
        if (demo) {
            links += '<a href="' + esc(demo) + '" target="_blank" ' +
                'rel="noopener noreferrer">Live demo</a>';
        }
        if (p.evidence_count) {
            links += '<span class="pf-proj-stats">' +
                '<i class="fa-solid fa-layer-group" aria-hidden="true"></i> ' +
                esc(p.evidence_count) + " evidence</span>";
        }
        return '<article class="pf-proj-card">' + media +
            '<div class="pf-proj-body"><h3 class="pf-proj-title">' +
            esc(title) + "</h3>" +
            (p.description ? '<p class="pf-proj-desc">' +
                esc(p.description) + "</p>" : "") +
            (p.owner && p.owner.name ? '<p class="pf-proj-owner">by ' +
                esc(p.owner.name) + "</p>" : "") +
            (chips ? '<div class="pf-chip-row">' + chips + "</div>" : "") +
            (links ? '<div class="pf-proj-foot">' + links + "</div>" : "") +
            "</div></article>";
    }

    function renderProjects(p) {
        var grid = $("projectGrid");
        if (!grid) return;
        var rows = p.projects || [];
        var total = p.project_total != null ? p.project_total : rows.length;
        var countEl = $("projectCount");
        if (countEl) {
            countEl.textContent = String(total);
            if (total > 0) { show(countEl); } else { hide(countEl); }
        }
        var link = $("viewAllProjects");
        if (link) { if (total > 0) { show(link); } else { hide(link); } }

        if (!rows.length) {
            txt("projectsEmptyMsg", state.mode === "own"
                ? "No projects yet — publish one and it becomes real evidence here."
                : "No public projects yet.");
            var action = $("projectsEmptyAction");
            if (action) {
                if (state.mode === "own") { show(action); } else { hide(action); }
            }
            setSection("projects", "empty");
            return;
        }
        grid.innerHTML = rows.map(projectCardHtml).join("");
        setSection("projects", "content");
    }

    /* ==================================================================
     * RENDER — INNOVATION (owned ideas + collaborations)
     * ================================================================== */
    function ideaCardHtml(it, kind) {
        var title = it.title || "Untitled idea";
        var statusLabel = titleCase(it.status || "");
        var tone = ideaStatusTone(it.status);
        var desc = nonEmpty(it.solution_summary) || nonEmpty(it.description) || "";
        var problem = nonEmpty(it.problem_title) || nonEmpty(it.problem_statement);
        var skills = nonEmpty(it.skills || []).slice(0, 6);
        var ms = it.milestones || {};
        var foot = [];
        if (ms.total) {
            foot.push('<span class="pf-proj-stats">' +
                '<i class="fa-solid fa-flag-checkered" aria-hidden="true"></i> ' +
                ms.done + " / " + ms.total + " milestones</span>");
        }
        var linked = (it.linked_projects || [])[0];
        if (linked && linked.title) {
            foot.push('<span class="pf-proj-stats">' +
                '<i class="fa-solid fa-cube" aria-hidden="true"></i> ' +
                esc(linked.title) + "</span>");
        }
        var faces = (it.collaborators || []).slice(0, 5).map(function (m) {
            return '<span class="pf-face" title="' + esc(m.name) + '">' +
                esc(initials(m.name)) + "</span>";
        }).join("");
        if (faces) {
            foot.push('<span class="pf-collab-faces">' + faces +
                (it.collaborator_count > 5
                    ? '<span class="pf-face">+' +
                      (it.collaborator_count - 5) + "</span>" : "") +
                "</span>");
        }
        var labLink = (state.mode === "own" && it.role !== "collaborator")
            ? '<a href="innovation-lab.html">Open in Innovation Lab</a>' : "";
        return '<article class="pf-idea-card">' +
            '<div class="pf-idea-top"><span class="pf-badge" data-tone="' +
            tone + '">' + esc(statusLabel) + "</span>" +
            (kind === "collaborator"
                ? '<span class="pf-badge" data-tone="muted">Collaborator</span>'
                : "") + "</div>" +
            '<h3 class="pf-idea-title">' + esc(title) + "</h3>" +
            (desc ? '<p class="pf-idea-desc">' + esc(desc) + "</p>" : "") +
            (problem ? '<p class="pf-idea-problem"><strong>Problem:</strong> ' +
                esc(problem) + "</p>" : "") +
            (skills.length ? '<div class="pf-chip-row">' +
                skills.map(function (s) {
                    return '<span class="pf-chip">' + esc(s) + "</span>";
                }).join("") + "</div>" : "") +
            ((foot.length || labLink) ? '<div class="pf-idea-foot">' +
                foot.join("") + labLink + "</div>" : "") +
            "</article>";
    }

    function renderInnovation(p) {
        var grid = $("ideaGrid"), collabGrid = $("collabGrid");
        if (!grid) return;
        var inn = p.innovation || {};
        var ideas = inn.ideas || [], collabs = inn.collaborations || [];
        var emptyEl = $("innovationEmptyAction");
        var isOwn = state.mode === "own";

        if (!ideas.length && !collabs.length) {
            txt("innovationEmptyMsg", isOwn
                ? "No ideas yet — start one in the Innovation Lab and it will " +
                  "appear here."
                : "No public innovations yet.");
            if (emptyEl) { if (isOwn) { show(emptyEl); } else { hide(emptyEl); } }
            setSection("innovation", "empty");
            return;
        }
        if (emptyEl) { hide(emptyEl); }
        grid.innerHTML = ideas.map(function (i) {
            return ideaCardHtml(i, "owner");
        }).join("");
        if (collabGrid) {
            collabGrid.innerHTML = collabs.map(function (i) {
                return ideaCardHtml(i, "collaborator");
            }).join("");
        }
        if ($("collabBlock")) {
            if (collabs.length) { show($("collabBlock")); }
            else { hide($("collabBlock")); }
        }
        setSection("innovation", "content");
    }

    /* ==================================================================
     * RENDER — INDUSTRY PROBLEM-SOLVING (problems + challenges tabs)
     * ================================================================== */
    var IND_ROLE_LABEL = {
        posted_and_working: "Posted & working on it",
        posted: "Posted this problem",
        working: "Working on a solution"
    };

    function problemItemHtml(row) {
        var st = indState(row.state);
        var meta = [];
        if (row.category) meta.push(row.category);
        if (row.difficulty) meta.push(titleCase(row.difficulty));
        if (row.source_label) meta.push(row.source_label);
        if (row.created_at) meta.push(monthYear(row.created_at));
        var links = [];
        var roleLabel = IND_ROLE_LABEL[row.role];
        if (roleLabel) {
            links.push('<span class="pf-ind-linked">' + esc(roleLabel) + "</span>");
        }
        (row.ideas || []).slice(0, 3).forEach(function (idea) {
            links.push('<span class="pf-ind-linked">Idea: ' + esc(idea.title) +
                " (" + esc(titleCase(idea.status || "")) + ")</span>");
        });
        return '<li class="pf-ind-item">' +
            '<span class="pf-ind-dot" data-state="' + st.tone +
            '" aria-hidden="true"></span>' +
            '<div class="pf-ind-main">' +
            '<div class="pf-ind-head"><h3 class="pf-ind-title">' +
            esc(row.title || "Problem") + "</h3>" +
            '<span class="pf-ind-state" data-state="' + st.tone + '">' +
            esc(st.label) + "</span></div>" +
            (meta.length ? '<p class="pf-ind-meta">' +
                meta.map(function (m) { return "<span>" + esc(m) + "</span>"; })
                    .join("") + "</p>" : "") +
            (links.length ? '<p class="pf-ind-links">' + links.join("") + "</p>"
                : "") +
            "</div></li>";
    }

    function challengeItemHtml(row) {
        var st = indState(row.state);
        var meta = [];
        if (row.industry) meta.push(row.industry);
        if (row.domain) meta.push(row.domain);
        if (row.company_name) meta.push(row.company_name);
        if (row.state === "completed" && row.completed_at) {
            meta.push("Completed " + monthYear(row.completed_at));
        } else if (row.started_at) {
            meta.push("Started " + monthYear(row.started_at));
        }
        if (row.attempt) meta.push("Attempt " + row.attempt);
        if (row.score != null) meta.push("Score " + row.score);
        var links = [];
        if (row.submission_status) {
            links.push('<span class="pf-ind-linked">Submission: ' +
                esc(titleCase(row.submission_status)) + "</span>");
        }
        if (row.is_demo) {
            links.push('<span class="pf-ind-linked">Demo challenge</span>');
        }
        (row.skills || []).slice(0, 4).forEach(function (s) {
            if (s && s.skill_name) {
                links.push('<span class="pf-ind-linked">' +
                    esc(s.skill_name) + "</span>");
            }
        });
        return '<li class="pf-ind-item">' +
            '<span class="pf-ind-dot" data-state="' + st.tone +
            '" aria-hidden="true"></span>' +
            '<div class="pf-ind-main">' +
            '<div class="pf-ind-head"><h3 class="pf-ind-title">' +
            esc(row.title || "Challenge") + "</h3>" +
            '<span class="pf-ind-state" data-state="' + st.tone + '">' +
            esc(st.glyph ? st.glyph + " " + st.label : st.label) +
            "</span></div>" +
            (meta.length ? '<p class="pf-ind-meta">' +
                meta.map(function (m) { return "<span>" + esc(m) + "</span>"; })
                    .join("") + "</p>" : "") +
            (links.length ? '<p class="pf-ind-links">' + links.join("") + "</p>"
                : "") +
            "</div></li>";
    }

    function renderIndustry(p) {
        var ind = p.industry || {};
        var problems = ind.problems || [], challenges = ind.challenges || [];
        var pList = $("problemList"), cList = $("challengeList");
        var isOwn = state.mode === "own";

        if (pList) {
            pList.innerHTML = problems.map(problemItemHtml).join("");
        }
        var pEmpty = $("problemsEmpty");
        if (pEmpty) {
            pEmpty.hidden = problems.length > 0;
            var pMsg = pEmpty.querySelector("p");
            if (pMsg && !problems.length) {
                pMsg.textContent = isOwn
                    ? "You have not posted or joined a Problem Hub problem yet."
                    : "No public industry problems yet.";
            }
        }
        if (cList) {
            cList.innerHTML = challenges.map(challengeItemHtml).join("");
        }
        var cEmpty = $("challengesEmpty");
        if (cEmpty) {
            cEmpty.hidden = challenges.length > 0;
            var cMsg = cEmpty.querySelector("p");
            if (cMsg && !challenges.length) {
                cMsg.textContent = isOwn
                    ? "No industry challenges attempted yet — try one in the " +
                      "Sandbox."
                    : "No public industry challenges yet.";
            }
        }
        setSection("industry", "content");
    }

    /* ==================================================================
     * RENDER — LEARNING & DEVELOPMENT
     * ================================================================== */
    var LEARN_STATUS_LABEL = {
        started: "Started", in_progress: "In progress", completed: "Completed"
    };

    function learnItemHtml(row) {
        var pct = Math.max(0, Math.min(100, Number(row.progress) || 0));
        var skill = nonEmpty(row.skill);
        var res = nonEmpty(row.resource) || "Course";
        var url = normalizeUrl(row.resource_url);
        var title = url
            ? '<a href="' + esc(url) + '" target="_blank" ' +
              'rel="noopener noreferrer">' + esc(res) + "</a>"
            : esc(res);
        var metaBits = [];
        metaBits.push(LEARN_STATUS_LABEL[row.status] ||
            titleCase(row.status || ""));
        if (row.time_spent_seconds) {
            metaBits.push("Time " + fmtSeconds(row.time_spent_seconds));
        }
        if (row.last_accessed) {
            metaBits.push("Last " + fmtDate(row.last_accessed));
        }
        return '<div class="pf-learn-item">' +
            '<div class="pf-learn-head"><strong>' + title + "</strong>" +
            (skill ? "<span>" + esc(skill) + "</span>" : "") + "</div>" +
            '<div class="pf-learn-bar" role="progressbar" aria-valuemin="0" ' +
            'aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="' +
            esc(res) + ' progress"><span style="width:' + pct +
            '%"></span></div>' +
            '<p class="pf-learn-meta">' + esc(pct) + "% · " +
            metaBits.map(esc).join(" · ") + "</p></div>";
    }

    function renderLearning(p) {
        var learn = p.learning || {};
        var isOwn = state.mode === "own";
        var contentEl = document.querySelector(
            '[data-section="learning"] [data-state="content"]');
        var linkEl = $("learningLink");
        var actionEl = $("learningEmptyAction");

        if (linkEl) { if (isOwn) { show(linkEl); } else { hide(linkEl); } }

        if (learn.visible === false) {
            txt("learningEmptyMsg",
                learn.message ||
                "This member keeps their learning activity private.");
            if (actionEl) { hide(actionEl); }
            setSection("learning", "empty");
            return;
        }
        if (!learn.has_activity) {
            txt("learningEmptyMsg", isOwn
                ? (learn.message ||
                   "Start learning from Explore Skills to build your activity.")
                : "No public learning activity yet.");
            if (actionEl) { if (isOwn) { show(actionEl); } else { hide(actionEl); } }
            setSection("learning", "empty");
            return;
        }
        if (contentEl) { contentEl.hidden = false; }
        if (actionEl) { hide(actionEl); }

        var recent = learn.recent_learning || [];
        var skills = learn.skills || [];
        var active = recent.filter(function (r) { return r.status !== "completed"; });
        var done = recent.filter(function (r) { return r.status === "completed"; });

        var sig = p.career_signals || {};
        var tiles = [
            { v: (Number(learn.overall_progress) || 0) + "%", l: "Overall progress" },
            { v: skills.length, l: "Skills in learning" },
            { v: (sig.learning_completed != null
                    ? sig.learning_completed : done.length),
              l: "Completed records" }
        ];
        var totalTime = recent.reduce(function (sum, r) {
            return sum + (Number(r.time_spent_seconds) || 0);
        }, 0);
        if (totalTime > 0) tiles.push({ v: fmtSeconds(totalTime), l: "Time invested" });
        var statsEl = $("learningStats");
        if (statsEl) {
            statsEl.innerHTML = tiles.map(function (t) {
                return "<li><b>" + esc(t.v) + "</b><span>" +
                    esc(t.l) + "</span></li>";
            }).join("");
        }

        var actEl = $("learningActive"), doneEl = $("learningCompleted");
        if (actEl) { actEl.innerHTML = active.map(learnItemHtml).join(""); }
        if (doneEl) { doneEl.innerHTML = done.map(learnItemHtml).join(""); }
        var actEmpty = $("learningActiveEmpty");
        if (actEmpty) { actEmpty.hidden = active.length > 0; }
        var doneEmpty = $("learningCompletedEmpty");
        if (doneEmpty) { doneEmpty.hidden = done.length > 0; }

        var chipsWrap = $("learningSkillChips");
        if (chipsWrap) {
            chipsWrap.innerHTML = skills.slice(0, 16).map(function (s) {
                var pct = Math.max(0, Math.min(100, Number(s.progress) || 0));
                return '<span class="pf-chip">' + esc(s.name || "Skill") +
                    " <small>" + pct + "%</small></span>";
            }).join("");
        }
        if ($("learningSkillsBlock")) {
            if (skills.length) { show($("learningSkillsBlock")); }
            else { hide($("learningSkillsBlock")); }
        }
        setSection("learning", "content");
    }

    /* ==================================================================
     * RENDER — ACTIVITY TIMELINE (real events; bounded pagination)
     * ================================================================== */
    var ACTIVITY_ICONS = {
        profile_completed: "fa-id-badge",
        skill_analyzed: "fa-wand-magic-sparkles",
        learning_started: "fa-book-open-reader",
        learning_completed: "fa-circle-check",
        project_created: "fa-cube",
        project_completed: "fa-circle-check",
        sandbox_started: "fa-flask",
        sandbox_submitted: "fa-paper-plane",
        sandbox_evaluated: "fa-clipboard-check",
        innovation_created: "fa-lightbulb",
        innovation_milestone: "fa-flag-checkered",
        career_goal_set: "fa-bullseye",
        community: "fa-users",
        teaching: "fa-chalkboard-user",
        project: "fa-cube",
        skill: "fa-layer-group",
        connection: "fa-user-plus",
        message: "fa-comment",
        activity: "fa-circle-dot"
    };
    var ACTIVITY_DONE = {
        profile_completed: true, learning_completed: true,
        project_completed: true, sandbox_evaluated: true,
        innovation_milestone: true
    };
    var ACTIVITY_ACTIVE = {
        learning_started: true, sandbox_started: true, project_created: true,
        innovation_created: true, skill_analyzed: true
    };

    function eventTone(type) {
        var t = String(type || "").toLowerCase();
        if (ACTIVITY_DONE[t]) return "done";
        if (ACTIVITY_ACTIVE[t]) return "active";
        if (t === "community" || t === "message") return "muted";
        return "accent";
    }

    function activityItemHtml(ev) {
        var type = String(ev.event_type || "activity").toLowerCase();
        var icon = ACTIVITY_ICONS[type] || "fa-circle-dot";
        var title = nonEmpty(ev.title) || titleCase(type);
        var badge = ACTIVITY_DONE[type]
            ? '<span class="pf-badge" data-tone="positive">Completed</span>'
            : ACTIVITY_ACTIVE[type]
                ? '<span class="pf-badge" data-tone="accent">Started</span>'
                : "";
        return '<li class="pf-tl-item">' +
            '<span class="pf-tl-marker" data-tone="' + eventTone(type) +
            '" aria-hidden="true"><i class="fa-solid ' + icon + '"></i></span>' +
            '<div class="pf-tl-body">' +
            '<div class="pf-tl-head"><h3 class="pf-tl-title">' +
            esc(title) + "</h3>" + badge + "</div>" +
            (nonEmpty(ev.description)
                ? '<p class="pf-tl-desc">' + esc(ev.description) + "</p>" : "") +
            '<span class="pf-tl-time">' + esc(dayLabel(ev.created_at)) +
            " · " + esc(fmtTime(ev.created_at)) + " · " +
            esc(titleCase(type)) + "</span></div></li>";
    }

    function paintActivity() {
        var ol = $("activityTimeline");
        if (!ol) return;
        var events = state.activity.events;
        var show = Math.min(state.activity.shown, events.length);
        var html = "", lastDay = null, i;
        for (i = 0; i < show; i++) {
            var day = dayLabel(events[i].created_at);
            if (day !== lastDay) {
                html += '<li class="pf-tl-group" aria-hidden="true">' +
                    esc(day) + "</li>";
                lastDay = day;
            }
            html += activityItemHtml(events[i]);
        }
        ol.innerHTML = html;
        var more = $("activityMoreBtn");
        if (more) {
            var moreAvailable = show < events.length ||
                events.length >= state.activity.requestedLimit;
            if (show < events.length) {
                more.textContent = "Load more activity (" +
                    (events.length - show) + " ready)";
                show(more);
            } else if (moreAvailable &&
                       state.activity.requestedLimit < ACTIVITY_MAX) {
                more.textContent = "Load more activity";
                show(more);
            } else {
                hide(more);
            }
        }
    }

    function renderActivity(p) {
        var tl = p.timeline || {};
        var originEl = $("activityOrigin");
        if (!tl.visible) {
            txt("activityEmptyMsg", state.mode === "own"
                ? "No activity recorded yet."
                : "This member keeps their activity private.");
            setSection("activity", "empty");
            return;
        }
        var events = tl.events || [];
        if (originEl) {
            originEl.textContent = tl.origin === "career_events"
                ? "Source: cross-domain career event log"
                : "Source: recorded platform activity";
        }
        if (!events.length) {
            txt("activityEmptyMsg", state.mode === "own"
                ? "No activity recorded yet — real events appear here as you " +
                  "work on the platform."
                : "No public activity recorded yet.");
            setSection("activity", "empty");
            return;
        }
        state.activity.events = events;
        state.activity.shown = Math.min(ACTIVITY_PAGE, events.length);
        paintActivity();
        setSection("activity", "content");
    }

    /* ==================================================================
     * RAIL — CONNECTIONS, LINKS, VISIBILITY, MEMBERSHIP
     * ================================================================== */
    function connItemHtml(u) {
        var name = nonEmpty(u.name) || "Member";
        var av = nonEmpty(u.avatar);
        var avatar = av
            ? '<span class="pf-conn-avatar"><img src="' + esc(av) +
              '" alt="" loading="lazy"></span>'
            : '<span class="pf-conn-avatar" aria-hidden="true">' +
              esc(initials(name)) + "</span>";
        var sub = nonEmpty(u.username) ? "@" + u.username
            : (nonEmpty(u.location) || "");
        return '<li><a class="pf-conn-item" href="profile.html?id=' +
            encodeURIComponent(u.id) + '">' + avatar +
            '<span class="pf-conn-name"><strong>' + esc(name) + "</strong>" +
            (sub ? "<small>" + esc(sub) + "</small>" : "") +
            "</span></a></li>";
    }

    function renderConnections(p) {
        var card = $("connectionCard");
        if (!card) return;
        var conn = p.connections || {};
        var isOwn = state.mode === "own";
        show(card);
        var manage = $("connectionsManageLink");
        if (manage) { if (isOwn) { show(manage); } else { hide(manage); } }

        var countEl = $("connectionCount"), mutualEl = $("connectionMutual");
        var listEl = $("connectionList"), emptyEl = $("connectionEmpty");
        var privEl = $("connectionPrivate");

        if (conn.visible === false) {
            if (countEl) { hide(countEl); }
            if (mutualEl) { hide(mutualEl); }
            if (listEl) { listEl.innerHTML = ""; }
            if (emptyEl) { hide(emptyEl); }
            if (privEl) { show(privEl); }
            setSection("connections", "content");
            return;
        }
        if (privEl) { hide(privEl); }
        var count = conn.count != null ? conn.count : 0;
        if (countEl) {
            countEl.innerHTML = esc(count) +
                " <span>" + (count === 1 ? "connection" : "connections") +
                "</span>";
            show(countEl);
        }
        if (mutualEl) {
            if (conn.mutual_count != null && conn.mutual_count > 0) {
                mutualEl.textContent = conn.mutual_count +
                    (conn.mutual_count === 1
                        ? " mutual connection with you"
                        : " mutual connections with you");
                show(mutualEl);
            } else { hide(mutualEl); }
        }
        var sample = conn.sample || [];
        if (listEl) {
            listEl.innerHTML = sample.map(connItemHtml).join("");
        }
        if (emptyEl) {
            if (!count) {
                emptyEl.textContent = isOwn
                    ? "No connections yet — connect with members from Find talent."
                    : "No connections yet.";
                show(emptyEl);
            } else { hide(emptyEl); }
        }
        setSection("connections", "content");
    }

    function linkRowHtml(href, icon, label) {
        return '<li><a href="' + esc(href) + '" target="_blank" ' +
            'rel="noopener noreferrer"><i class="' + icon +
            '" aria-hidden="true"></i><span>' + esc(label) + "</span></a></li>";
    }

    function renderLinks(p) {
        var card = $("linksCard"), list = $("linkList");
        if (!card || !list) return;
        var u = p.user || {}, rp = p.role_profile || {}, rows = [];
        var site = normalizeUrl(u.website);
        if (site) {
            rows.push(linkRowHtml(site, "fa-solid fa-globe", hostOf(site)));
        }
        var companySite = normalizeUrl(rp.company_website);
        if (companySite) {
            rows.push(linkRowHtml(companySite, "fa-solid fa-building",
                rp.company_name ? rp.company_name + " website" : "Company website"));
        }
        if (rp.linkedin_url) {
            rows.push(linkRowHtml(rp.linkedin_url, "fa-brands fa-linkedin",
                "LinkedIn"));
        }
        if (rp.github_url) {
            rows.push(linkRowHtml(rp.github_url, "fa-brands fa-github",
                "GitHub"));
        }
        if (rp.portfolio_url) {
            rows.push(linkRowHtml(rp.portfolio_url, "fa-solid fa-briefcase",
                "Portfolio"));
        }
        if (nonEmpty(u.email)) {
            rows.push('<li><a href="mailto:' + esc(u.email) +
                '"><i class="fa-solid fa-envelope" aria-hidden="true"></i>' +
                "<span>" + esc(u.email) + "</span></a></li>");
        }
        if (nonEmpty(u.phone)) {
            rows.push('<li><a href="tel:' + esc(u.phone) +
                '"><i class="fa-solid fa-phone" aria-hidden="true"></i>' +
                "<span>" + esc(u.phone) + "</span></a></li>");
        }
        list.innerHTML = rows.join("");
        var emptyEl = $("linksEmpty");
        if (emptyEl) { emptyEl.hidden = rows.length > 0; }

        var input = $("profileUrlInput");
        if (input) {
            var url = window.location.origin + window.location.pathname;
            if (state.mode === "other" && state.targetId != null) {
                url += "?id=" + encodeURIComponent(state.targetId);
            }
            input.value = url;
        }
        show(card);
    }

    var PRIVACY_FIELDS = [
        { key: "location", label: "Location" },
        { key: "education", label: "Education" },
        { key: "cgpa", label: "Grades / CGPA" },
        { key: "email", label: "Email address" },
        { key: "phone", label: "Phone number" },
        { key: "activity", label: "Activity timeline" },
        { key: "learning", label: "Learning activity" },
        { key: "connections", label: "Connections" }
    ];

    function privacyRowHtml(label, on, onText, offText) {
        return "<li><span>" + esc(label) + '</span><strong data-on="' +
            (on ? "true" : "false") + '">' + esc(on ? onText : offText) +
            "</strong></li>";
    }

    function renderPrivacy(p) {
        var card = $("privacyCard"), list = $("privacyList");
        if (!card || !list) return;
        var rows = [], isOwn = state.mode === "own";
        if (isOwn) {
            var priv = p.privacy || {};
            var fv = priv.field_visibility || {};
            rows.push(privacyRowHtml("Profile listing",
                priv.profile_visibility !== "private",
                "Listed publicly", "Hidden from listings"));
            rows.push(privacyRowHtml("Direct messages",
                priv.allow_messages !== false,
                "Members can message you", "Messages are restricted"));
            PRIVACY_FIELDS.forEach(function (f) {
                var on = fv[f.key] !== false;
                rows.push(privacyRowHtml(f.label, on,
                    "Visible", "Hidden"));
            });
        } else {
            var vis = p.visibility || {};
            PRIVACY_FIELDS.forEach(function (f) {
                if (typeof vis[f.key] === "boolean") {
                    rows.push(privacyRowHtml(f.label, vis[f.key],
                        "Shared", "Not shared"));
                }
            });
            rows.push(privacyRowHtml("Direct messages",
                p.allow_messages !== false,
                "Allowed", "Not allowed"));
        }
        var manageLink = $("privacyManageLink");
        if (manageLink) { if (isOwn) { show(manageLink); } else { hide(manageLink); } }
        var heading = card.querySelector(".pf-card-title");
        if (heading) {
            heading.textContent = isOwn ? "Your visibility settings"
                : "Shared by this member";
        }
        if (!rows.length) { hide(card); return; }
        list.innerHTML = rows.join("");
        show(card);
    }

    function renderMember(p) {
        var card = $("memberCard"), list = $("memberList");
        if (!card || !list) return;
        var rows = [];
        if (p.created_at) {
            rows.push(privacyRowHtml("Joined", true,
                monthYear(p.created_at), "Unknown"));
        }
        var days = (p.career_signals || {}).days_member;
        if (days != null) {
            rows.push(privacyRowHtml("Time on the platform", true,
                days + (days === 1 ? " day" : " days"), "Unknown"));
        }
        if (!rows.length) { hide(card); return; }
        list.innerHTML = rows.join("");
        show(card);
    }

    /* ==================================================================
     * APPLY PAYLOAD — one payload drives the whole page
     * ================================================================== */
    function applyPayload(p) {
        state.payload = p;
        state.mode = p.mode === "own" ? "own" : "other";
        state.targetId = (p.user && p.user.id != null) ? p.user.id : state.targetId;
        state.relationship = p.relationship || null;
        state.allowMessages = p.allow_messages !== false;

        var page = $("profilePage");
        if (page) { page.setAttribute("data-mode", state.mode); }
        hide($("profileFatal"));

        renderHero(p);
        renderCompletion(p);
        renderSignals(p);
        renderSummary(p);
        renderSkills(p);
        renderExperience(p);
        renderEducation(p);
        renderProjects(p);
        renderInnovation(p);
        renderIndustry(p);
        renderLearning(p);
        renderActivity(p);
        renderConnections(p);
        renderLinks(p);
        renderPrivacy(p);
        renderMember(p);
        renderActions(p);

        show($("pfSubnav"));
        revealTimeline(true);
    }

    /* ==================================================================
     * HERO ACTIONS (own chrome vs viewer relationship state)
     * ================================================================== */
    function renderActions(p) {
        var isOwn = state.mode === "own";
        var connectBtn = $("connectBtn"), messageBtn = $("messageBtn");
        show($("shareBtn"));

        if (isOwn) {
            show($("editProfileBtn"));
            show($("privacyBtn"));
            if (connectBtn) { hide(connectBtn); }
            if (messageBtn) { hide(messageBtn); }
            return;
        }
        hide($("editProfileBtn"));
        hide($("privacyBtn"));

        var rel = p.relationship || {};
        var kind = rel.relationship || "none";
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.className = "pf-btn pf-btn-primary";
            if (kind === "connected") {
                hide(connectBtn);
            } else if (kind === "pending" && rel.direction === "received") {
                connectBtn.textContent = "Accept request";
                show(connectBtn);
            } else if (kind === "pending") {
                connectBtn.textContent = "Request sent";
                connectBtn.disabled = true;
                connectBtn.className = "pf-btn pf-btn-ghost";
                show(connectBtn);
            } else {
                connectBtn.textContent = "Connect";
                show(connectBtn);
            }
        }
        if (messageBtn) {
            if (kind === "connected" && state.allowMessages) {
                show(messageBtn);
            } else if (state.allowMessages && kind === "none") {
                /* Messaging without a connection is server-enforced; the
                   button only appears when the member allows messages. */
                show(messageBtn);
            } else { hide(messageBtn); }
        }
    }

    async function doConnect() {
        var API = window.SkillShareAPI;
        var rel = state.relationship || {};
        var btn = $("connectBtn");
        if (btn) { btn.disabled = true; }
        try {
            if (rel.relationship === "pending" && rel.direction === "received") {
                await API.acceptRequest(rel.request_id);
                toast("Connection accepted.");
            } else {
                await API.sendRequest(state.targetId, null, null, null);
                toast("Connection request sent.");
            }
            await refreshPayload();
        } catch (err) {
            toast(errDetail(err, "Could not update the connection."));
            if (btn) { btn.disabled = false; }
        }
    }

    async function doMessage() {
        var API = window.SkillShareAPI;
        var btn = $("messageBtn");
        if (btn) { btn.disabled = true; }
        try {
            var res = await API.commEnsureDirect(state.targetId);
            var conv = res && (res.conversation || res);
            var id = conv && conv.id;
            toast("Conversation ready — opening Messages…");
            var target = "messages.html" + (id ? "?conversation=" + id : "");
            setTimeout(function () { window.location.href = target; }, 350);
        } catch (err) {
            toast(errDetail(err, "Could not open a conversation."));
            if (btn) { btn.disabled = false; }
        }
    }

    function copyProfileLink(button) {
        var input = $("profileUrlInput");
        var url = input && input.value
            ? input.value
            : window.location.href;
        function done() {
            toast("Profile link copied.");
            if (button) {
                var old = button.textContent;
                button.textContent = "Copied";
                setTimeout(function () { button.textContent = old; }, 1600);
            }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(function () {
                fallbackCopy(url, done);
            });
        } else { fallbackCopy(url, done); }
    }

    function fallbackCopy(text, done) {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); done(); }
        catch (e) { toast("Could not copy — select the link manually."); }
        document.body.removeChild(ta);
    }

    /* ==================================================================
     * MODALS (shared behaviour: focus trap, ESC, body lock)
     * ================================================================== */
    var MODAL_IDS = ["editProfileModal", "educationModal", "skillModal"];

    function focusablesIn(root) {
        return Array.prototype.filter.call(
            root.querySelectorAll("a[href],button:not([disabled]),input:not([disabled])," +
                "select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex=\"-1\"])"),
            function (el) { return el.offsetParent !== null || el === document.activeElement; }
        );
    }

    function onModalKeydown(e) {
        var open = null;
        MODAL_IDS.forEach(function (id) {
            var el = $(id);
            if (!open && el && !el.hidden) open = el;
        });
        if (!open) { return; }
        if (e.key === "Escape") {
            e.preventDefault();
            closeModal(open.id);
            return;
        }
        if (e.key === "Tab") {
            var items = focusablesIn(open);
            if (!items.length) return;
            var first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault(); last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault(); first.focus();
            }
        }
    }

    function openModal(id) {
        var el = $(id);
        if (!el) return;
        state.lastFocus = document.activeElement;
        el.hidden = false;
        document.body.classList.add("pf-modal-open");
        var first = focusablesIn(el)[0];
        if (first) { first.focus(); }
    }

    function closeModal(id) {
        var el = $(id);
        if (!el) return;
        el.hidden = true;
        if (!MODAL_IDS.some(function (other) {
            var m = $(other);
            return m && !m.hidden;
        })) {
            document.body.classList.remove("pf-modal-open");
        }
        if (state.lastFocus && typeof state.lastFocus.focus === "function") {
            state.lastFocus.focus();
        }
        state.lastFocus = null;
    }

    function showFormError(id, message) {
        var el = $(id);
        if (!el) return;
        if (message) {
            el.textContent = message;
            el.hidden = false;
        } else { el.hidden = true; }
    }

    /* ==================================================================
     * EDIT PROFILE MODAL
     * ================================================================== */
    function val(id, v) {
        var el = $(id);
        if (el) { el.value = v == null ? "" : String(v); }
    }

    function valOf(id) {
        var el = $(id);
        return el ? String(el.value || "").trim() : "";
    }

    function fillEditProfile() {
        var p = state.payload || {}, u = p.user || {}, rp = p.role_profile || {};
        var role = p.role || "student";

        val("efName", u.name);
        val("efUsername", u.username);
        val("efLocation", u.location);
        val("efWebsite", u.website);
        val("efAvatar", u.avatar_url || u.avatar);
        val("efPhone", u.phone);
        val("efBio", u.bio);

        var ef = {
            student: $("efStudentFields"),
            recruiter: $("efRecruiterFields"),
            mentor: $("efMentorFields")
        };
        Object.keys(ef).forEach(function (k) {
            if (ef[k]) { if (k === role) { show(ef[k]); } else { hide(ef[k]); } }
        });

        if (role === "student") {
            val("efTargetRole", rp.target_job_role);
            val("efPreferredIndustry", rp.preferred_industry);
            val("efTopSkills", (rp.top_skills || []).join(", "));
            val("efLanguages", (rp.programming_languages || []).join(", "));
            val("efTechnologies", (rp.technologies || []).join(", "));
            val("efLookingFor", (rp.looking_for || []).join(", "));
        } else if (role === "recruiter") {
            val("efJobTitle", rp.job_title);
            val("efCompanyName", rp.company_name);
            val("efCompanyWebsite", rp.company_website);
            val("efIndustry", rp.industry);
            val("efCompanySize", rp.company_size);
            val("efCompanyLocation", rp.company_location);
            val("efHiringFor", (rp.hiring_for || []).join(", "));
            val("efJobRoles", (rp.job_roles || []).join(", "));
            val("efRequiredSkills", (rp.required_skills || []).join(", "));
            val("efInternship", rp.internship_availability);
        } else if (role === "mentor") {
            val("efMentorJobTitle", rp.job_title);
            val("efMentorCompany", rp.company);
            val("efMentorIndustry", rp.industry);
            val("efYearsExperience", rp.years_experience);
            val("efExpertise", (rp.expertise_areas || []).join(", "));
            val("efLinkedin", rp.linkedin_url);
            val("efGithub", rp.github_url);
            val("efPortfolio", rp.portfolio_url);
        }
    }

    function csvList(id) {
        return valOf(id).split(",").map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    function roleProfileBody(role) {
        var body = {};
        if (role === "student") {
            body.target_job_role = valOf("efTargetRole") || null;
            body.preferred_industry = valOf("efPreferredIndustry") || null;
            body.top_skills = csvList("efTopSkills");
            body.programming_languages = csvList("efLanguages");
            body.technologies = csvList("efTechnologies");
            body.looking_for = csvList("efLookingFor");
        } else if (role === "recruiter") {
            body.job_title = valOf("efJobTitle") || null;
            body.company_name = valOf("efCompanyName") || null;
            body.company_website = valOf("efCompanyWebsite") || null;
            body.industry = valOf("efIndustry") || null;
            body.company_size = valOf("efCompanySize") || null;
            body.company_location = valOf("efCompanyLocation") || null;
            body.hiring_for = csvList("efHiringFor");
            body.job_roles = csvList("efJobRoles");
            body.required_skills = csvList("efRequiredSkills");
            body.internship_availability = valOf("efInternship") || null;
        } else if (role === "mentor") {
            body.job_title = valOf("efMentorJobTitle") || null;
            body.company = valOf("efMentorCompany") || null;
            body.industry = valOf("efMentorIndustry") || null;
            var yrs = valOf("efYearsExperience");
            body.years_experience = yrs === "" ? null : Number(yrs);
            body.expertise_areas = csvList("efExpertise");
            body.linkedin_url = valOf("efLinkedin") || null;
            body.github_url = valOf("efGithub") || null;
            body.portfolio_url = valOf("efPortfolio") || null;
        }
        return body;
    }

    async function saveEditProfile() {
        var API = window.SkillShareAPI;
        var role = (state.payload || {}).role || "student";
        var saveBtn = $("editProfileSave");
        showFormError("editProfileError", null);
        if (valOf("efName").length < 2) {
            showFormError("editProfileError",
                "Name must be at least 2 characters.");
            return;
        }
        if (role === "mentor") {
            var yrs = valOf("efYearsExperience");
            if (yrs !== "" && (Number(yrs) < 0 || Number(yrs) > 60)) {
                showFormError("editProfileError",
                    "Years of experience must be between 0 and 60.");
                return;
            }
        }
        if (saveBtn) { saveBtn.disabled = true; }
        try {
            await API.updateMyProfile({
                name: valOf("efName"),
                username: valOf("efUsername"),
                bio: valOf("efBio"),
                location: valOf("efLocation"),
                website: valOf("efWebsite"),
                avatar_url: valOf("efAvatar"),
                phone: valOf("efPhone")
            });
            await API.updateMyRoleProfile({ profile: roleProfileBody(role) });
            closeModal("editProfileModal");
            toast("Profile updated.");
            await refreshPayload();
        } catch (err) {
            showFormError("editProfileError",
                errDetail(err, "Could not save your profile."));
        } finally {
            if (saveBtn) { saveBtn.disabled = false; }
        }
    }

    /* ==================================================================
     * EDUCATION MODAL + CRUD
     * ================================================================== */
    function openEducationModal(educationId) {
        var rows = (state.payload || {}).education || [];
        state.editEducationId = educationId || null;
        var row = null;
        if (educationId != null) {
            rows.forEach(function (r) {
                if (String(r.id) === String(educationId)) row = r;
            });
        }
        var title = $("educationModalTitle");
        if (title) {
            title.textContent = row ? "Edit education" : "Add education";
        }
        var saveBtn = $("educationSave");
        if (saveBtn) { saveBtn.textContent = row ? "Save changes" : "Add education"; }

        val("edInstitution", row ? row.institution_name : "");
        val("edDegree", row ? row.degree : "");
        val("edField", row ? row.field_of_study : "");
        val("edLevel", row ? row.education_level : "");
        val("edStart", row ? row.start_date : "");
        val("edEnd", row ? row.end_date : "");
        val("edGrade", row ? row.grade : "");
        val("edCgpa", row && row.cgpa != null ? row.cgpa : "");
        val("edPercentage", row && row.percentage != null ? row.percentage : "");
        var cur = $("edCurrent");
        if (cur) { cur.checked = !!(row && row.currently_studying); }
        val("edDescription", row ? row.description : "");
        showFormError("educationError", null);
        openModal("educationModal");
    }

    async function saveEducation() {
        var API = window.SkillShareAPI;
        var saveBtn = $("educationSave");
        showFormError("educationError", null);
        if (!valOf("edInstitution")) {
            showFormError("educationError", "Institution name is required.");
            return;
        }
        var start = valOf("edStart"), end = valOf("edEnd");
        if (start && end && !valOf("edCurrent") && end < start) {
            showFormError("educationError",
                "End date must come after the start date.");
            return;
        }
        var cgpaRaw = valOf("edCgpa"), pctRaw = valOf("edPercentage");
        if (cgpaRaw !== "" && (Number(cgpaRaw) < 0 || Number(cgpaRaw) > 10)) {
            showFormError("educationError", "CGPA must be between 0 and 10.");
            return;
        }
        if (pctRaw !== "" && (Number(pctRaw) < 0 || Number(pctRaw) > 100)) {
            showFormError("educationError", "Percentage must be between 0 and 100.");
            return;
        }

        var body = {
            institution_name: valOf("edInstitution"),
            degree: valOf("edDegree") || null,
            field_of_study: valOf("edField") || null,
            education_level: valOf("edLevel") || null,
            start_date: start || null,
            end_date: end || null,
            currently_studying: !!valOf("edCurrent"),
            grade: valOf("edGrade") || null,
            cgpa: cgpaRaw === "" ? null : Number(cgpaRaw),
            percentage: pctRaw === "" ? null : Number(pctRaw),
            description: valOf("edDescription") || null
        };
        if (saveBtn) { saveBtn.disabled = true; }
        try {
            if (state.editEducationId != null) {
                await API.updateEducation(state.editEducationId, body);
                toast("Education updated.");
            } else {
                await API.addEducation(body);
                toast("Education added.");
            }
            closeModal("educationModal");
            await refreshPayload();
        } catch (err) {
            showFormError("educationError",
                errDetail(err, "Could not save this education record."));
        } finally {
            if (saveBtn) { saveBtn.disabled = false; }
        }
    }

    async function deleteEducation(id, label) {
        if (!window.confirm("Delete “" + (label || "this education record") +
                "”? This cannot be undone.")) {
            return;
        }
        try {
            await window.SkillShareAPI.deleteEducation(id);
            toast("Education removed.");
            await refreshPayload();
        } catch (err) {
            toast(errDetail(err, "Could not delete this education record."));
        }
    }

    /* ==================================================================
     * SKILL MODAL + CRUD (+ catalogue datalist)
     * ================================================================== */
    function openSkillModal() {
        val("skName", "");
        var level = $("skLevel");
        if (level) { level.value = "beginner"; }
        val("skYears", "");
        val("skRating", "");
        showFormError("skillError", null);
        openModal("skillModal");
        loadSkillCatalog();
        var nameEl = $("skName");
        if (nameEl) { nameEl.focus(); }
    }

    var catalogLoaded = false;
    async function loadSkillCatalog() {
        if (catalogLoaded) return;
        var list = $("skCatalog");
        if (!list) return;
        catalogLoaded = true;
        try {
            var res = await window.SkillShareAPI.searchSkillCatalog("", 120);
            var skills = (res && (res.skills || res.catalog || res.items)) || [];
            if (!Array.isArray(skills)) { skills = []; }
            list.innerHTML = skills.slice(0, 120).map(function (s) {
                var name = typeof s === "string" ? s : (s.name || "");
                return name ? '<option value="' + esc(name) + '"></option>' : "";
            }).join("");
        } catch (e) {
            catalogLoaded = true; /* datalist is a convenience, never a blocker */
        }
    }

    async function saveSkill() {
        var API = window.SkillShareAPI;
        var saveBtn = $("skillSave");
        showFormError("skillError", null);
        var name = valOf("skName");
        if (!name) {
            showFormError("skillError", "Skill name is required.");
            return;
        }
        var yearsRaw = valOf("skYears");
        var ratingRaw = valOf("skRating");
        if (yearsRaw !== "" && (Number(yearsRaw) < 0 || Number(yearsRaw) > 60)) {
            showFormError("skillError",
                "Years of experience must be between 0 and 60.");
            return;
        }
        if (ratingRaw !== "" && (Number(ratingRaw) < 1 || Number(ratingRaw) > 5)) {
            showFormError("skillError", "Self rating must be between 1 and 5.");
            return;
        }
        var body = {
            skill_name: name,
            level: valOf("skLevel") || "beginner",
            years_of_experience: yearsRaw === "" ? null : Number(yearsRaw),
            self_rating: ratingRaw === "" ? null : Number(ratingRaw)
        };
        if (saveBtn) { saveBtn.disabled = true; }
        try {
            await API.addMySkill(body);
            closeModal("skillModal");
            toast("Skill added.");
            await refreshPayload();
        } catch (err) {
            showFormError("skillError",
                errDetail(err, "Could not add this skill."));
        } finally {
            if (saveBtn) { saveBtn.disabled = false; }
        }
    }

    async function deleteSkill(id, name) {
        if (!window.confirm("Remove “" + (name || "this skill") +
                "” from your profile?")) {
            return;
        }
        try {
            await window.SkillShareAPI.deleteMySkill(id);
            toast("Skill removed.");
            await refreshPayload();
        } catch (err) {
            toast(errDetail(err, "Could not remove this skill."));
        }
    }

    function filterProjectsBySkill(name) {
        var grid = $("projectGrid");
        var needle = String(name || "").toLowerCase();
        if (!grid || !needle) return;
        var cards = grid.querySelectorAll(".pf-proj-card");
        var clearing = state.projectFilter === needle; /* second click resets */
        state.projectFilter = clearing ? null : needle;
        var hits = 0;
        Array.prototype.forEach.call(cards, function (card) {
            if (clearing) { card.hidden = false; return; }
            var text = (card.textContent || "").toLowerCase();
            var match = text.indexOf(needle) !== -1;
            card.hidden = !match;
            if (match) { hits++; }
        });
        var section = $("sec-projects");
        if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (clearing) { toast("Showing all projects."); return; }
        toast(hits
            ? hits + (hits === 1 ? " project matches " : " projects match ") + name
            : "No listed projects reference " + name + " yet.");
    }

    /* ==================================================================
     * TABS (accessible, roving tabindex)
     * ================================================================== */
    function selectTab(name, focusIt) {
        var tabs = document.querySelectorAll(".pf-tab");
        Array.prototype.forEach.call(tabs, function (tab) {
            var on = tab.getAttribute("data-tab") === name;
            tab.setAttribute("aria-selected", on ? "true" : "false");
            tab.tabIndex = on ? 0 : -1;
            if (on && focusIt) { tab.focus(); }
        });
        ["problems", "challenges"].forEach(function (key) {
            var panel = $("panel-" + key);
            if (panel) { panel.hidden = key !== name; }
        });
    }

    function wireTabs() {
        var tabs = Array.prototype.slice.call(document.querySelectorAll(".pf-tab"));
        if (!tabs.length) return;
        tabs.forEach(function (tab, i) {
            tab.addEventListener("click", function () {
                selectTab(tab.getAttribute("data-tab"), false);
            });
            tab.addEventListener("keydown", function (e) {
                var dir = e.key === "ArrowRight" ? 1
                    : e.key === "ArrowLeft" ? -1 : 0;
                if (!dir) return;
                e.preventDefault();
                var next = tabs[(i + dir + tabs.length) % tabs.length];
                selectTab(next.getAttribute("data-tab"), true);
            });
        });
        selectTab("problems", false);
    }

    /* ==================================================================
     * SUB-NAV: smooth scroll + scroll-spy highlight
     * ================================================================== */
    function wireSubnav() {
        var links = document.querySelectorAll("[data-subnav]");
        Array.prototype.forEach.call(links, function (a) {
            a.addEventListener("click", function (e) {
                var id = (a.getAttribute("href") || "").replace("#", "");
                var target = $(id);
                if (!target) return;
                e.preventDefault();
                target.scrollIntoView({
                    behavior: prefersReducedMotion() ? "auto" : "smooth",
                    block: "start"
                });
                try { history.replaceState(null, "", "#" + id); } catch (err) {}
            });
        });
        if (!("IntersectionObserver" in window)) return;
        var seen = {};
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                seen[entry.target.id] = entry.isIntersecting;
            });
            var current = null;
            Array.prototype.forEach.call(links, function (a) {
                var id = (a.getAttribute("href") || "").replace("#", "");
                if (!current && seen[id]) { current = id; }
            });
            Array.prototype.forEach.call(links, function (a) {
                var id = (a.getAttribute("href") || "").replace("#", "");
                if (id === current) { a.setAttribute("aria-current", "true"); }
                else { a.removeAttribute("aria-current"); }
            });
        }, { rootMargin: "-30% 0px -55% 0px", threshold: 0 });
        ["sec-summary", "sec-skills", "sec-experience", "sec-education",
         "sec-projects", "sec-innovation", "sec-industry", "sec-learning",
         "sec-activity"].forEach(function (id) {
            var el = $(id);
            if (el) { observer.observe(el); }
        });
    }

    /* ==================================================================
     * TIMELINE REVEAL (respects prefers-reduced-motion)
     * ================================================================== */
    var revealObserver = null;
    function revealTimeline(initial) {
        var items = document.querySelectorAll("#activityTimeline .pf-tl-item");
        if (!items.length) return;
        if (prefersReducedMotion() || !("IntersectionObserver" in window)) {
            document.body.classList.remove("pf-anim");
            Array.prototype.forEach.call(items, function (li) {
                li.classList.add("pf-tl-in");
            });
            return;
        }
        document.body.classList.add("pf-anim");
        if (!revealObserver) {
            revealObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("pf-tl-in");
                        revealObserver.unobserve(entry.target);
                    }
                });
            }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
        }
        Array.prototype.forEach.call(items, function (li, i) {
            if (li.classList.contains("pf-tl-in")) return;
            li.style.transitionDelay = Math.min(i, 8) * 35 + "ms";
            revealObserver.observe(li);
        });
        if (initial) { /* first paint: nothing else to do */ }
    }

    /* ==================================================================
     * WIRING (delegated where children are re-rendered)
     * ================================================================== */
    function wireStaticControls() {
        var clickMap = {
            editProfileBtn: function () { fillEditProfile(); openModal("editProfileModal"); },
            editProfileClose: function () { closeModal("editProfileModal"); },
            editProfileCancel: function () { closeModal("editProfileModal"); },
            editProfileSave: saveEditProfile,
            addEducationBtn: function () { openEducationModal(null); },
            addEducationEmptyBtn: function () { openEducationModal(null); },
            educationModalClose: function () { closeModal("educationModal"); },
            educationCancel: function () { closeModal("educationModal"); },
            educationSave: saveEducation,
            addSkillBtn: openSkillModal,
            addSkillEmptyBtn: openSkillModal,
            skillModalClose: function () { closeModal("skillModal"); },
            skillCancel: function () { closeModal("skillModal"); },
            skillSave: saveSkill,
            connectBtn: doConnect,
            messageBtn: doMessage,
            copyLinkBtn: function () { copyProfileLink($("copyLinkBtn")); },
            shareBtn: function () { copyProfileLink($("shareBtnLabel")); },
            activityMoreBtn: loadMoreActivity,
            profileRetryBtn: function () { loadProfile({ silent: false }); }
        };
        Object.keys(clickMap).forEach(function (id) {
            var el = $(id);
            if (el) { el.addEventListener("click", clickMap[id]); }
        });

        document.addEventListener("keydown", onModalKeydown, true);

        /* Modal backdrop click closes (only when the backdrop itself is hit). */
        MODAL_IDS.forEach(function (id) {
            var el = $(id);
            if (!el) return;
            el.addEventListener("click", function (e) {
                if (e.target === el) { closeModal(id); }
            });
        });

        document.addEventListener("click", function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            var del = t.closest("[data-skill-del]");
            if (del) {
                deleteSkill(del.getAttribute("data-skill-del"),
                    del.getAttribute("data-skill-name"));
                return;
            }
            var filt = t.closest("[data-skill-filter]");
            if (filt) {
                filterProjectsBySkill(filt.getAttribute("data-skill-filter"));
                return;
            }
            var eduEdit = t.closest("[data-edu-edit]");
            if (eduEdit) {
                openEducationModal(eduEdit.getAttribute("data-edu-edit"));
                return;
            }
            var eduDel = t.closest("[data-edu-del]");
            if (eduDel) {
                deleteEducation(eduDel.getAttribute("data-edu-del"),
                    eduDel.getAttribute("data-edu-name"));
                return;
            }
            var retry = t.closest("[data-retry]");
            if (retry) { loadProfile({ silent: false }); }
        });
    }

    async function loadMoreActivity() {
        var more = $("activityMoreBtn");
        if (more) { more.disabled = true; }
        try {
            if (state.activity.shown < state.activity.events.length) {
                state.activity.shown = Math.min(
                    state.activity.shown + ACTIVITY_PAGE,
                    state.activity.events.length);
                paintActivity();
            } else if (state.activity.requestedLimit < ACTIVITY_MAX) {
                state.activity.requestedLimit = Math.min(
                    state.activity.requestedLimit + ACTIVITY_PAGE, ACTIVITY_MAX);
                await refreshPayload();
            }
            revealTimeline(false);
        } finally {
            if (more) { more.disabled = false; }
        }
    }

    /* ==================================================================
     * FETCH + FATAL STATE + BOOT
     * ================================================================== */
    var SECTION_NAMES = ["summary", "skills", "experience", "education",
        "projects", "innovation", "industry", "learning", "activity",
        "connections"];

    function parseTargetId() {
        var raw = null;
        try {
            raw = new URLSearchParams(window.location.search).get("id");
        } catch (e) { raw = null; }
        if (!raw) return { ok: true, id: null };
        var n = Number(String(raw).trim());
        if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) {
            return { ok: false, id: null, raw: raw };
        }
        return { ok: true, id: n };
    }

    function showSkeletons() {
        SECTION_NAMES.forEach(function (name) {
            setSection(name, "loading");
        });
    }

    function showFatal(title, message, withRetry) {
        document.body.classList.remove("pf-anim");
        hide($("pfHero"));
        hide($("pfSubnav"));
        hide($("signalStrip"));
        hide($("completionCard"));
        var layout = document.querySelector(".pf-layout");
        if (layout) { hide(layout); }
        txt("profileFatalTitle", title);
        txt("profileFatalMsg", message);
        var retry = $("profileRetryBtn");
        if (retry) { if (withRetry) { show(retry); } else { hide(retry); } }
        show($("profileFatal"));
        announce(message);
    }

    async function loadProfile(options) {
        var opts = options || {};
        var API = window.SkillShareAPI;
        if (!API || !API.getToken()) {
            window.location.href = "login.html?next=" +
                encodeURIComponent("profile.html");
            return;
        }
        var target = parseTargetId();
        if (!target.ok) {
            showFatal("Invalid profile link",
                "The ?id= parameter must be a whole numeric member id. " +
                "Open your own profile or pick a member from the community.",
                false);
            return;
        }
        state.targetId = target.id;
        if (!opts.silent) { showSkeletons(); }
        var params = {
            activity_limit: state.activity.requestedLimit,
            project_limit: 12
        };
        try {
            var payload;
            if (target.id != null && target.id !== state.viewerId) {
                payload = await API.getPublicProfileSummary(target.id, params);
            } else {
                payload = await API.getProfileSummary(params);
            }
            applyPayload(payload);
        } catch (err) {
            var status = err && err.status;
            if (status === 404) {
                showFatal("Profile not available",
                    "This member does not exist, has left the platform, or " +
                    "keeps their profile private.", false);
            } else if (status === 401) {
                window.location.href = "login.html?next=" +
                    encodeURIComponent("profile.html");
            } else {
                showFatal("Could not load the profile",
                    errDetail(err,
                        "The profile service is unreachable right now."), true);
            }
        }
    }

    async function refreshPayload() {
        await loadProfile({ silent: true });
        revealTimeline(false);
    }

    function boot() {
        var API = window.SkillShareAPI;
        if (!API) {
            showFatal("Configuration missing",
                "The API client failed to load, so no real profile data can " +
                "be requested.", false);
            return;
        }
        if (!API.getToken()) {
            window.location.href = "login.html?next=" +
                encodeURIComponent("profile.html");
            return;
        }
        var viewer = null;
        try { viewer = API.getUser ? API.getUser() : null; } catch (e) { viewer = null; }
        state.viewerId = viewer && viewer.id != null ? viewer.id : null;

        wireStaticControls();
        wireTabs();
        wireSubnav();
        window.addEventListener("skillshare:auth-expired", function () {
            window.location.href = "login.html?next=" +
                encodeURIComponent("profile.html");
        });
        loadProfile({ silent: false });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else { boot(); }
})();
