/* Stage 5 analyze-skill bridge: real backend evidence + role relevance. */
(function(){const $=id=>document.getElementById(id);
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;");}
async function boot(){const API=window.SkillShareAPI;if(!API||!API.getToken()){window.location.href="login.html";return;}
const params=new URLSearchParams(window.location.search);
try{const roles=await API.getIndustryRoles();const sel=$("analyze-role");if(sel&&roles.roles)sel.innerHTML=roles.roles.map(r=>`<option value="${r.id}">${esc(r.title)}</option>`).join("");}catch(e){}
const btn=$("analyzeSkillBtn")||$("reanalyzeBtn");if(btn)btn.addEventListener("click",run);
const input=$("skillSearchInput")||$("skillSearch")||$("skillName");if(input)input.addEventListener("keydown",e=>{if(e.key==="Enter")run();});
if(params.get("skill")){const i=$("skillSearchInput")||$("skillSearch");if(i)i.value=params.get("skill");run();}}
async function run(){const API=window.SkillShareAPI;const out=$("analyzeResult")||$("gapList")||$("recommendedSkills");
const input=$("skillSearchInput")||$("skillSearch")||$("skillName");const q=input?input.value.trim():"";if(!q)return;
try{if(out)out.innerHTML="<p class='muted'>Analyzing…</p>";
const roleSel=$("analyze-role");const p={skill:q};if(roleSel&&roleSel.value)p.role_id=roleSel.value;
const d=await API.analyzeMySkill(p);paint(d);}catch(e){if(out)out.innerHTML=`<p class='muted'>${esc((e&&e.detail)||"Skill not found in catalog.")}</p>`;}}
function paint(d){const t=$("analyzeResult");const html=`<div class="panel"><h2>${esc(d.skill.skill_name)}</h2><p>Your level: <b>${esc(d.your_level||"not added")}</b> · Required: <b>${esc(d.required_level||"—")}</b> · Demand: <b>${d.skill.demand_score}/100 (${esc(d.skill.demand_band)})</b></p><p>Role relevance: <b>${esc(d.importance||"—")}</b> · Status: <b>${esc(d.status)}</b> · Evidence: <b>${esc(d.evidence_status)}</b> (${d.evidence.projects} projects, ${d.evidence.learning_records} learning)</p><p class="muted">${esc(d.disclaimer||"")}</p></div>`;
if(t)t.innerHTML=html;const g=$("gapList");if(g)g.innerHTML=html;}
document.addEventListener("DOMContentLoaded",boot);})();
