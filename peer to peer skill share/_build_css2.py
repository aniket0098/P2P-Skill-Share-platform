import pathlib
existing = pathlib.Path('ai-career-coach.css').read_text(encoding='utf-8')
addition = """
.cc-roadmap { display: flex; align-items: center; gap: .25rem; overflow-x: auto; padding: .5rem 0; }
.cc-roadmap .step { display: flex; align-items: center; gap: .25rem; font-size: .75rem; white-space: nowrap; }
.cc-roadmap .dot { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .6rem; font-weight: 700; }
.cc-roadmap .dot.done { background: #059669; color: white; }
.cc-roadmap .dot.current { background: #6366f1; color: white; box-shadow: 0 0 8px #6366f1; }
.cc-roadmap .dot.upcoming { background: #374151; color: #9ca3af; }
.cc-roadmap .arrow { color: #4b5563; font-size: .7rem; }
.cc-mission { background: linear-gradient(135deg,#1e1b4b,#312e81); border: 1px solid #4338ca; border-radius: 10px; padding: 1rem; margin-top: .75rem; }
.cc-mission h3 { font-size: .85rem; color: #a5b4fc; margin-bottom: .25rem; }
.cc-mission .title { font-weight: 700; font-size: 1rem; margin-bottom: .25rem; }
.cc-mission .reason { font-size: .8rem; color: #c4b5fd; }
.cc-actions { display: flex; flex-direction: column; gap: .5rem; margin-top: .5rem; }
.cc-action { display: flex; align-items: flex-start; gap: .5rem; padding: .5rem; background: #14151f; border-radius: 8px; border-left: 3px solid #6366f1; }
.cc-action .prio { font-size: .65rem; font-weight: 700; color: #818cf8; min-width: 1.5rem; }
.cc-action .body h4 { font-size: .85rem; margin-bottom: .15rem; }
.cc-action .body p { font-size: .75rem; color: var(--ink-2,#b0b3c7); }
.cc-chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: .5rem; padding: .5rem; background: #0f1019; border-radius: 8px; margin-bottom: .5rem; min-height: 250px; }
.cc-msg { max-width: 80%; padding: .5rem .75rem; border-radius: 10px; font-size: .85rem; line-height: 1.4; }
.cc-msg.bot { align-self: flex-start; background: #1e2030; border: 1px solid #2a2d44; white-space: pre-wrap; }
.cc-msg.user { align-self: flex-end; background: #4338ca; color: white; }
.cc-msg.error { align-self: center; background: #7f1d1d; color: #fca5a5; max-width: 100%; font-size: .75rem; }
.cc-suggestions { display: flex; flex-wrap: wrap; gap: .25rem; margin-bottom: .5rem; }
.cc-suggestion { font-size: .7rem; padding: .25rem .5rem; background: #1e2030; border: 1px solid #2a2d44; border-radius: 999px; cursor: pointer; color: #a5b4fc; }
.cc-suggestion:hover { background: #312e81; }
.cc-chat-input { display: flex; gap: .5rem; }
.cc-chat-input input { flex: 1; padding: .5rem .75rem; background: #14151f; border: 1px solid #2a2d44; border-radius: 8px; color: white; font-size: .85rem; }
.cc-chat-input input:focus { outline: none; border-color: #6366f1; }
.cc-btn { padding: .4rem .8rem; border-radius: 6px; font-size: .8rem; font-weight: 600; border: none; cursor: pointer; }
.cc-btn.primary { background: #6366f1; color: white; }
.cc-btn.secondary { background: #374151; color: white; }
.cc-btn:hover { opacity: .85; }
.cc-btn:disabled { opacity: .5; cursor: not-allowed; }
.cc-empty { text-align: center; padding: 2rem; color: var(--ink-3,#8b8fa3); font-size: .85rem; }
.cc-loading { display: flex; align-items: center; gap: .5rem; padding: 1rem; color: var(--ink-2,#b0b3c7); font-size: .85rem; }
.cc-loading .spinner { width: 16px; height: 16px; border: 2px solid #2a2d44; border-top-color: #6366f1; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cc-weekly { display: grid; grid-template-columns: repeat(7,1fr); gap: .25rem; margin-top: .5rem; }
.cc-day { padding: .25rem; background: #14151f; border-radius: 6px; font-size: .7rem; min-height: 60px; }
.cc-day .day-name { font-weight: 700; color: #818cf8; margin-bottom: .15rem; }
.cc-day.learning { border-top: 2px solid #6366f1; }
.cc-day.practice { border-top: 2px solid #22d3ee; }
.cc-day.project { border-top: 2px solid #34d399; }
.cc-day.review { border-top: 2px solid #fbbf24; }
.cc-day.rest { border-top: 2px solid #6b7280; }
""".lstrip()
pathlib.Path('ai-career-coach.css').write_text(existing + addition, encoding='utf-8')
print('CSS complete')
