/* =========================================================
   SKILLSHARE — CAREERVERSE (Stage 10)
   Connects the canonical CareerVerse page to real backend APIs.
   No hardcoded user data — everything from /api/careerverse/*.
   ========================================================= */
(function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function $(id) { return document.getElementById(id); }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch (e) { return iso; }
  }

  function pct(v) { return (v == null || isNaN(Number(v))) ? "—" : Number(v) + "%"; }

  function renderLayout() {
    var root = document.querySelector(".page-content");
    if (!root) return;
    root.innerHTML =
      '<div id="cv-loading" class="cv-empty">Loading your career journey…</div>' +
      '<div id="cv-error" class="cv-empty" style="display:none"></div>' +
      '<div id="cv-app" style="display:none">' +
      '  <header class="portal-head"><span class="eyebrow">Career · journey</span>' +
      '  <h1 id="cv-greeting">Career<span>Verse</span></h1>' +
      '  <p id="cv-subtitle">Your personalized career operating system.</p></header>' +
      '  <section class="grid-3" id="cv-stats"></section>' +
      '  <div class="grid-2 mt">' +
      '    <section class="panel"><div class="section-head"><h2>Readiness &amp; Skill Gaps</h2></div><div id="cv-gaps"></div></section>' +
      '    <section class="panel"><div class="section-head"><h2>Next Mission</h2></div><div id="cv-mission"></div>' +
      '      <div class="section-head mt"><h2>Learning In Progress</h2></div><div id="cv-learning"></div></section>' +
      '  </div>' +
      '  <div class="grid-2 mt">' +
      '    <section class="panel"><div class="section-head"><h2>Career Roadmap</h2></div><div id="cv-roadmap"></div></section>' +
      '    <section class="panel"><div class="section-head"><h2>Career Replay</h2></div><div id="cv-timeline" class="timeline"></div></section>' +
      '  </div>' +
      '  <div class="grid-2 mt">' +
      '    <section class="panel"><div class="section-head"><h2>Career Goal</h2></div><div id="cv-goal"></div></section>' +
      '    <section class="panel"><div class="section-head"><h2>What-If Simulation</h2></div><div id="cv-sim"></div></section>' +
      '  </div>' +
      '</div>';
  }

  function showError(msg) {
    var loading = $("cv-loading"), err = $("cv-error"), app = $("cv-app");
    if (loading) loading.style.display = "none";
    if (err) { err.style.display = ""; err.textContent = msg; }
    if (app) app.style.display = "none";
  }

  function showApp() {
    var loading = $("cv-loading"), err = $("cv-error"), app = $("cv-app");
    if (loading) loading.style.display = "none";
    if (err) err.style.display = "none";
    if (app) app.style.display = "";
  }

  var CV = window.SkillShare || (window.SkillShare = {});
  CV.api = window.SkillShareAPI || {};

  function renderHeader(data) {
    var h1 = $("cv-greeting"), sub = $("cv-subtitle");
    var name = data.user && data.user.name;
    if (h1 && name) h1.innerHTML = "Hi " + esc(name.split(" ")[0]) + '<span>, your CareerVerse</span>';
    if (sub) {
      var ed = data.education;
      var bits = [];
      if (ed && ed.degree) bits.push(ed.degree);
      if (ed && ed.branch) bits.push(ed.branch);
      if (ed && ed.college) bits.push(ed.college);
      sub.textContent = bits.length
        ? bits.join(" · ") + " — current position, target, progress and what-if scenarios."
        : "Complete your profile to personalize CareerVerse.";
    }
  }

  function statCard(icon, value, label) {
    return '<div class="panel stat-card"><div class="stat-top"><span class="stat-icon">' + icon +
      '</span></div><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
  }

  function renderStats(data) {
    var root = $("cv-stats");
    if (!root) return;
    var targetTitle = (data.target_role && data.target_role.title) ||
      (data.profile && data.profile.target_job_role) || "Not set";
    var readiness = data.readiness || {};
    var score = readiness.score != null ? pct(readiness.score) : "—";
    var readinessLabel = "Readiness" + (readiness.level ? " · " + readiness.level : "");
    var skills = data.skills || {};
    var learning = data.learning || {};
    var projects = data.projects || {};
    var sandbox = data.sandbox || {};
    root.innerHTML =
      statCard("📍", targetTitle, "Target career") +
      statCard("📊", score, readinessLabel) +
      statCard("📈", data.journey_progress != null ? pct(data.journey_progress) : "—", "Journey progress") +
      statCard("🏆", String(skills.count || 0), "Skills · " + (skills.evidence_total || 0) + " evidence") +
      statCard("📚", (learning.completed || 0) + "/" + (learning.total || 0), "Learning completed") +
      statCard("💻", String(projects.total || 0), "Projects · " + (sandbox.joined || 0) + " sandbox");
  }

  function renderGaps(data) {
    var root = $("cv-gaps");
    if (!root) return;
    var readiness = data.readiness || {};
    var gaps = data.skill_gaps || [];
    var html = "";
    if (readiness.score != null) {
      html += '<div class="cv-readiness"><b>' + pct(readiness.score) + '</b> ' +
        '<span class="badge blue">' + esc(readiness.level || "—") + '</span>';
      if (readiness.reason) html += '<p class="muted" style="margin-top:.35rem;">' + esc(readiness.reason) + '</p>';
      html += '</div>';
    } else {
      html += '<p class="muted">Set a target career in Skill Mapping to calculate readiness.</p>' +
        '<a class="btn small ghost mt" href="skill-mapping.html">Open Skill Mapping</a>';
    }
    if (gaps.length) {
      html += '<div class="row-list mt">';
      for (var i = 0; i < gaps.length && i < 5; i++) {
        var g = gaps[i];
        html += '<div class="row-item"><div class="grow"><h3>' + (i + 1) + '. ' + esc(g.skill_name || "Skill") +
          '</h3><p class="muted">Current: ' + esc(g.student_level || "—") + ' · Required: ' +
          esc(g.required_level || "—") + ' · Priority: ' + esc(g.priority || "—") + '</p></div></div>';
      }
      html += '</div>';
    } else if (readiness.score != null) {
      html += '<p class="muted mt">No skill gaps for your target role — keep building evidence.</p>';
    }
    root.innerHTML = html;
  }

  function renderLearning(data) {
    var root = $("cv-learning");
    if (!root) return;
    var inProgress = (data.learning && data.learning.in_progress) || [];
    if (!inProgress.length) {
      root.innerHTML = '<p class="muted">No active learning yet. <a href="my-learning.html">Start learning a skill</a> to build your profile.</p>';
      return;
    }
    var html = '<div class="row-list">';
    for (var i = 0; i < inProgress.length; i++) {
      var l = inProgress[i];
      html += '<div class="row-item"><div class="grow"><h3>' + esc(l.resource_title || l.skill_name || "Learning") +
        '</h3><p class="muted">' + esc(l.skill_name || "") + ' · ' + esc(String(l.progress != null ? l.progress : 0)) + '% complete</p></div>' +
        '<a class="btn small ghost" href="my-learning.html">Continue</a></div>';
    }
    root.innerHTML = html + '</div>';
  }

  function renderRoadmap(stages) {
    var root = $("cv-roadmap");
    if (!root) return;
    if (!stages || !stages.length) {
      root.innerHTML = '<p class="muted">Your roadmap will appear as you progress.</p>';
      return;
    }
    var html = '<div class="cv-roadmap">';
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var icon = s.status === "completed" ? "✓" : (s.status === "current" ? "●" : "○");
      html += '<div class="cv-stage cv-stage--' + esc(s.status) + '">' +
        '<span class="cv-stage__icon">' + icon + '</span>' +
        '<div class="grow"><b>' + esc(s.title) + '</b><p class="muted">' + esc(s.description || "") + '</p></div>' +
        '<span class="badge ' + (s.status === "completed" ? "green" : (s.status === "current" ? "blue" : "grey")) + '">' + esc(s.status) + '</span>' +
        '</div>';
    }
    root.innerHTML = html + '</div>';
  }

  function renderMission(mission) {
    var root = $("cv-mission");
    if (!root) return;
    if (!mission) {
      root.innerHTML = '<p class="muted">Set a target role to receive your next mission.</p>';
      return;
    }
    root.innerHTML = '<div class="cv-mission"><h3>NEXT MISSION</h3>' +
      '<div class="title">' + esc(mission.title || "") + '</div>' +
      (mission.reason ? '<div class="reason">' + esc(mission.reason) + '</div>' : "") +
      (mission.action ? '<p style="margin-top:.5rem;font-size:.8rem;color:#94a3b8;">Action: ' + esc(mission.action) + '</p>' : "") +
      '</div>';
  }

  function renderTimeline(events) {
    var root = $("cv-timeline");
    if (!root) return;
    if (!events || !events.length) {
      root.innerHTML = '<p class="muted">Your career journey will appear here as you progress.</p>';
      return;
    }
    var html = "";
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      html += '<div class="tl-item"><h3>' + esc(e.title || "") + '</h3><p class="muted">' +
        esc(e.description || "") + ' · ' + esc(fmtDate(e.created_at)) + '</p></div>';
    }
    root.innerHTML = html;
  }

  function renderGoal(goal) {
    var root = $("cv-goal");
    if (!root) return;
    if (goal) {
      root.innerHTML = '<p><b>' + esc(goal.target_role) + '</b>' +
        (goal.target_domain ? ' · ' + esc(goal.target_domain) : '') +
        '<br><span class="muted">Status: ' + esc(goal.status || "active") + '</span></p>' +
        '<button class="btn small ghost mt" id="cv-goal-change">Change goal</button>';
      var btn = $("cv-goal-change");
      if (btn) btn.addEventListener("click", renderGoalForm);
    } else {
      renderGoalForm();
    }
  }

  function renderGoalForm() {
    var root = $("cv-goal");
    if (!root) return;
    root.innerHTML =
      '<p class="muted" style="font-size:.8rem;">Set the career you are working toward. Missions, readiness and roadmap follow this goal.</p>' +
      '<input id="cv-goal-role" type="text" placeholder="e.g. Backend Developer" style="width:100%;margin-top:.5rem;">' +
      '<input id="cv-goal-domain" type="text" placeholder="Domain (optional), e.g. Web" style="width:100%;margin-top:.4rem;">' +
      '<button class="btn small primary mt" id="cv-goal-save">Save goal</button>' +
      '<p id="cv-goal-msg" class="muted" style="font-size:.75rem;margin-top:.4rem;"></p>';
    var save = $("cv-goal-save");
    if (save) {
      save.addEventListener("click", function () {
        var role = (($("cv-goal-role") || {}).value || "").trim();
        var domain = (($("cv-goal-domain") || {}).value || "").trim();
        var msg = $("cv-goal-msg");
        if (!role) { if (msg) msg.textContent = "Enter a target role first."; return; }
        if (msg) msg.textContent = "Saving…";
        CV.api.setCareerGoal({ target_role: role, target_domain: domain || null }).then(function () {
          return CV.api.getCareerOverview();
        }).then(function (data) {
          renderGoal(data && data.active_goal);
          CV._refreshOverview(data);
        }).catch(function (e) {
          if (msg) msg.textContent = "Could not save goal: " + (e.message || "error");
        });
      });
    }
  }

  var _simSkills = [];

  function renderSim() {
    var root = $("cv-sim");
    if (!root) return;
    root.innerHTML = '<p class="muted" style="font-size:.8rem;">Improve a skill level to see projected readiness (existing Stage 5 engine).</p>' +
      '<div id="cv-sim-controls"></div>' +
      '<button class="btn small primary mt" id="cv-sim-run">Run simulation</button>' +
      '<div id="cv-sim-result" class="mt"></div>';
    loadSimControls();
  }

  function loadSimControls() {
    CV.api.getCareerOverview().then(function (data) {
      var skills = (data.skills && data.skills.top) || [];
      _simSkills = skills;
      var ctrl = $("cv-sim-controls");
      if (!ctrl) return;
      if (!skills.length) {
        ctrl.innerHTML = '<p class="muted" style="font-size:.8rem;">Add skills first to simulate.</p>';
        return;
      }
      var html = '<select id="cv-sim-skill">';
      for (var i = 0; i < skills.length; i++) {
        var s = skills[i];
        html += '<option value="' + i + '">' + esc(s.name || "Skill") + ' (' + esc(s.level || "—") + ')</option>';
      }
      html += '</select> → <select id="cv-sim-level">' +
        '<option value="beginner">beginner</option>' +
        '<option value="intermediate">intermediate</option>' +
        '<option value="advanced">advanced</option>' +
        '<option value="expert">expert</option></select>';
      ctrl.innerHTML = html;
      var btn = $("cv-sim-run");
      if (btn) btn.addEventListener("click", runSim);
    }).catch(function () {});
  }

  function runSim() {
    var skillSel = $("cv-sim-skill");
    var levelSel = $("cv-sim-level");
    var result = $("cv-sim-result");
    if (!skillSel || !levelSel || !result) return;
    var idx = parseInt(skillSel.value, 10);
    var skill = _simSkills[idx];
    if (!skill) return;
    result.innerHTML = '<p class="muted">Running…</p>';
    var payload = { actions: [{ skill_id: skill.skill_id || skill.id, new_level: levelSel.value }] };
    CV.api.simulate(payload).then(function (res) {
      var cur = res.current || {};
      var proj = res.projected || {};
      var delta = res.delta;
      result.innerHTML = '<div class="cv-sim-result">' +
        '<p>Current: <b>' + pct(cur.readiness) + '</b> (' + esc(cur.readiness_level || "—") + ')</p>' +
        '<p>Projected: <b>' + pct(proj.readiness) + '</b> (' + esc(proj.readiness_level || "—") + ')</p>' +
        (delta != null ? '<p>Delta: <b>' + (delta > 0 ? "+" : "") + delta + '%</b></p>' : '') +
        (res.disclaimer ? '<p class="muted" style="font-size:.75rem;margin-top:.5rem;">' + esc(res.disclaimer) + '</p>' : "") +
        '</div>';
    }).catch(function (e) {
      result.innerHTML = '<p class="muted">Simulation failed: ' + esc(e.message || "error") + '</p>';
    });
  }

  function loadAll() {
    Promise.all([
      CV.api.getCareerOverview().catch(function () { return null; }),
      CV.api.getCareerRoadmap().catch(function () { return { stages: [] }; }),
      CV.api.getCareerTimeline().catch(function () { return { events: [] }; }),
    ]).then(function (results) {
      var overview = results[0], roadmap = results[1], timeline = results[2];
      if (!overview) { showError("Could not load your career data. Please try again."); return; }
      showApp();
      renderHeader(overview);
      renderStats(overview);
      renderGaps(overview);
      renderLearning(overview);
      renderMission(overview.next_mission);
      renderGoal(overview.active_goal);
      renderRoadmap(roadmap.stages || []);
      renderTimeline(timeline.events || []);
      renderSim();
    }).catch(function (e) {
      showError("Failed to load CareerVerse: " + (e.message || "error"));
    });
  }

  CV._refreshOverview = function (data) {
    if (!data) return;
    renderStats(data);
    renderGaps(data);
    renderLearning(data);
    renderMission(data.next_mission);
  };

  function init() {
    if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
      renderLayout();
      showError("Please sign in to view CareerVerse.");
      return;
    }
    renderLayout();
    loadAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

