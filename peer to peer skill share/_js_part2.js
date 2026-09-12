async function loadContext() {
    try {
      currentContext = await window.SkillShareAPI.getCareerCoachContext();
    } catch (err) {
      console.error('Failed to load career context:', err);
      currentContext = { error: err.message || 'Failed to load career context' };
    }
  }

  function renderAll() {
    if (!currentContext || currentContext.error) {
      renderError(currentContext ? currentContext.error : 'No context');
      return;
    }
    renderSnapshot();
    renderModes();
    renderRoadmap();
    renderMission();
    renderActions();
    renderChat();
  }

  function renderError(msg) {
    document.querySelectorAll('[id^="cc"]').forEach(el => {
      if (el.id === 'ccSnapshot' || el.id === 'ccMissionBody' || el.id === 'ccActionsBody') {
        el.innerHTML = `<div class="cc-empty">Unable to load: ${esc(msg)}</div>`;
      }
    });
  }

  function renderSnapshot() {
    const ctx = currentContext;
    const target = ctx.target_role || {};
    const readiness = ctx.readiness || {};
    const evidence = ctx.evidence || {};
    const gaps = ctx.skill_gaps || [];
    const skills = ctx.skills || [];
    const targetTitle = target.title || 'No target role set';
    const score = readiness.score;
    const level = readiness.level || 'N/A';
    const readinessChip = score >= 75 ? 'green' : score >= 50 ? 'amber' : score >= 0 ? 'red' : 'grey';
    const missingCount = gaps.filter(g => g.status === 'missing').length;
    const partialCount = gaps.filter(g => g.status === 'partial').length;
    const hasTopGap = gaps.length > 0;

    const el = document.getElementById('ccSnapshot');
    el.innerHTML = `
      <div class="section-head"><h2>Career Snapshot</h2>
        ${ctx.has_target ? '<span class="cc-chip blue">Active</span>' : '<a href="profile.html">Set target &rarr;</a>'}
      </div>
      <div class="cc-stat">
        <div><div class="label">Target Role</div><div class="value">${esc(targetTitle)}</div></div>
      </div>
      <div class="cc-stat">
        <div><div class="label">Readiness</div>
          <div class="value">${score != null ? score + '%' : 'N/A'}</div>
          <div class="meta">${esc(level)}</div>
        </div>
        ${score != null ? `<span class="cc-chip ${readinessChip}">${esc(level)}</span>` : ''}
      </div>
      <div class="cc-stat">
        <div><div class="label">Skill Gaps</div>
          <div class="value">${gaps.length}</div>
          <div class="meta">${missingCount} missing, ${partialCount} partial</div>
        </div>
      </div>
      <div class="cc-stat">
        <div><div class="label">Evidence</div>
          <div class="value">${evidence.total || 0}</div>
          <div class="meta">${evidence.skills_with_evidence || 0} skills backed</div>
        </div>
      </div>
      ${hasTopGap ? `<div class="cc-stat"><div><div class="label">Top Gap</div><div class="value" style="font-size:.95rem">${esc(gaps[0].skill_name)}</div><div class="meta">${esc(gaps[0].required_level)} required</div></div></div>` : ''}
      ${!ctx.profile_complete ? '<div style="margin-top:.5rem"><a href="profile.html" class="cc-chip purple">Complete profile for better guidance</a></div>' : ''}
      ${ctx.disclaimer ? `<div style="margin-top:.5rem;font-size:.65rem;color:var(--ink-3,#8b8fa3)">${esc(ctx.disclaimer)}</div>` : ''}
    `;
  }
