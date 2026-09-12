/* AI Career Coach — Stage 9 frontend controller */
(function () {
  "use strict";

  const S = window.SkillShareAPI;
  if (!S) { console.error("SkillShareAPI missing"); return; }

  let careerContext = null;
  let recommendations = null;
  let activeConvId = null;
  let activeMode = "general";
  let loading = false;

  const MODES = [
    { id: "general", name: "Career Planning", icon: "&#127919;", desc: "Roadmap, readiness, career path" },
    { id: "skill", name: "Skill Planning", icon: "&#128200;", desc: "Gaps, priorities, skill order" },
    { id: "learning", name: "Learning Coach", icon: "&#128218;", desc: "Course progress guidance" },
    { id: "project", name: "Project Coach", icon: "&#128187;", desc: "Project ideas, tech choices" },
    { id: "sandbox", name: "Sandbox Coach", icon: "&#127981;", desc: "Challenge recommendations" },
    { id: "innovation", name: "Innovation Coach", icon: "&#128161;", desc: "Idea, team, milestones" },
    { id: "opportunity", name: "Opportunity Coach", icon: "&#128188;", desc: "Jobs and internships" },
    { id: "interview", name: "Interview Prep", icon: "&#127908;", desc: "Preparation guidance" },
  ];

  const SUGGESTIONS = [
    "What should I learn next?",
    "Why am I not ready?",
    "Review my career roadmap.",
    "Which skill gap should I fix first?",
    "Suggest my next project.",
    "How can I improve my readiness?",
    "What should I do this week?",
  ];

  const $ = (id) => document.getElementById(id);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function showError(msg) {
    $("cc-loading").style.display = "none";
    $("cc-content").style.display = "none";
    $("cc-error").style.display = "block";
    $("cc-error-msg").textContent = msg;
  }

  function setLoading(on) {
    loading = on;
    $("cc-chat-input").disabled = on;
    $("cc-chat-form").querySelector("button").disabled = on;
  }

  function addMsg(role, text, meta) {
    const div = document.createElement("div");
    div.className = "cc-msg " + (role === "user" ? "user" : role === "error" ? "error" : "bot");
    div.innerHTML = esc(text).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    $("cc-chat").appendChild(div);
    $("cc-chat").scrollTop = $("cc-chat").scrollHeight;
    if (meta) {
      const m = document.createElement("div");
      m.style.cssText = "font-size:.65rem;color:#8b8fa3;margin-top:.15rem;";
      m.textContent = meta;
      div.appendChild(m);
    }
  }


  // ── Render: Career Snapshot ────────────────────────────────────────
  function renderSnapshot(ctx) {
    const target = ctx.target_role || {};
    const readiness = ctx.readiness || {};
    const gaps = ctx.skill_gaps || [];
    const evidence = ctx.evidence || {};
    const prov = ctx.provider || {};

    $("cc-target-role").textContent = target.title || "Not set";
    $("cc-readiness").textContent = readiness.score != null ? readiness.score + "%" : "—";
    $("cc-top-gap").textContent = gaps.length ? gaps[0].skill_name : "None";
    $("cc-evidence-count").textContent = evidence.total || 0;

    if (prov.configured === "external" && prov.ai_available) {
      $("cc-provider-badge").textContent = "AI: External";
      $("cc-provider-badge").className = "cc-chip green";
    } else if (prov.configured === "local") {
      $("cc-provider-badge").textContent = "AI: Local";
      $("cc-provider-badge").className = "cc-chip blue";
    } else {
      $("cc-provider-badge").textContent = "AI: Rule-based";
      $("cc-provider-badge").className = "cc-chip amber";
    }

    let msg = [];
    if (!ctx.profile_complete) msg.push("Complete your profile for better recommendations.");
    if (!ctx.has_target) msg.push("Set a target role to unlock skill gap analysis.");
    if (readiness.score != null) msg.push("Readiness: " + readiness.score + "% — " + (readiness.level || ""));
    if (ctx.disclaimer) msg.push(ctx.disclaimer);
    $("cc-snapshot-msg").textContent = msg.join("  ");
  }

  // ── Render: Coach Modes ────────────────────────────────────────────
  function renderModes() {
    const container = $("cc-modes");
    container.innerHTML = "";
    MODES.forEach((m) => {
      const div = document.createElement("div");
      div.className = "cc-mode" + (m.id === activeMode ? " active" : "");
      div.innerHTML = '<span class="icon">' + m.icon + '</span><div><div class="name">' + m.name + '</div><div class="desc">' + m.desc + '</div></div>';
      div.addEventListener("click", function () { setMode(m.id); });
      container.appendChild(div);
    });
  }

  // ── Render: Next Mission ───────────────────────────────────────────
  function renderMission(rec) {
    if (!rec || !rec.next_mission) {
      $("cc-next-mission").innerHTML = '<div class="cc-empty">No mission computed yet. Set a target role to begin.</div>';
      return;
    }
    const m = rec.next_mission;
    $("cc-next-mission").innerHTML = '<div class="cc-mission"><h3>NEXT MISSION</h3><div class="title">' + esc(m.title) + '</div><div class="reason">' + esc(m.reason) + '</div><p style="margin-top:.5rem;font-size:.8rem;color:#c4b5fc;">Action: ' + esc(m.action) + '</p></div>';
  }

  // ── Render: Roadmap ────────────────────────────────────────────────
  function renderRoadmap(rec) {
    const stages = (rec && rec.roadmap) || [];
    if (!stages.length) {
      $("cc-roadmap").innerHTML = '<div class="cc-empty">Roadmap will appear once you have a target role.</div>';
      return;
    }
    let html = '<div class="cc-roadmap">';
    stages.forEach((s, i) => {
      const icon = s.status === "completed" ? "&#10003;" : "&#9679;";
      html += '<div class="step"><span class="dot ' + s.status + '">' + icon + '</span><span>' + esc(s.title) + '</span>';
      if (i < stages.length - 1) html += '<span class="arrow">&#10140;</span>';
      html += '</div>';
    });
    html += '</div>';
    $("cc-roadmap").innerHTML = html;
  }

  // ── Render: Recommended Actions ────────────────────────────────────
  function renderActions(rec) {
    const actions = (rec && rec.recommended_actions) || [];
    if (!actions.length) {
      $("cc-actions").innerHTML = '<div class="cc-empty">No actions at this time. Great work!</div>';
      return;
    }
    let html = '<div class="cc-actions">';
    actions.forEach(function (a) {
      html += '<div class="cc-action"><span class="prio">P' + a.priority + '</span><div class="body"><h4>' + esc(a.title) + '</h4><p>' + esc(a.reason) + '</p><p style="margin-top:.25rem;font-size:.75rem;color:#818cf8;">→ ' + esc(a.action) + '</p></div></div>';
    });
    html += '</div>';
    $("cc-actions").innerHTML = html;
  }

  // ── Conversations ──────────────────────────────────────────────────
  async function loadConversations() {
    try {
      const convs = await S.getCoachConversations();
      let opts = '<option value="">New conversation</option>';
      convs.forEach(function (c) {
        opts += '<option value="' + c.id + '"' + (c.id === activeConvId ? ' selected' : '') + '>' + esc(c.title) + ' (' + c.message_count + ')</option>';
      });
      $("cc-conv-select").innerHTML = opts;
    } catch (e) { /* silent */ }
  }

  async function newConversation() {
    try {
      const conv = await S.createCoachConversation({ mode: activeMode });
      activeConvId = conv.id;
      $("cc-chat").innerHTML = '<div class="cc-msg bot">New conversation started. How can I help?</div>';
      await loadConversations();
    } catch (e) {
      addMsg("error", "Failed to create conversation: " + e.message);
    }
  }

  async function switchConversation(convId) {
    if (!convId) { activeConvId = null; $("cc-chat").innerHTML = ""; return; }
    try {
      const conv = await S.getCoachConversation(Number(convId));
      if (!conv) return;
      activeConvId = conv.id;
      $("cc-chat").innerHTML = "";
      conv.messages.forEach(function (m) { addMsg(m.role, m.content); });
    } catch (e) {
      addMsg("error", "Failed to load conversation: " + e.message);
    }
  }

  // ── Chat ───────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (loading || !text.trim()) return;
    addMsg("user", text);
    $("cc-chat-input").value = "";
    setLoading(true);
    try {
      const result = await S.careerCoachChat({
        message: text.trim(),
        conversation_id: activeConvId,
        mode: activeMode,
      });
      const providerLabel = result.ai_used ? "(" + result.provider + ")" : "(rule-based)";
      addMsg("bot", result.content || "I wasn't able to generate a response.", providerLabel);
      if (result.error) {
        $("cc-chat-note").textContent = "Note: " + result.error;
      }
      if (!activeConvId && result.conversation_id) {
        activeConvId = result.conversation_id;
      }
      await loadConversations();
    } catch (e) {
      addMsg("error", "Failed to get response: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  function setMode(mode) {
    activeMode = mode;
    $("cc-chat-mode").value = mode;
    renderModes();
    const modeInfo = MODES.find(m => m.id === mode);
    if (modeInfo) {
      addMsg("bot", "Switched to " + modeInfo.name + " mode. " + modeInfo.desc);
    }
  }

  function renderSuggestions() {
    const container = $("cc-suggestions");
    container.innerHTML = "";
    SUGGESTIONS.forEach(function (s) {
      const btn = document.createElement("button");
      btn.className = "cc-suggestion";
      btn.textContent = s;
      btn.addEventListener("click", function () { sendMessage(s); });
      container.appendChild(btn);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────
  function showDegraded(reason) {
    // The page itself is fine — the career-coach service is unreachable.
    // Keep the UI usable instead of hiding everything behind an error.
    $("cc-loading").style.display = "none";
    $("cc-content").style.display = "block";

    $("cc-provider-badge").textContent = "AI: Offline";
    $("cc-provider-badge").className = "cc-chip amber";
    $("cc-snapshot-msg").textContent = reason;

    renderModes();
    renderMission(null);
    renderRoadmap(null);
    renderActions(null);
    renderSuggestions();
    addMsg("bot", "I couldn't reach the career coach service just now. Your data is safe — please make sure the backend is running and try again.");
  }

  async function init() {
    let ctx = null;
    try {
      ctx = await S.getCareerContext();
    } catch (e) {
      if (e && e.status === 401) {
        // Session problem — auth.js handles the redirect to login.html.
        showError("Your session has expired or you are not signed in. Redirecting to login…");
        return;
      }
      showDegraded("Career coach service unavailable: " + e.message);
      return;
    }

    careerContext = ctx;

    try {
      recommendations = await S.getCareerRecommendations();
    } catch (e) { recommendations = null; }

    $("cc-loading").style.display = "none";
    $("cc-content").style.display = "block";

    renderSnapshot(ctx);
    renderModes();
    renderMission(recommendations);
    renderRoadmap(recommendations);
    renderActions(recommendations);
    renderSuggestions();
    await loadConversations();

    if (ctx.profile && ctx.profile.first_name) {
      addMsg("bot", "Hi " + ctx.profile.first_name + "! I've analyzed your career context. Ask me about your career path, skill gaps, or what to do next.");
    }
  }

  // ── Event bindings ─────────────────────────────────────────────────
  $("cc-chat-form").addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage($("cc-chat-input").value);
  });

  $("cc-chat-mode").addEventListener("change", function (e) { setMode(e.target.value); });
  $("cc-new-conv").addEventListener("click", newConversation);
  $("cc-conv-select").addEventListener("change", function (e) { switchConversation(e.target.value); });

  // ── Boot ───────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);
})();
