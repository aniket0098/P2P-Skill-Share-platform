import pathlib

content = '''/* AI Career Coach - Stage 9 frontend controller */
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
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;" }[c]));
  }

  function showError(msg) {
    $("cc-loading").style.display = "none";
    $("cc-content").style.display = "none";
    $("cc-error").style.display = "block";
    $("cc-error-msg").textContent = msg;
  }
'''

pathlib.Path("_build_part1.py").write_text(content, encoding="utf-8")
print("part1 written")
