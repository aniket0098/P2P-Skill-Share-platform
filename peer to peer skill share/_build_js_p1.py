import pathlib

part1 = r"""/* AI Career Coach - Stage 9 frontend logic */
(function() {
  'use strict';

  if (!window.SkillShareAPI || !window.SkillShareAPI.getToken()) {
    window.location.href = 'login.html';
    return;
  }

  var API = window.SkillShareAPI;
  var state = { context: null, recommendations: null, conversationId: null, loading: false };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function showLoading() {
    el('cc-loading').style.display = 'block';
    el('cc-content').style.display = 'none';
    el('cc-error').style.display = 'none';
  }
  function showContent() {
    el('cc-loading').style.display = 'none';
    el('cc-content').style.display = 'block';
    el('cc-error').style.display = 'none';
  }
  function showError(msg) {
    el('cc-loading').style.display = 'none';
    el('cc-content').style.display = 'none';
    el('cc-error').style.display = 'block';
    el('cc-error-msg').textContent = msg;
  }

  function apiSafe(call) {
    return call().catch(function(err) {
      if (err.status === 401) { window.location.href = 'login.html'; return; }
      throw err;
    });
  }

  function init() {
    showLoading();
    loadAll();
    bindEvents();
  }

  function loadAll() {
    Promise.all([
      apiSafe(API.getCareerContext),
      apiSafe(API.getCareerRecommendations),
      apiSafe(API.getCareerCoachStatus)
    ]).then(function(res) {
      state.context = res[0];
      state.recommendations = res[1];
      renderAll(res[0], res[1], res[2]);
      showContent();
    }).catch(function(err) {
      showError('Failed to load career context: ' + (err.message || 'Unknown error'));
    });
  }

  function renderAll(ctx, recs, status) {
    renderSnapshot(ctx, status);
    renderModes(ctx, recs);
    renderNextMission(recs);
    renderRoadmap(recs);
    renderActions(recs);
    renderSuggestions(ctx);
    renderConversations();
  }
"""

pathlib.Path('ai-career-coach.js').write_text(part1, encoding='utf-8')
print('part1 OK', len(part1))
