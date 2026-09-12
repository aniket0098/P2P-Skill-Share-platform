import pathlib
import pathlib
part1 = """
/* AI Career Coach - Stage 9 */
.cc-page { max-width: 1200px; margin: 0 auto; }
.cc-header { margin-bottom: 1.5rem; }
.cc-header .eyebrow { font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-3,#8b8fa3); }
.cc-header h1 { font-size: 1.6rem; font-weight: 800; margin: .25rem 0; }
.cc-header h1 span { background: linear-gradient(135deg,#6366f1,#22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.cc-header p { color: var(--ink-2,#b0b3c7); font-size: .9rem; }
.cc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.cc-grid .full { grid-column: 1/-1; }
@media (max-width: 900px) { .cc-grid { grid-template-columns: 1fr; } }
.cc-panel { background: var(--panel,#1e2030); border: 1px solid var(--border,#2a2d44); border-radius: 12px; padding: 1rem; }
.cc-panel h2 { font-size: 1rem; font-weight: 700; margin-bottom: .75rem; }
.cc-panel .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
.cc-panel .section-head a { font-size: .8rem; color: #818cf8; text-decoration: none; }
.cc-stat { display: flex; align-items: center; gap: .75rem; padding: .75rem 0; border-bottom: 1px solid var(--border,#2a2d44); }
.cc-stat:last-child { border-bottom: none; }
.cc-stat .label { font-size: .85rem; color: var(--ink-2,#b0b3c7); }
.cc-stat .value { font-weight: 700; font-size: 1.1rem; }
.cc-stat .meta { font-size: .75rem; color: var(--ink-3,#8b8fa3); }
.cc-chip { display: inline-block; padding: .2rem .6rem; border-radius: 999px; font-size: .7rem; font-weight: 600; }
.cc-chip.green { background: #064e3b; color: #6ee7b7; }
.cc-chip.amber { background: #78350f; color: #fcd34d; }
.cc-chip.red { background: #7f1d1d; color: #fca5a5; }
.cc-chip.blue { background: #1e3a5f; color: #93c5fd; }
.cc-chip.grey { background: #374151; color: #d1d5db; }
.cc-chip.purple { background: #4c1d95; color: #c4b5fd; }
.cc-mode { display: flex; align-items: center; gap: .5rem; padding: .5rem; border-radius: 8px; background: #14151f; margin-bottom: .5rem; cursor: pointer; border: 1px solid transparent; }
.cc-mode:hover { border-color: #4f46e5; }
.cc-mode.active { border-color: #6366f1; background: #1e1b4b; }
.cc-mode .icon { font-size: 1.2rem; }
.cc-mode .name { font-weight: 600; font-size: .85rem; }
.cc-mode .desc { font-size: .7rem; color: var(--ink-3,#8b8fa3); }
""".lstrip()
pathlib.Path('ai-career-coach.css').write_text(part1, encoding='utf-8')
print('part1 done')
