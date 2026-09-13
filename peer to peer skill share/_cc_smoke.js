/* Smoke test for the redesigned AI Career Coach page using jsdom. */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const DIR = "c:\\project p2p\\peer to peer skill share";
const html = fs.readFileSync(path.join(DIR, "ai-career-coach.html"), "utf8");
const code = fs.readFileSync(path.join(DIR, "ai-career-coach.js"), "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/ai-career-coach.html",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

if (typeof window.requestAnimationFrame !== "function") {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
}

// Stubbed SkillShareAPI — mirrors real shapes returned by stage9_service.py
const ctx = {
  profile: { first_name: "Aniket", role_label: "student", bio: "CS student", skills: ["Python", "SQL"], interests: ["Backend"] },
  profile_complete: true,
  has_target: true,
  education: [],
  target_role: { id: 1, title: "Backend Developer", description: "Builds server-side systems", experience_level: "Entry", domain: "Software" },
  readiness: { score: 62, level: "Developing", reason: "Building", disclaimer: "Platform industry dataset (sample data)." },
  skills: [
    { skill_name: "Python", category: "Language", level: "intermediate", level_num: 3, evidence_count: 4, is_verified: false, demand_score: 85 },
    { skill_name: "SQL", category: "Database", level: "beginner", level_num: 2, evidence_count: 2, is_verified: false, demand_score: 80 },
  ],
  skill_gaps: [
    { skill_name: "System Design", status: "missing", priority: "high", required_level: "intermediate", student_level: null, gap_levels: 2, reason: "Your target role requires stronger system design skills.", importance: "High", demand_score: 90, estimated_effort: "3-5 hours" },
  ],
  evidence: { total: 6, skills_with_evidence: 3, by_source: { project: 2, learning: 4 } },
  learning: { total: 3, completed: 1, overall_progress: 45.0, recent: [], by_skill: [] },
  projects: { total: 2, items: [], tech_set: ["Python"] },
  sandbox: { joined: 0, items: [] },
  innovation: { ideas: [] },
  learning_resources: [],
  sandbox_targets: [],
  opportunities_available: false,
  disclaimer: "Platform industry dataset (sample data).",
  provider: { configured: "rule", ai_available: false },
};

const rec = {
  target_role: ctx.target_role, readiness: ctx.readiness,
  readiness_score: 62, readiness_level: "Developing",
  top_gaps: ctx.skill_gaps,
  top_skills: ctx.skills,
  evidence_summary: ctx.evidence,
  next_mission: { type: "skill", title: "Learn System Design", reason: "Your target role requires stronger system design skills.", action: "Start with fundamentals of System Design" },
  roadmap: [
    { id: "profile", title: "Profile & Skills", status: "completed", description: "Complete profile, add skills" },
    { id: "learning", title: "Learning", status: "current", description: "1 of 3 completed" },
    { id: "projects", title: "Projects", status: "completed", description: "2 project(s) tracked" },
    { id: "sandbox", title: "Industry Sandbox", status: "upcoming", description: "0 challenge(s)" },
    { id: "innovation", title: "Innovation Lab", status: "upcoming", description: "0 idea(s)" },
    { id: "gap_closure", title: "Skill Gap Closure", status: "current", description: "1 gap(s) remaining" },
    { id: "interview", title: "Interview Ready", status: "upcoming", description: "Readiness: 62%" },
  ],
  recommended_actions: [
    { priority: 1, type: "skill_gap", title: "Close gap: System Design", reason: "Highest-priority gap", action: "Start learning System Design" },
    { priority: 2, type: "learning", title: "Start a learning path", reason: "No tracked learning activity", action: "Begin with a course for your top gap" },
    { priority: 3, type: "project", title: "Build your first project", reason: "Projects provide strong evidence", action: "Build something demonstrating target skills" },
  ],
  learning_resources: [], sandbox_targets: [], has_target: true, profile_complete: true,
};

const convs = [
  { id: 1, title: "Skill planning", mode: "skill_planning", message_count: 2, created_at: "2026-09-12T10:00:00", updated_at: "2026-09-13T09:00:00" },
];
const conv = {
  id: 1, title: "Skill planning", mode: "skill_planning",
  messages: [
    { id: 1, role: "user", content: "What is a skill gap?", created_at: "2026-09-13T08:59:00" },
    { id: 2, role: "assistant", content: "A skill gap is the difference between what your target role requires and what you have.", created_at: "2026-09-13T09:00:00" },
  ],
};
const chatReply = {
  content: "Aniket, here is what to learn next:\n1. **System Design** — Your target role requires stronger system design skills.",
  conversation_id: 7, mode: "skill_planning", provider: "rule", actual_provider: "rule",
  ai_used: false, ai_available: false, fallback_used: true, fallback_available: true, error: null,
};

window.SkillShareAPI = {
  getCareerContext: async () => ctx,
  getCareerRecommendations: async () => rec,
  getCareerCoachStatus: async () => ({ backend: "online", provider: "rule", ai_available: false, fallback_available: true, local_reachable: null, ai_configured: false }),
  careerCoachChat: async () => chatReply,
  getCoachConversations: async () => convs,
  getCoachConversation: async () => conv,
  createCoachConversation: async () => ({ id: 42, title: "New conversation", mode: "general", messages: [] }),
};

const tick = () => new Promise((r) => setTimeout(r, 40));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  OK  " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? " — " + extra : "")); }
}

(async () => {
  window.eval(code);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  await tick();

  check("Boot: loading hidden, content visible", document.getElementById("cc-loading").style.display === "none" && document.getElementById("cc-content").style.display === "block");
  check("Hero: target role chip", document.getElementById("cc-hero-target").textContent === "Backend Developer", document.getElementById("cc-hero-target").textContent);
  check("Hero: readiness chip", document.getElementById("cc-hero-readiness").textContent === "62%", document.getElementById("cc-hero-readiness").textContent);
  check("Hero: gap chip", document.getElementById("cc-hero-gap").textContent === "System Design");

  const modeBtns = document.querySelectorAll("#cc-modes .cc-mode");
  check("Modes: 8 cards rendered", modeBtns.length === 8, "got " + modeBtns.length);
  check("Modes: General active by default", modeBtns[0].getAttribute("aria-selected") === "true");
  check("Modes: semantic buttons with tab role", modeBtns[0].tagName === "BUTTON" && modeBtns[0].getAttribute("role") === "tab");

  const badge = document.getElementById("cc-provider-badge");
  check("Status badge: Fallback Mode (real provider state)", badge.textContent === "Fallback Mode" && badge.classList.contains("cc-status--fallback"), badge.textContent);
  check("Thinking indicator hidden at rest", document.getElementById("cc-thinking").style.display === "none");

  const snap = document.getElementById("cc-snapshot");
  check("Snapshot: readiness block", !!snap.querySelector(".cc-snap__readiness"));
  check("Snapshot: score 62%", /62%/.test(snap.querySelector(".cc-snap__score").textContent));
  check("Snapshot: Target Role tile", /Backend Developer/.test(snap.innerHTML));
  check("Snapshot: Top Skill tile", /Python/.test(snap.innerHTML));
  check("Snapshot: Skill Gap tile", /System Design/.test(snap.innerHTML));
  check("Snapshot: Learning tile", /1\/3/.test(snap.innerHTML));

  const mission = document.getElementById("cc-next-mission");
  check("Mission: title", /Learn System Design/.test(mission.textContent), mission.textContent);
  check("Mission: reason", /stronger system design/.test(mission.textContent));
  check("Mission: impact from real gap data", /Impact: High/.test(mission.textContent));
  check("Mission: effort from real gap data", /Effort: 3-5 hours/.test(mission.textContent));
  const mc = mission.querySelector(".cc-mission__cta");
  check("Mission: Start Mission CTA -> skill-mapping.html", mc && mc.getAttribute("href") === "skill-mapping.html", mc && mc.getAttribute("href"));

  const roadmap = document.getElementById("cc-roadmap");
  const steps = roadmap.querySelectorAll(".cc-roadmap__step");
  check("Roadmap: 7 steps", steps.length === 7, "got " + steps.length);
  check("Roadmap: completed has check icon", !!steps[0].querySelector(".cc-roadmap__dot svg"));
  check("Roadmap: current animated dot", !!roadmap.querySelector(".cc-roadmap__step--current .cc-roadmap__pulse"));
  check("Roadmap: status labels", /In progress/.test(roadmap.textContent) && /Completed/.test(roadmap.textContent) && /Upcoming/.test(roadmap.textContent));

  const actions = document.getElementById("cc-actions");
  const act = actions.querySelectorAll(".cc-action");
  check("Actions: 3 cards", act.length === 3, "got " + act.length);
  check("Actions: first card links to skill-mapping.html", !!act[0].querySelector('a[href="skill-mapping.html"]'));
  check("Actions: priority badge P1", /P1/.test(act[0].textContent));

  const insight = document.getElementById("cc-insight");
  check("Insight: generated from real context", /readiness for Backend Developer is 62%/.test(insight.textContent), insight.textContent);
  check("Insight: gap mentioned", /System Design/.test(insight.textContent));

  const hist = document.getElementById("cc-history");
  check("History: grouped Today", /Today/.test(hist.textContent));
  check("History: 1 conversation item", hist.querySelectorAll(".cc-history__item").length === 1);
  check("History: mode chip", /Skills/.test(hist.textContent));

  const chat = document.getElementById("cc-chat");
  check("Chat: welcome AI message left aligned", chat.querySelectorAll(".cc-msg--ai").length >= 1);
  check("Chat: welcome uses first name", /Hi Aniket!/.test(chat.textContent));

  // Mode switching
  const skillBtn = document.getElementById("cc-mode-skill");
  skillBtn.click();
  await tick();
  const skillBtnFresh = document.getElementById("cc-mode-skill");
  check("Mode switch: skill selected", skillBtnFresh.getAttribute("aria-selected") === "true");
  const active = document.getElementById("cc-active-mode");
  check("Mode switch: active-mode strip visible", !active.hidden && document.getElementById("cc-active-mode-name").textContent === "Skill Planning");
  check("Mode switch: system message appended", /Now focusing on Skill Planning/.test(chat.textContent));

  // Send a message through the existing chat flow
  const input = document.getElementById("cc-chat-input");
  input.value = "What should I learn next?";
  document.getElementById("cc-chat-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await tick();
  const userMsgs = chat.querySelectorAll(".cc-msg--user");
  const aiMsgs = chat.querySelectorAll(".cc-msg--ai");
  check("Chat: user message appended (right aligned)", userMsgs.length >= 1);
  check("Chat: user content correct", /What should I learn next\?/.test(userMsgs[userMsgs.length - 1].textContent));
  check("Chat: AI reply left aligned", aiMsgs.length >= 1);
  check("Chat: thinking indicator hidden after reply", document.getElementById("cc-thinking").style.display === "none");
  check("Chat: AI reply markdown bold rendered", chat.innerHTML.indexOf("<strong>") !== -1);
  check("Chat: provider label shown", /rule-based/.test(chat.textContent));
  check("Chat: timestamps rendered", chat.querySelectorAll(".cc-msg__meta").length >= 2);
  check("Chat: badge stays Fallback after reply", badge.textContent === "Fallback Mode");

  // Switch conversation via the Recent Conversations list
  hist.querySelector(".cc-history__item").click();
  await tick();
  check("History: switch loads persisted messages", /What is a skill gap\?/.test(chat.textContent));

  // New conversation
  document.getElementById("cc-new-conv").click();
  await tick();
  check("New conv: starts with welcome message", /New conversation started/.test(chat.textContent));
  check("New conv: mode pill preserved", document.getElementById("cc-mode-pill").textContent === "Skills");

  console.log("\nRESULT: " + pass + " passed, " + fail + " failed");
  process.exitCode = fail ? 1 : 0;
  dom.window.close();
})().catch((e) => { console.error("Smoke test crashed:", e); process.exit(1); });