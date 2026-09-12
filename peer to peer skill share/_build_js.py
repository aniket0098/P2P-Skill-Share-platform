import pathlib
js = """
/* AI Career Coach - Stage 9 */
(function() {
  'use strict';

  const SUGGESTED_PROMPTS = [
    "What should I learn next?",
    "Why am I not ready for my target role?",
    "Review my career roadmap.",
    "Which skill gap should I fix first?",
    "Suggest my next project.",
    "How can I improve my industry readiness?",
    "What should I do this week?",
    "Which skills have strong evidence?"
  ];

  const COACH_MODES = [
    { id: 'career', name: 'Career Planning', icon: '&#127919;', desc: 'Build your path to a target role' },
    { id: 'skill', name: 'Skill Planning', icon: '&#128200;', desc: 'What to learn and in what order' },
    { id: 'learning', name: 'Learning Coach', icon: '&#128218;', desc: 'Guide your learning journey' },
    { id: 'project', name: 'Project Coach', icon: '&#128187;', desc: 'What to build and why' },
    { id: 'sandbox', name: 'Sandbox Coach', icon: '&#127981;', desc: 'Industry challenge guidance' },
    { id: 'innovation', name: 'Innovation Coach', icon: '&#128161;', desc: 'Idea and team guidance' },
    { id: 'opportunity', name: 'Opportunity Coach', icon: '&#128188;', desc: 'Jobs and internships (coming soon)' },
    { id: 'interview', name: 'Interview Prep', icon: '&#127908;', desc: 'Prepare for interviews' }
  ];

  let currentContext = null;
  let currentConvId = null;
  let currentMessages = [];
  let currentMode = 'career';

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (typeof SkillShareAPI === 'undefined') {
      document.body.innerHTML = '<p style="padding:2rem;color:#fca5a5">API client not loaded.</p>';
      return;
    }
    renderSkeleton();
    await loadContext();
    renderAll();
    bindEvents();
  }

  function renderSkeleton() {
    const main = document.querySelector('.page-content');
    if (!main) return;
    main.innerHTML = `
      <div class="cc-page">
        <div class="cc-header">
          <span class="eyebrow">Career intelligence layer</span>
          <h1>AI Career <span>Coach</span></h1>
          <p>Your career operating system — grounded in real platform data.</p>
        </div>
        <div class="cc-grid">
          <div class="cc-panel" id="ccSnapshot"><div class="cc-loading"><div class="spinner"></div> Loading career snapshot...</div></div>
          <div class="cc-panel" id="ccModes"><h2>Coach Modes</h2><div id="ccModeList"></div></div>
          <div class="cc-panel full" id="ccRoadmap"><div class="cc-loading"><div class="spinner"></div> Building roadmap...</div></div>
          <div class="cc-panel" id="ccMission"><h2>Next Mission</h2><div id="ccMissionBody"><div class="cc-loading"><div class="spinner"></div></div></div></div>
          <div class="cc-panel" id="ccActions"><h2>Recommended Actions</h2><div id="ccActionsBody"><div class="cc-loading"><div class="spinner"></div></div></div></div>
          <div class="cc-panel full" id="ccChat">
            <div class="section-head"><h2>Career Coach Chat</h2>
              <span id="ccProvider" class="cc-chip grey">connecting...</span>
            </div>
            <div class="cc-suggestions" id="ccSuggestions"></div>
            <div class="cc-chat-messages" id="ccChatMsg"></div>
            <form class="cc-chat-input" id="ccChatForm">
              <input type="text" id="ccChatInput" placeholder="Ask about your career, skills, projects..." />
              <button type="submit" class="cc-btn primary" id="ccSend">Send</button>
              <button type="button" class="cc-btn secondary" id="ccNewConv">New</button>
            </form>
          </div>
        </div>
      </div>
    `;
  }
""".lstrip()
pathlib.Path('_js_part1.js').write_text(js, encoding='utf-8')
print('js part1')
