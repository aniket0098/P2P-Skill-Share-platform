/* =========================================================
   SKILLSHARE — INDUSTRY INSIGHTS (industry-skills.html)
   Real career-intelligence dashboard.

   Data sources (all real, all via window.SkillShareAPI):
     GET /api/industry/domains        -> industry filter chips
     GET /api/industry/skills         -> skills in demand (+search)
     GET /api/industry/roles          -> roles + focus select
     GET /api/industry/insights       -> overview stats (dataset)
     GET /api/skill-gap/me            -> personalized gap vs focus role
     PUT /api/skill-mapping/target-role
     GET /api/learning-resources      -> learning per gap skill
     GET /api/sandbox/challenges      -> real-world challenges
     GET /api/opportunities           -> published opportunities
     GET /profile/me + /api/profile/skills + /api/profile/completion
   ========================================================= */
"use strict";

(function () {

  var API = window.SkillShareAPI;
  var AUTH = window.SkillShareAuth;
  var $ = function (id) { return document.getElementById(id); };

  var S = {
    user: null, authed: false,
    domains: [], domain: "",           // "" = all industries
    roles: [], roleById: {}, rolesToken: 0,
    skills: [], skillsToken: 0,
    insightsToken: 0, chToken: 0, oppToken: 0,
    gap: null, gapRole: null, gapAttempted: false, gapError: null,
    focusRoleId: "",
    search: "", growth: "", searchTimer: null,
    mySkillsMap: {},                   // skill_name(lower) -> {level, is_verified}
    insights: null, challenges: [], opps: [],
    loaded: { profile: false }
  };

  /* -------------------------------------------------------
     utils
  ------------------------------------------------------- */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function text(el, v) { if (el) el.textContent = v == null ? "" : String(v); }
  function show(el, on) { if (el) el.hidden = !on; }

  function toast(msg) {
    var root = $("toast-root");
    if (!root) return;
    var t = document.createElement("div");
    t.className = "ii-toast";
    t.setAttribute("role", "status");
    t.textContent = String(msg || "");
    root.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  function friendlyError(e) {
    var st = e && e.status;
    if (st === 0) return "Server unavailable. Check that the backend is running.";
    if (st === 401) return "Your session expired. Please sign in again.";
    if (st === 403) return "You do not have permission to do that.";
    if (st === 404) return (e && e.detail) || "That item could not be found.";
    if (st === 409) return (e && e.detail) || "That change conflicts with the current state.";
    if (st === 422) return (e && e.detail) || "That request was not valid.";
    if (st >= 500) return "The server had a problem. Please try again.";
    return (e && (e.detail || e.message)) || "Something went wrong.";
  }

  function stateHTML(kind, icon, title, msg, retryAttr) {
    var retry = retryAttr ? '<button type="button" class="btn small primary mt" data-ii-retry="' + retryAttr + '">Try again</button>' : "";
    return '<div class="ii-state ' + (kind || "") + '" role="status">' +
      '<div class="icon" aria-hidden="true">' + icon + "</div>" +
      "<h3>" + esc(title) + "</h3>" +
      "<p>" + esc(msg) + "</p>" + retry + "</div>";
  }
  function errorState(container, e, retryAttr) {
    if (!container) return;
    container.innerHTML = stateHTML("error", "⚠️", "Unable to load", friendlyError(e), retryAttr);
  }
  function emptyState(container, icon, title, msg, ctaHTML) {
    if (!container) return;
    container.innerHTML = stateHTML("", icon, title, msg) + (ctaHTML || "");
  }

  /* -------------------------------------------------------
     boot
  ------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    if (!API) { document.body.insertAdjacentHTML("afterbegin", stateHTML("error", "⚠️", "Configuration missing", "The API client failed to load.")); return; }
    if (!API.getToken()) { window.location.href = "login.html?next=industry-skills.html"; return; }

    wireDrawer();
    wireFilters();

    AUTH.getCurrentUser().then(function (user) {
      S.authed = true;
      S.user = user;
      bootData();
    }).catch(function (e) {
      if (e && e.status === 401) return; // auth.js redirects
      bootData();                        // still show public insight data
    });
  });

  function bootData() {
    loadProfileSignal();     // personalized (fails soft)
    loadGap();               // resolved role + readiness + learning (fails soft)
    loadLearning();          // honest placeholder until the gap resolves
    loadDomains().then(loadRoles);
    loadSkills();
    loadInsightsOverview();
    loadChallenges();
    loadOpportunities();
  }

  /* -------------------------------------------------------
     personalized career signal (B)
  ------------------------------------------------------- */
  function loadProfileSignal() {
    var grid = $("iiSignalGrid");
    if (grid) grid.innerHTML = sigSkeleton();

    Promise.allSettled([
      API.getMyRoleProfile(),
      API.getMySkills(),
      API.getProfileCompletion ? API.getProfileCompletion() : Promise.resolve(null)
    ]).then(function (r) {
      var profile = r[0].status === "fulfilled" ? (r[0].value.profile || {}) : {};
      var skills = r[1].status === "fulfilled" ? (r[1].value.skills || []) : [];
      var completion = r[2].status === "fulfilled" ? r[2].value : null;
      S.mySkillsMap = {};
      skills.forEach(function (s) {
        S.mySkillsMap[String(s.skill_name || "").toLowerCase()] = s;
      });
      renderSignal(profile, skills, completion);
      S.loaded.profile = true;
      if (S.skills.length) renderSkills();   // refresh status chips
    });
  }

  function sigSkeleton() {
    var c = "";
    for (var i = 0; i < 5; i++) {
      c += '<div class="ii-skel-card"><div class="ii-skeleton" style="width:52%"></div><div class="ii-skeleton" style="width:80%"></div></div>';
    }
    return c;
  }

  function renderSignal(profile, skills, completion) {
    var grid = $("iiSignalGrid");
    if (!grid) return;

    var target = (profile.target_job_role || "").trim();
    var industry = (profile.preferred_industry || "").trim();
    var verified = skills.filter(function (s) { return s.is_verified; }).length;
    var pct = completion && typeof completion.percentage === "number" ? completion.percentage : null;

    var cards = [];

    if (target) {
      cards.push(sigCard("Target role", target, industry ? "Preferred industry: " + industry : ""));
    } else {
      cards.push(sigCard("Target role", "Not set yet",
        "Choose a role to unlock your personal gap analysis.",
        '<a class="ii-sig-cta" href="skill-mapping.html">Pick a role →</a>'));
    }

    if (industry && !target) {
      cards.push(sigCard("Preferred industry", industry, ""));
    } else if (!industry && !target) {
      cards.push(sigCard("Preferred industry", "Not set", "Add it in your profile.", '<a class="ii-sig-cta" href="profile.html">Edit profile →</a>'));
    }

    if (skills.length) {
      cards.push(sigCard("Skills on profile", String(skills.length),
        verified ? verified + " evidence-backed" : "Self-reported — add evidence via projects & learning"));
    } else {
      cards.push(sigCard("Skills on profile", "0", "Add skills so insights can map your gaps.",
        '<a class="ii-sig-cta" href="profile.html">Add skills →</a>'));
    }

    if (pct != null) {
      cards.push(sigCard("Profile strength", pct + "%", "Completion of your SkillShare profile"));
    }

    if (S.gap) {
      var g = S.gap;
      var open = ((g.counts && g.counts.missing) || 0) + ((g.counts && g.counts.partial) || 0);
      var top = (g.recommendations && g.recommendations[0]) || null;
      cards.push(sigCard("Readiness — " + (g.role && g.role.title || "focus role"),
        (g.readiness_score != null ? g.readiness_score + "%" : "—"),
        g.readiness_level || "", top ? "Top gap: " + top.skill_name : "", true, g.readiness_score));
      if (open) {
        cards.push(sigCard("Gaps to close", String(open),
          top ? "Start with " + top.skill_name + (top.estimated_effort ? " · ~" + top.estimated_effort : "") : "Open Skill Mapping for the full list."));
      }
    } else if (S.gapAttempted) {
      cards.push(sigCard("Gap analysis", "Pick a focus role", "Select a Focus role below to see your personalized readiness."));
    }

    if (!cards.length) {
      grid.innerHTML = stateHTML("", "🧭", "No profile signals yet",
        "Set a target role and add skills — this section fills with your real data.");
      return;
    }
    grid.innerHTML = cards.join("");

    // animate real readiness bars only
    requestAnimationFrame(function () {
      grid.querySelectorAll("[data-bar]").forEach(function (b) {
        b.style.width = b.getAttribute("data-bar") + "%";
      });
    });
  }

  function sigCard(label, value, sub, cta, bar, barPct) {
    var cls = "ii-sig-card ii-sig-wide" + (bar ? "" : "");
    return '<div class="' + cls + '">' +
      '<span class="ii-sig-label">' + esc(label) + "</span>" +
      '<span class="ii-sig-value">' + esc(value) + "</span>" +
      (sub ? '<span class="ii-sig-sub">' + esc(sub) + "</span>" : "") +
      (bar && barPct != null ? '<div class="ii-sig-bar"><i data-bar="' + Math.max(0, Math.min(100, barPct)) + '"></i></div>' : "") +
      (cta || "") +
      "</div>";
  }

  /* -------------------------------------------------------
     domains (industry filter)
  ------------------------------------------------------- */
  function loadDomains() {
    var wrap = $("iiDomainChips");
    if (wrap) wrap.innerHTML = '<span class="ii-skeleton" style="width:220px;display:inline-block"></span>';
    return API.getIndustryDomains().then(function (d) {
      S.domains = (d && d.domains) || [];
      renderDomainChips();
      return S.domains;
    }).catch(function (e) {
      if (wrap) emptyState(wrap, "🏷️", "Industries unavailable", friendlyError(e));
      return [];
    });
  }

  function renderDomainChips() {
    var wrap = $("iiDomainChips");
    if (!wrap) return;
    if (!S.domains.length) { wrap.innerHTML = ""; return; }
    var html = '<button type="button" class="ii-chip' + (!S.domain ? " active" : "") + '" data-domain="" aria-pressed="' + (!S.domain) + '">All industries</button>';
    S.domains.forEach(function (d) {
      var on = S.domain === d.name;
      html += '<button type="button" class="ii-chip' + (on ? " active" : "") + '" data-domain="' + esc(d.name) + '" aria-pressed="' + on + '" title="' + esc(d.description || d.name) + '">' + esc(d.name) + "</button>";
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll("[data-domain]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        S.domain = btn.getAttribute("data-domain") || "";
        updateResetVisibility();
        renderDomainChips();
        loadRoles();
        loadSkills();
        loadInsightsOverview();
        loadChallenges();
      });
    });
  }

  function updateResetVisibility() {
    show($("iiReset"), !!(S.domain || S.growth || S.search));
  }

  /* -------------------------------------------------------
     roles (E + focus control)
  ------------------------------------------------------- */
  function loadRoles() {
    var grid = $("iiRolesGrid");
    var params = S.domain ? { domain: S.domain } : {};
    var token = ++S.rolesToken;
    if (grid) grid.innerHTML = roleSkeleton();
    return API.getIndustryRoles(params).then(function (d) {
      if (token !== S.rolesToken) return;
      S.roles = (d && d.roles) || [];
      S.roleById = {};
      S.roles.forEach(function (r) { S.roleById[String(r.id)] = r; });
      renderRoles();
      renderFocusSelect();
      return S.roles;
    }).catch(function (e) {
      if (token !== S.rolesToken) return;
      S.roles = [];
      errorState(grid, e, "roles");
      text($("iiRolesMeta"), "");
    });
  }

  function roleSkeleton() {
    var c = "";
    for (var i = 0; i < 4; i++) c += '<div class="ii-skel-card"><div class="ii-skeleton" style="width:60%"></div><div class="ii-skeleton" style="width:90%"></div><div class="ii-skeleton" style="width:40%"></div></div>';
    return c;
  }

  function renderRoles() {
    var grid = $("iiRolesGrid");
    var meta = $("iiRolesMeta");
    if (!grid) return;
    text(meta, S.roles.length ? S.roles.length + " mapped roles" : "");
    if (!S.roles.length) {
      grid.innerHTML = stateHTML("", "🗂️", "No roles for this industry",
        "Try another industry or clear the filter.");
      return;
    }
    grid.innerHTML = S.roles.map(function (r) {
      var skills = (r.required_skills || []).slice(0, 5).map(function (s) {
        return '<span class="tag">' + esc(s.skill_name) + "</span>";
      }).join("");
      var extra = (r.required_count || 0) > 5 ? '<span class="muted">+' + (r.required_count - 5) + " more</span>" : "";
      return '<article class="ii-role-card">' +
        '<div class="ii-role-top"><h3 class="ii-role-name">' + esc(r.title) + "</h3>" +
        (r.experience_level ? '<span class="badge grey">' + esc(r.experience_level) + "</span>" : "") + "</div>" +
        (r.description ? '<p class="ii-role-desc">' + esc(r.description) + "</p>" : "") +
        (skills ? '<div class="ii-skill-chips">' + skills + extra + "</div>" : "") +
        '<div class="ii-role-foot">' +
        '<span class="muted">' + (r.required_count || 0) + " required skills</span>" +
        '<button type="button" class="ii-mini-btn" data-role-detail="' + esc(r.id) + '">Explore role</button>' +
        "</div></article>";
    }).join("");
    grid.querySelectorAll("[data-role-detail]").forEach(function (b) {
      b.addEventListener("click", function () { openRoleDrawer(b.getAttribute("data-role-detail")); });
    });
  }

  function renderFocusSelect() {
    var sel = $("iiFocusRole");
    if (!sel) return;
    var current = S.gap && S.gap.role ? String(S.gap.role.id) : S.focusRoleId;
    sel.innerHTML = '<option value="">Select a role…</option>' + S.roles.map(function (r) {
      return '<option value="' + esc(r.id) + '"' + (String(r.id) === current ? " selected" : "") + ">" + esc(r.title) + "</option>";
    }).join("");
  }

  /* -------------------------------------------------------
     skills in demand (D) — server-side search, debounced
  ------------------------------------------------------- */
  function skillSkeleton() {
    var c = "";
    for (var i = 0; i < 8; i++) c += '<div class="ii-skel-card"><div class="ii-skeleton" style="width:55%"></div><div class="ii-skeleton" style="width:85%"></div><div class="ii-skeleton" style="width:45%"></div></div>';
    return c;
  }

  function loadSkills() {
    var grid = $("iiSkillsGrid");
    var meta = $("iiSkillsMeta");
    var token = ++S.skillsToken;
    if (grid) grid.innerHTML = skillSkeleton();
    var params = { limit: 24 };
    if (S.domain) params.domain = S.domain;
    if (S.search) params.search = S.search;
    if (S.growth) params.growth = S.growth;
    return API.getIndustrySkills(params).then(function (d) {
      if (token !== S.skillsToken) return;   // stale response guard
      S.skills = (d && d.skills) || [];
      renderSkills(d && d.disclaimer);
    }).catch(function (e) {
      if (token !== S.skillsToken) return;
      S.skills = [];
      errorState(grid, e, "skills");
      text(meta, "");
    });
  }

  function renderSkills(disclaimer) {
    var grid = $("iiSkillsGrid");
    var meta = $("iiSkillsMeta");
    if (!grid) return;
    var note = $("iiDataNote");
    if (note) note.title = disclaimer || "Platform industry dataset — not live market statistics.";
    text(meta, S.skills.length ? S.skills.length + " skills · ordered by demand score" : "");
    if (!S.skills.length) {
      grid.innerHTML = stateHTML("", "🔍", "No skills match",
        "Try a different search or industry.");
      return;
    }
    grid.innerHTML = S.skills.map(function (s) {
      var chip = myStatusChip(s);
      return '<article class="ii-skill-card">' +
        '<div class="ii-skill-top"><h3 class="ii-skill-name">' + esc(s.skill_name || s.name) + "</h3>" +
        (s.category ? '<span class="tag">' + esc(s.category) + "</span>" : "") + "</div>" +
        '<div class="ii-demand-row"><div class="ii-demand-bar" role="img" aria-label="Demand score ' + (s.demand_score || 0) + ' out of 100 (platform sample)"><i data-bar="' + Math.max(0, Math.min(100, s.demand_score || 0)) + '"></i></div>' +
        '<span class="ii-demand-num">' + (s.demand_score || 0) + "/100</span></div>" +
        '<div class="ii-skill-meta">' + outlookChip(s) + (chip || "") + "</div>" +
        '<div class="ii-skill-foot"><span class="muted">' + esc(bandLabel(s)) + "</span>" +
        '<button type="button" class="ii-mini-btn" data-skill-detail="' + esc(s.skill_id || s.id) + '">Details</button></div>' +
        "</article>";
    }).join("");
    requestAnimationFrame(function () {
      grid.querySelectorAll("[data-bar]").forEach(function (b) {
        b.style.width = b.getAttribute("data-bar") + "%";
      });
    });
    grid.querySelectorAll("[data-skill-detail]").forEach(function (b) {
      b.addEventListener("click", function () { openSkillDrawer(b.getAttribute("data-skill-detail")); });
    });
  }

  function bandLabel(s) {
    var b = s.demand_band || "";
    return b ? b + " demand" : "";
  }

  function outlookChip(s) {
    var o = (s.outlook || "").toLowerCase();
    var g = s.growth_rate || 0;
    var cls = o === "declining" ? "badge red" : (o === "high_growth" || o === "growing" ? "badge green" : "badge grey");
    var arrow = g > 0 ? " ▲" : (g < 0 ? " ▼" : "");
    var label = (s.outlook || "stable") + arrow + (g ? " " + g + " pts" : "");
    return '<span class="' + cls + '">' + esc(label) + "</span>";
  }

  function myStatusChip(s) {
    var name = String(s.skill_name || s.name || "").toLowerCase();
    var mine = S.mySkillsMap[name];
    if (mine && S.gap && S.gap.items) {
      var item = null;
      for (var i = 0; i < S.gap.items.length; i++) {
        if (String(S.gap.items[i].skill_name || "").toLowerCase() === name) { item = S.gap.items[i]; break; }
      }
      if (item) {
        var cls = item.status === "matched" ? "matched" : (item.status === "partial" ? "partial" : "missing");
        var lbl = item.status === "matched" ? "✓ Ready" : (item.status === "partial" ? "◐ Partial" : "✕ Missing");
        return '<span class="ii-status-chip ' + cls + '" title="' + esc("Your level: " + (item.student_level || "—") + " · required: " + (item.required_level || "—")) + '">' + lbl + "</span>";
      }
    }
    if (mine) {
      return '<span class="ii-status-chip mine">Your level: ' + esc(mine.level || "—") + "</span>";
    }
    return "";
  }

  /* -------------------------------------------------------
     focus role -> personalized gap
  ------------------------------------------------------- */
  function loadGap(roleId) {
    var params = roleId ? { role_id: roleId } : {};
    S.gapAttempted = true;
    return API.getSkillGap(params).then(function (g) {
      S.gap = g;
      S.gapError = null;
      S.gapRole = g.role || null;
      S.focusRoleId = g.role ? String(g.role.id) : S.focusRoleId;
      renderFocusSummary();
      if (S.loaded.profile) loadProfileSignal();
      if (S.skills.length) renderSkills();   // add gap status chips
      loadLearning();
      return g;
    }).catch(function (e) {
      S.gap = null;
      S.gapError = e;
      renderFocusError(e);
      loadLearning();   // show the honest error state, never a blank box
      if (S.loaded.profile) loadProfileSignal();
    });
  }

  function renderFocusSummary() {
    var box = $("iiFocusSummary");
    if (!box) return;
    if (!S.gap) { box.innerHTML = ""; return; }
    var g = S.gap;
    var open = ((g.counts && g.counts.missing) || 0) + ((g.counts && g.counts.partial) || 0);
    box.innerHTML = '<div class="ii-focus-card">' +
      '<div class="ii-focus-score"><b>' + (g.readiness_score != null ? g.readiness_score + "%" : "—") + '</b><span>' + esc(g.readiness_level || "") + "</span></div>" +
      (g.reason ? '<p class="ii-focus-reason">' + esc(g.reason) + "</p>" : "") +
      '<div class="ii-focus-counts">' +
      '<span class="badge green">✓ ' + ((g.counts && g.counts.matched) || 0) + " ready</span>" +
      (open ? '<span class="badge amber">◐ ' + open + " to close</span>" : "") +
      "</div></div>";
    var sel = $("iiFocusRole");
    if (sel && S.gapRole) sel.value = String(S.gapRole.id);
  }

  function renderFocusError(e) {
    var box = $("iiFocusSummary");
    if (box) box.innerHTML = '<div class="ii-state error"><h3>Gap analysis unavailable</h3><p>' + esc(friendlyError(e)) + '</p><button type="button" class="btn small primary mt" data-ii-retry="gap">Try again</button></div>';
  }

  /* -------------------------------------------------------
     industry overview (C) — dataset counts only
  ------------------------------------------------------- */
  function loadInsightsOverview() {
    var box = $("iiOverview");
    var token = ++S.insightsToken;
    if (box) box.innerHTML = '<div class="ii-skeleton" style="width:80%"></div><div class="ii-skeleton" style="width:60%;margin-top:8px"></div>';
    var params = { limit: 100 };
    if (S.domain) params.domain = S.domain;
    return API.getIndustryInsights(params).then(function (d) {
      if (token !== S.insightsToken) return d;
      S.insights = { top: d.top_skills || [], fastest: d.fastest_growing || [], emerging: d.emerging_skills || [], disclaimer: d.disclaimer, all: d.all || [] };
      renderOverview();
      return d;
    }).catch(function () {
      if (token !== S.insightsToken) return;
      if (box) box.innerHTML = stateHTML("", "📊", "Overview unavailable", "Industry dataset could not be loaded.");
    });
  }

  function renderOverview() {
    var box = $("iiOverview");
    if (!box || !S.insights) return;
    var dom = null;
    for (var i = 0; i < S.domains.length; i++) if (S.domains[i].name === S.domain) dom = S.domains[i];
    var all = S.insights.all || [];
    var rising = all.filter(function (s) { var o = (s.outlook || "").toLowerCase(); return o === "growing" || o === "high_growth"; }).length;
    var declining = all.filter(function (s) { return (s.outlook || "").toLowerCase() === "declining"; }).length;
    var top = (S.insights.top || []).slice(0, 5);
    box.innerHTML =
      (dom && dom.description ? '<p class="ii-ov-desc">' + esc(dom.description) + "</p>" : "") +
      '<div class="ii-ov-stats">' +
      ovStat(S.roles.length, "mapped roles") +
      ovStat(all.length, "skills tracked") +
      ovStat(rising, "rising skills") +
      ovStat((S.insights.emerging || []).length, "emerging skills") +
      "</div>" +
      '<div class="ii-ov-top">' + top.map(function (s) {
        return '<div class="ii-ov-top-row"><span class="t">' + esc(s.skill_name) + '</span>' +
          '<span class="bar"><i style="width:' + Math.max(0, Math.min(100, s.demand_score || 0)) + '%"></i></span>' +
          '<span class="n">' + (s.demand_score || 0) + "</span></div>";
      }).join("") + "</div>" +
      '<p class="ii-ov-foot">Demand scores are a 0–100 platform-sample index, not live hiring statistics.</p>';
  }
  function ovStat(n, label) {
    return '<div class="ii-ov-stat"><b>' + (n == null ? "—" : n) + "</b><span>" + esc(label) + "</span></div>";
  }

  /* -------------------------------------------------------
     challenges (F) — reuse Industry Sandbox catalog
  ------------------------------------------------------- */
  function rowSkeleton(n) {
    var c = "";
    for (var i = 0; i < (n || 3); i++) c += '<div class="ii-skel-card"><div class="ii-skeleton" style="width:65%"></div><div class="ii-skeleton" style="width:85%"></div></div>';
    return c;
  }

  function loadChallenges() {
    var box = $("iiChallenges");
    var token = ++S.chToken;
    if (box) box.innerHTML = rowSkeleton(3);
    var params = {};
    if (S.domain) params.domain = S.domain;
    return API.getSandboxChallenges(params).then(function (d) {
      if (token !== S.chToken) return;
      var rows = (d && d.challenges) || [];
      S.challenges = rows.slice(0, 6);
      renderChallenges();
    }).catch(function (e) {
      if (token !== S.chToken) return;
      errorState($("iiChallenges"), e, "challenges");
    });
  }

  function renderChallenges() {
    var box = $("iiChallenges");
    if (!box) return;
    if (!S.challenges.length) {
      box.innerHTML = stateHTML("", "🧩", "No challenges for this industry",
        "Open the Industry Sandbox for the full challenge catalog.");
      return;
    }
    box.innerHTML = S.challenges.map(function (c) {
      var skills = (c.skills || []).slice(0, 3).map(function (s) { return esc(s.skill_name); }).join(" · ");
      var meta = [c.company_name, c.industry || c.domain, c.difficulty, c.estimated_time].filter(Boolean).join(" · ");
      return '<div class="ii-row">' +
        '<div class="grow">' +
        '<a class="ii-row-title" href="sandbox-challenge.html?id=' + encodeURIComponent(c.id) + '">' + esc(c.title) + "</a>" +
        '<p class="ii-row-sub">' + esc(meta) + "</p>" +
        (skills ? '<p class="ii-row-sub">' + skills + "</p>" : "") +
        "</div>" +
        (c.is_demo ? '<span class="badge amber">DEMO</span>' : '<span class="badge blue">' + esc(c.status || "open") + "</span>") +
        "</div>";
    }).join("");
  }

  /* -------------------------------------------------------
     opportunities (G) — recommended-first, published fallback
  ------------------------------------------------------- */
  function loadOpportunities() {
    var box = $("iiOpps");
    var token = ++S.oppToken;
    var recommended = false;
    if (box) box.innerHTML = rowSkeleton(3);
    // Prefer server-side personalized ranking when the student is
    // authenticated; it computes eligibility + skill match server-side.
    // Published discovery is the honest fallback (recruiter-agnostic).
    var first = (API.getRecommendedOpportunities
      ? API.getRecommendedOpportunities({ limit: 24 })
      : Promise.reject({ status: 0 }));
    return first.then(function (d) {
      var rows = (d && d.opportunities) || [];
      if (rows.length) { recommended = true; return rows; }
      return API.listPublishedOpportunities({ limit: 24 }).then(function (p) {
        return (p && p.opportunities) || [];
      });
    }).catch(function () {
      // Recommended endpoint failed (e.g. no JWT scope) — fall back to
      // published discovery; a failure there surfaces the error state.
      return API.listPublishedOpportunities({ limit: 24 }).then(function (p) {
        return (p && p.opportunities) || [];
      });
    }).then(function (rows) {
      if (token !== S.oppToken) return;
      S.opps = rows || [];
      S.oppsRecommended = recommended;
      renderOpportunities();
    }).catch(function (e) {
      if (token !== S.oppToken) return;
      errorState($("iiOpps"), e, "opps");
    });
  }

  function gapSkillNames() {
    var names = {};
    var miss = (S.gap && S.gap.missing) || [];
    var part = (S.gap && S.gap.partial) || [];
    miss.concat(part).forEach(function (m) { names[String(m.skill_name || "").toLowerCase()] = true; });
    return names;
  }

  function renderOpportunities() {
    var box = $("iiOpps");
    if (!box) return;
    if (!S.opps.length) {
      box.innerHTML = stateHTML("", "💼", "No published opportunities right now",
        "When recruiters publish roles they appear here.",
        '<a class="btn small ghost" href="opportunities.html">Browse Opportunities →</a>');
      return;
    }
    var label = S.oppsRecommended
      ? '<p class="ii-row-sub ii-rec-note">Ranked for you by the server (eligibility + skill match) — full ranking on <a href="opportunities.html">Opportunities</a>.</p>'
      : "";
    var gaps = gapSkillNames();
    box.innerHTML = label + S.opps.slice(0, 6).map(function (o) {
      var skills = (o.skills || []).slice(0, 4).map(function (s) { return esc(s.skill_name); }).join(" · ");
      var overlap = (o.skills || []).filter(function (s) { return gaps[String(s.skill_name || "").toLowerCase()]; }).map(function (s) { return s.skill_name; });
      var meta = [o.company_name, o.opportunity_type, o.work_mode, o.location].filter(Boolean).join(" · ");
      return '<div class="ii-row">' +
        '<div class="grow">' +
        '<a class="ii-row-title" href="opportunity-details.html?id=' + encodeURIComponent(o.id) + '">' + esc(o.title) + "</a>" +
        '<p class="ii-row-sub">' + esc(meta) + "</p>" +
        (skills ? '<p class="ii-row-sub">Skills: ' + skills + "</p>" : "") +
        (overlap.length ? '<p class="ii-row-note">Builds: ' + esc(overlap.join(", ")) + "</p>" : "") +
        "</div></div>";
    }).join("");
  }

  /* -------------------------------------------------------
     learning (H) — real resources for real gaps
  ------------------------------------------------------- */
  function loadLearning() {
    var box = $("iiLearning");
    if (!box) return;
    if (S.gapError) {
      box.innerHTML = stateHTML("error", "⚠️", "Learning suggestions unavailable",
        "Gap analysis could not load, so targeted suggestions are paused.", "learning");
      return;
    }
    var miss = ((S.gap && S.gap.missing) || []).slice(0, 3);
    if (!miss.length) {
      var hasGap = S.gap && S.gap.role;
      box.innerHTML = stateHTML("", hasGap ? "✅" : "🎯",
        hasGap ? "No missing skills for this role" : "Choose a focus role",
        hasGap ? "Your profile covers the requirements — keep building evidence." : "Pick a Focus role to get targeted learning suggestions.");
      return;
    }
    box.innerHTML = rowSkeleton(3);
    Promise.allSettled(miss.map(function (m) {
      return API.getLearningResources({ skill: m.skill_name });
    })).then(function (results) {
      var html = miss.map(function (m, i) {
        var items = results[i].status === "fulfilled" ? ((results[i].value || {}).resources || []).slice(0, 2) : [];
        var links = items.map(function (r) {
          return '<a class="ii-learn-link" href="' + esc(r.url || "#") + '" target="_blank" rel="noopener noreferrer">' +
            '<span class="t">' + esc(r.title) + "</span>" +
            '<span class="muted">' + esc([r.provider, r.difficulty, r.resource_type].filter(Boolean).join(" · ")) + "</span></a>";
        }).join("");
        return '<div class="ii-learn-group">' +
          '<div class="ii-learn-head"><h3>' + esc(m.skill_name) + "</h3>" +
          '<span class="muted">needs ' + esc(m.required_level || "—") + (m.estimated_effort ? " · ~" + esc(m.estimated_effort) : "") + "</span></div>" +
          (links ? '<div class="ii-learn-links">' + links + "</div>" +
            '<a class="ii-sig-cta" href="explore-skills.html">Explore all resources →</a>'
            : '<p class="ii-row-sub">No curated resources yet — browse <a href="explore-skills.html">Explore Skills</a>.</p>') +
          "</div>";
      }).join("");
      box.innerHTML = html;
    });
  }

  /* -------------------------------------------------------
     drawers (J)
  ------------------------------------------------------- */
  var lastFocus = null;
  var escHandler = null;

  function wireDrawer() {
    var backdrop = $("iiBackdrop"), close = $("iiDrawerClose");
    function closeDrawer() {
      var d = $("iiDrawer"), b = $("iiBackdrop");
      if (!d) return;
      d.classList.remove("show");
      b.classList.remove("show");
      setTimeout(function () { show(d, false); show(b, false); }, 250);
      if (lastFocus) { try { lastFocus.focus(); } catch (e) {} }
      if (escHandler) document.removeEventListener("keydown", escHandler);
      escHandler = null;
    }
    if (close) close.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    window.__iiCloseDrawer = {
      close: closeDrawer,
      open: function () {
        if (escHandler) document.removeEventListener("keydown", escHandler);
        escHandler = function (e) { if (e.key === "Escape") closeDrawer(); };
        document.addEventListener("keydown", escHandler);
      }
    };
  }

  function openDrawer(title, bodyHTML) {
    var d = $("iiDrawer"), b = $("iiBackdrop");
    if (!d) return;
    lastFocus = document.activeElement;
    text($("iiDrawerTitle"), title);
    $("iiDrawerBody").innerHTML = bodyHTML;
    show(d, true); show(b, true);
    requestAnimationFrame(function () { d.classList.add("show"); b.classList.add("show"); });
    if (window.__iiCloseDrawer) window.__iiCloseDrawer.open();
    var c = $("iiDrawerClose");
    if (c) c.focus();
  }

  /* -------------------------------------------------------
     role drawer — GET /api/industry/roles/{id} + gap reuse
  ------------------------------------------------------- */
  function openRoleDrawer(roleId) {
    var body = $("iiDrawerBody");
    openDrawer("Loading…", '<div class="ii-skeleton" style="width:70%"></div><div class="ii-skeleton" style="width:90%;margin-top:10px"></div>');
    API.getIndustryRole(roleId).then(function (res) {
      var r = res.role || {};
      var skills = (r.required_skills || []).map(function (s) {
        return '<div class="ii-kv"><span class="k">' + esc(s.skill_name) + '</span><span class="v">' +
          esc([s.required_level, s.importance].filter(Boolean).join(" · ")) + "</span></div>";
      }).join("");
      var inGap = S.gap && S.gap.role && String(S.gap.role.id) === String(r.id);
      var focusBtn = inGap ? "" :
        '<button type="button" class="btn small primary" data-focus-role="' + esc(r.id) + '">Analyze my fit</button>';
      openDrawer(r.title || "Role",
        '<div class="ii-drawer-section"><p class="ii-drawer-desc">' + esc(r.description || "No description available.") + "</p></div>" +
        '<div class="ii-drawer-section"><h3>Role facts</h3>' +
        '<div class="ii-kv"><span class="k">Industry</span><span class="v">' + esc(r.domain || "—") + "</span></div>" +
        '<div class="ii-kv"><span class="k">Experience level</span><span class="v">' + esc(r.experience_level || "—") + "</span></div>" +
        '<div class="ii-kv"><span class="k">Required skills</span><span class="v">' + ((r.required_skills || []).length) + "</span></div></div>" +
        '<div class="ii-drawer-section"><h3>Required skills</h3>' + (skills || '<p class="ii-drawer-desc">No skill requirements mapped yet.</p>') + "</div>" +
        '<div class="ii-drawer-actions">' + focusBtn +
        '<a class="btn small" href="skill-mapping.html">Open Skill Mapping</a></div>');
      var fb = body.querySelector("[data-focus-role]");
      if (fb) fb.addEventListener("click", function () {
        window.__iiCloseDrawer.close();
        var sel = $("iiFocusRole");
        if (sel) sel.value = fb.getAttribute("data-focus-role");
        loadGap(fb.getAttribute("data-focus-role")).then(function () {
          toast("Analyzing your fit for " + (S.gapRole ? S.gapRole.title : "the role"));
        });
      });
    }).catch(function (e) {
      openDrawer("Role", stateHTML("error", "⚠️", "Unable to load role", friendlyError(e)));
    });
  }

  /* -------------------------------------------------------
     skill drawer — GET /api/skills/analyze/me (lazy, one call)
  ------------------------------------------------------- */
  function openSkillDrawer(skillId) {
    openDrawer("Loading…", '<div class="ii-skeleton" style="width:70%"></div><div class="ii-skeleton" style="width:90%;margin-top:10px"></div>');
    var params = { skill_id: skillId };
    if (S.gapRole) params.role_id = S.gapRole.id;
    API.analyzeMySkill(params).then(function (a) {
      var s = a.skill || {};
      var ev = a.evidence || {};
      var rows = [
        ["Your level", a.your_level || "not added"],
        ["Evidence", a.evidence_status || "—"],
        ["Required for " + ((a.role && a.role.title) || "role"), a.required_level || "not required"],
        ["Importance", a.importance || "—"],
        ["Status", a.status || "—"],
        ["Demand score", (s.demand_score != null ? s.demand_score + "/100 (platform sample)" : "—")],
        ["Outlook", s.outlook || "—"]
      ].map(function (kv) {
        return '<div class="ii-kv"><span class="k">' + esc(kv[0]) + '</span><span class="v">' + esc(kv[1]) + "</span></div>";
      }).join("");
      var evLine = ev.projects || ev.learning_records
        ? "Evidence from your activity: " + (ev.projects || 0) + " project(s), " + (ev.learning_records || 0) + " learning record(s)."
        : "No project or learning evidence yet for this skill.";
      openDrawer(s.skill_name || s.name || "Skill",
        '<div class="ii-drawer-section"><p class="ii-drawer-desc">' + esc(s.description || "No description available.") + "</p></div>" +
        '<div class="ii-drawer-section"><h3>Where you stand</h3>' + rows + "</div>" +
        '<div class="ii-drawer-section"><div class="ii-evidence">' + esc(evLine) + "</div></div>" +
        '<div class="ii-drawer-actions">' +
        '<button type="button" class="btn small primary" data-track-skill="' + esc(s.skill_name || s.name || "") + '">Track this skill</button>' +
        '<a class="btn small" href="explore-skills.html">Find learning</a>' +
        "</div>");
      var tb = document.querySelector("[data-track-skill]");
      if (tb) tb.addEventListener("click", function () {
        var name = tb.getAttribute("data-track-skill");
        API.addMySkill({ skill_name: name, level: "beginner" }).then(function () {
          S.mySkillsMap[name.toLowerCase()] = { level: "beginner" };
          toast('"' + name + '" added to your profile');
          renderSkills();
          openSkillDrawer(skillId); // refresh analysis
        }).catch(function (e) {
          toast(e && e.status === 409 ? "Already on your profile" : friendlyError(e));
        });
      });
    }).catch(function (e) {
      openDrawer("Skill", stateHTML("error", "⚠️", "Unable to analyze skill", friendlyError(e)));
    });
  }

  /* -------------------------------------------------------
     filters / events
  ------------------------------------------------------- */
  function wireFilters() {
    var search = $("iiSearch"), clear = $("iiSearchClear"),
      growth = $("iiGrowth"), reset = $("iiReset"), focus = $("iiFocusRole"), save = $("iiFocusSave");

    if (search) {
      search.addEventListener("input", function () {
        show(clear, !!search.value);
        clearTimeout(S.searchTimer);
        S.searchTimer = setTimeout(function () {
          var next = search.value.trim();
          if (next === S.search) return;   // no duplicate requests
          S.search = next;
          updateResetVisibility();
          loadSkills();
        }, 300);
      });
      search.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          search.value = ""; S.search = "";
          show(clear, false); updateResetVisibility(); loadSkills();
        }
      });
    }
    if (clear) clear.addEventListener("click", function () {
      if (search) { search.value = ""; search.focus(); }
      S.search = ""; show(clear, false); updateResetVisibility(); loadSkills();
    });
    if (growth) growth.addEventListener("change", function () {
      S.growth = growth.value;
      updateResetVisibility();
      loadSkills();
    });
    if (reset) reset.addEventListener("click", function () {
      S.growth = ""; S.search = ""; S.domain = "";
      if (growth) growth.value = "";
      if (search) search.value = "";
      show(clear, false); show(reset, false);
      renderDomainChips(); loadRoles(); loadSkills(); loadInsightsOverview(); loadChallenges();
    });
    if (focus) focus.addEventListener("change", function () {
      S.focusRoleId = focus.value;
      if (focus.value) loadGap(focus.value);
    });
    if (save) save.addEventListener("click", function () {
      if (!S.focusRoleId) { toast("Select a focus role first"); return; }
      save.disabled = true;
      API.updateTargetRole({ role_id: Number(S.focusRoleId) }).then(function () {
        toast("Target role saved to your profile");
        loadProfileSignal();
      }).catch(function (e) {
        toast(friendlyError(e));
      }).finally(function () { save.disabled = false; });
    });

    // retry buttons (event delegation for error states)
    document.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest("[data-ii-retry]") : null;
      if (!btn) return;
      var what = btn.getAttribute("data-ii-retry");
      if (what === "skills") loadSkills();
      if (what === "roles") loadRoles();
      if (what === "gap") loadGap(S.focusRoleId || undefined);
      if (what === "challenges") loadChallenges();
      if (what === "opps") loadOpportunities();
      if (what === "learning") loadLearning();
    });
  }
})();
