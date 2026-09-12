import pathlib
js = r"""
  function renderChat() {
    const ctx = currentContext;
    const provider = document.getElementById('ccProvider');
    if (provider) {
      const providerName = (ctx.provider && ctx.provider.configured) || 'rule';
      const aiAvailable = ctx.provider && ctx.provider.ai_available;
      provider.textContent = aiAvailable ? `AI: ${providerName}` : 'Rule-based';
      provider.className = 'cc-chip ' + (aiAvailable ? 'purple' : 'grey');
    }
    const sugg = document.getElementById('ccSuggestions');
    if (sugg) {
      sugg.innerHTML = SUGGESTED_PROMPTS.map(p => `<span class="cc-suggestion">${esc(p)}</span>`).join('');
    }
    renderMessages();
  }

  function renderMessages() {
    const el = document.getElementById('ccChatMsg');
    if (!el) return;
    if (!currentMessages.length) {
      el.innerHTML = '<div class="cc-empty">Ask me anything about your career. Try one of the suggestions above.</div>';
      return;
    }
    el.innerHTML = currentMessages.map(m => {
      const cls = m.role === 'user' ? 'user' : m.role === 'error' ? 'error' : 'bot';
      return `<div class="cc-msg ${cls}">${esc(m.content)}</div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function showTyping() {
    const el = document.getElementById('ccChatMsg');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'cc-msg bot';
    div.id = 'ccTyping';
    div.innerHTML = '<em>Thinking...</em>';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function hideTyping() {
    const t = document.getElementById('ccTyping');
    if (t) t.remove();
  }

  async function sendMessage(text) {
    if (!text || !text.trim()) return;
    currentMessages.push({ role: 'user', content: text });
    renderMessages();
    showTyping();
    const sendBtn = document.getElementById('ccSend');
    const input = document.getElementById('ccChatInput');
    if (sendBtn) sendBtn.disabled = true;
    if (input) input.disabled = true;
    try {
      const resp = await window.SkillShareAPI.careerCoachChat(text, currentConvId);
      hideTyping();
      if (resp.conversation_id) currentConvId = resp.conversation_id;
      if (resp.message) {
        currentMessages.push({ role: resp.role || 'assistant', content: resp.message });
      } else if (resp.error) {
        currentMessages.push({ role: 'error', content: 'Error: ' + resp.error });
      }
    } catch (err) {
      hideTyping();
      currentMessages.push({ role: 'error', content: err.message || 'Failed to send message' });
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (input) { input.disabled = false; input.focus(); }
      renderMessages();
    }
  }

  function bindEvents() {
    document.querySelectorAll('.cc-mode').forEach(el => {
      el.addEventListener('click', () => {
        currentMode = el.dataset.mode;
        renderModes();
        const modePrompt = getModePrompt(currentMode);
        if (modePrompt) sendMessage(modePrompt);
      });
    });
    document.querySelectorAll('.cc-suggestion').forEach(el => {
      el.addEventListener('click', () => sendMessage(el.textContent));
    });
    const form = document.getElementById('ccChatForm');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const input = document.getElementById('ccChatInput');
        if (input && input.value.trim()) {
          sendMessage(input.value.trim());
          input.value = '';
        }
      });
    }
    const newBtn = document.getElementById('ccNewConv');
    if (newBtn) {
      newBtn.addEventListener('click', async () => {
        try {
          await window.SkillShareAPI.newCareerCoachConversation(currentMode);
          currentConvId = null;
          currentMessages = [];
          renderMessages();
        } catch (err) {
          console.error('Failed to create conversation:', err);
        }
      });
    }
  }

  function getModePrompt(mode) {
    const prompts = {
      career: "Help me plan my career path.",
      skill: "What should I learn next?",
      learning: "Guide my learning journey.",
      project: "Suggest my next project.",
      sandbox: "Which sandbox challenge should I attempt?",
      innovation: "Help me with my innovation project.",
      opportunity: "What opportunities match my profile?",
      interview: "Help me prepare for interviews."
    };
    return prompts[mode] || null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
})();
""".lstrip()
pathlib.Path('_js_part4.js').write_text(js, encoding='utf-8')
print('js part4')
