import pathlib
js = r"""
  function renderModes() {
    const list = document.getElementById('ccModeList');
    list.innerHTML = COACH_MODES.map(m => `
      <div class="cc-mode ${m.id === currentMode ? 'active' : ''}" data-mode="${m.id}">
        <span class="icon">${m.icon}</span>
        <div><div class="name">${esc(m.name)}</div><div class="desc">${esc(m.desc)}</div></div>
      </div>
    `).join('');
  }

  function renderRoadmap() {
    const roadmap = (currentContext.roadmap || currentContext.recommendations?.roadmap || []);
    const el = document.getElementById('ccRoadmap');
    if (!roadmap.length) {
      el.innerHTML = '<h2>Career Roadmap</h2><div class="cc-empty">Set a target role to see your roadmap.</div>';
      return;
    }
    const steps = roadmap.map((s, i) => {
      const dotClass = s.status === 'completed' ? 'done' : s.status === 'current' ? 'current' : 'upcoming';
      const label = s.status === 'completed' ? '✓' : String(i + 1);
      const arrow = i < roadmap.length - 1 ? '<span class="arrow">&rarr;</span>' : '';
      return `<div class="step"><div class="dot ${dotClass}">${label}</div><span>${esc(s.title)}</span>${arrow}</div>`;
    }).join('');
    el.innerHTML = `<div class="section-head"><h2>Career Roadmap</h2><span class="cc-chip purple">${roadmap.filter(s => s.status === 'completed').length}/${roadmap.length} done</span></div><div class="cc-roadmap">${steps}</div>`;
  }

  function renderMission() {
    const mission = currentContext.next_mission || (currentContext.recommendations && currentContext.recommendations.next_mission);
    const el = document.getElementById('ccMissionBody');
    if (!mission) {
      el.innerHTML = '<div class="cc-empty">Set a target role to get your next mission.</div>';
      return;
    }
    el.innerHTML = `
      <div class="cc-mission">
        <h3>Your next mission</h3>
        <div class="title">${esc(mission.title)}</div>
        <div class="reason">${esc(mission.reason || '')}</div>
        ${mission.action ? `<div style="margin-top:.5rem;font-size:.8rem;color:#c4b5fd"><strong>Action:</strong> ${esc(mission.action)}</div>` : ''}
      </div>
    `;
  }

  function renderActions() {
    const actions = (currentContext.recommended_actions || (currentContext.recommendations && currentContext.recommendations.recommended_actions) || []);
    const el = document.getElementById('ccActionsBody');
    if (!actions.length) {
      el.innerHTML = '<div class="cc-empty">No specific actions right now. Keep building!</div>';
      return;
    }
    el.innerHTML = '<div class="cc-actions">' + actions.map(a => `
      <div class="cc-action">
        <span class="prio">P${a.priority || 1}</span>
        <div class="body"><h4>${esc(a.title)}</h4><p>${esc(a.reason || '')}</p></div>
      </div>
    `).join('') + '</div>';
  }
""".lstrip()
pathlib.Path('_js_part3.js').write_text(js, encoding='utf-8')
print('js part3')
