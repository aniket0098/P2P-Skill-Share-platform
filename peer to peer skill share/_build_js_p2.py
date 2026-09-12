import pathlib

part2 = r"""
  function renderSnapshot(ctx, status) {
    var role = (ctx.target_role && ctx.target_role.title) || null;
    var readiness = ctx.readiness;
    var score = readiness ? readiness.score : null;
    var topGap = (ctx.skill_gaps && ctx.skill_gaps[0]) ? ctx.skill_gaps[0].skill_name : null;
    var evCount = ctx.evidence ? ctx.evidence.total : 0;
    el('cc-target-role').textContent = role || 'Set target role';
    el('cc-readiness').textContent = score !== null ? score + '%' : '\u2014';
    el('cc-top-gap').textContent = topGap || 'None';
    el('cc-evidence-count').textContent = String(evCount);
    var badge = el('cc-provider-badge');
    if (status) {
      badge.textContent = status.provider + (status.ai_available ? ' (AI)' : ' (rules)');
      badge.className = 'cc-chip ' + (status.ai_available ? 'purple' : 'grey');
    }
    var msgs = [];
    if (!ctx.profile_complete) msgs.push('Complete your profile for better recommendations.');
    if (!ctx.has_target) msgs.push('Set a target role to see personalized gaps.');
    if (ctx.learning && ctx.learning.total === 0) msgs.push('No learning activity yet.');
    if (ctx.projects && ctx.projects.total === 0) msgs.push('No projects yet.');
    el('cc-snapshot-msg').textContent = msgs.join(' ');
  }

  function renderModes(ctx, recs) {
    var container = el('cc-modes');
    var modes = [
      { id: 'career', icon: '\u{1F3AF}', label: 'Career Planning', desc: 'Roadmap for your target role' },
      { id: 'skill', icon: '\u{1F9E9}', label: 'Skill Planning', desc: 'What to learn next' },
      { id: 'learning', icon: '\u{1F4DA}', label: 'Learning', desc: 'Your learning progress' },
      { id: 'project', icon: '\u{1F4BB}', label: 'Projects', desc: 'Project recommendations' },
      { id: 'sandbox', icon: '\u{1F3E0}', label: 'Sandbox', desc: 'Industry challenges' },
      { id: 'innovation', icon: '\u{1F4A1}', label: 'Innovation', desc: 'Lab guidance' },
      { id: 'opportunity', icon: '\u{1F4BC}', label: 'Opportunities', desc: 'Coming soon' },
      { id: 'interview', icon: '\u{1F3A4}', label: 'Interview Prep', desc: 'Preparation guidance' }
    ];
    container.innerHTML = modes.map(function(m) {
      return '<div class="cc-mode" data-mode="' + m.id + '">' +
        '<span class="icon">' + m.icon + '</span>' +
        '<span><strong>' + m.label + '</strong><br><small style="color:#8b8fa3;">' + m.desc + '</small></span></div>';
    }).join('');
    container.querySelectorAll('.cc-mode').forEach(function(div) {
      div.addEventListener('click', function() {
        var mode = div.dataset.mode;
        setMode(mode);
        var targetTitle = (ctx.target_role && ctx.target_role.title) || 'professional';
        var questions = {
          career: 'How do I become a ' + targetTitle + '?',
          skill: 'What should I learn next?',
          learning: 'How is my learning progress?',
          project: 'What project should I build?',
          sandbox: 'Which Sandbox challenge should I attempt?',
          innovation: 'How can I improve my innovation project?',
          opportunity: 'What opportunities match my profile?',
          interview: 'How can I prepare for interviews?'
        };
        el('cc-chat-input').value = questions[mode] || '';
      });
    });
  }

  function setMode(mode) {
    el('cc-chat-mode').value = mode;
    document.querySelectorAll('.cc-mode').forEach(function(d) {
      d.classList.toggle('active', d.dataset.mode === mode);
    });
  }

  function renderNextMission(recs) {
    var container = el('cc-next-mission');
    if (!recs || !recs.next_mission) {
      container.innerHTML = '<p class="muted">Complete your profile to see your next mission.</p>';
      return;
    }
    var m = recs.next_mission;
    container.innerHTML = '<div style="background:#14151f;border-left:3px solid #6366f1;padding:.75rem;border-radius:0 8px 8px 0;">' +
      '<strong>' + esc(m.title) + '</strong>' +
      (m.reason ? '<p class="muted" style="margin:.25rem 0 0;font-size:.8rem;">' + esc(m.reason) + '</p>' : '') +
      (m.action ? '<p style="margin:.4rem 0 0;font-size:.85rem;color:#818cf8;">' + esc(m.action) + '</p>' : '') +
      '</div>';
  }

  function renderRoadmap(recs) {
    var container = el('cc-roadmap');
    if (!recs || !recs.roadmap || !recs.roadmap.length) {
      container.innerHTML = '<p class="muted">Roadmap unavailable.</p>';
      return;
    }
    container.innerHTML = recs.roadmap.map(function(s) {
      var color = s.status === 'completed' ? '#10b981' : (s.status === 'current' ? '#6366f1' : '#4b5563');
      var dot = '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + color + ';margin-right:.5rem;"></span>';
      return '<div style="display:flex;align-items:center;padding:.3rem 0;">' + dot +
        '<span style="flex:1;font-size:.85rem;">' + esc(s.title) + '</span>' +
        '<span class="cc-chip ' + (s.status === 'completed' ? 'green' : (s.status === 'current' ? 'purple' : 'grey')) + '">' + esc(s.status) + '</span>' +
        '</div>';
    }).join('');
  }
"""

existing = pathlib.Path('ai-career-coach.js').read_text(encoding='utf-8')
pathlib.Path('ai-career-coach.js').write_text(existing + part2, encoding='utf-8')
print('part2 OK', len(part2))
