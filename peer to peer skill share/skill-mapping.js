/* Stage 5 skill-mapping: backend-owned readiness. */
(function(){const $=id=>document.getElementById(id);const S={roles:[],mapping:null,roleId:null};
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;");}
function badge(i){if(i.status==="matched")return '<span class="badge green">✓ Matched</span>';if(i.status==="partial")return '<span class="badge amber">◐ Partial</span>';return '<span class="badge red">✕ Missing</span>';}
async function boot(){if(!window.SkillShareAPI||!window.SkillShareAPI.getToken()){window.location.href="login.html";return;}
try{const d=await window.SkillShareAPI.getIndustryRoles();S.roles=d.roles||[];}catch(e){}
const sel=$("sm-role");if(sel){sel.innerHTML=S.roles.map(r=>`<option value="${r.id}">${esc(r.title)}</option>`).join("");sel.addEventListener("change",()=>{S.roleId=sel.value;load();});}
const sv=$("sm-save-role");if(sv)sv.addEventListener("click",async()=>{try{await window.SkillShareAPI.updateTargetRole({role_id:Number($("sm-role").value)});load();}catch(e){}});
load();}
async function load(){const w=$("sm-state");try{if(w)w.innerHTML="<p class='muted'>Loading…</p>";
const rid=(S.roleId||($("sm-role")&&$("sm-role").value)||null);
const d=await window.SkillShareAPI.getSkillMapping(rid?{role_id:rid}:{});S.mapping=d;S.roleId=String(d.role.id);
if($("sm-role"))$("sm-role").value=String(d.role.id);render(d);}catch(e){if(w)w.innerHTML="<p class='muted'>Industry insights are temporarily unavailable.</p>";}}
function render(d){if($("sm-role-name"))$("sm-role-name").textContent=d.role.title;
if($("sm-score"))$("sm-score").textContent=d.readiness_score+"%";
if($("sm-level"))$("sm-level").textContent=d.readiness_level;
if($("sm-reason"))$("sm-reason").textContent=d.reason;
if($("sm-gap-count"))$("sm-gap-count").textContent=((d.counts.partial||0)+(d.counts.missing||0))+" gaps";
if($("sm-source"))$("sm-source").textContent=d.disclaimer||"";
if(w0())return;const items=[...(d.matched||[]),...(d.partial||[]),...(d.missing||[])];
if($("sm-mine"))$("sm-mine").innerHTML=items.map(i=>`<div class="row-item"><div class="grow"><h3>${esc(i.skill_name)}</h3><p class="muted">${esc(i.student_level||"not added")} · ${esc(i.evidence_status||"")}</p></div>${badge(i)}</div>`).join("");
if($("sm-req"))$("sm-req").innerHTML=(d.items||[]).map(i=>`<div class="row-item"><div class="grow"><h3>${esc(i.skill_name)}</h3><p class="muted">Needs ${esc(i.required_level)} · ${esc(i.importance)} · ${i.demand_score}/100</p></div>${badge(i)}</div>`).join("");
const gaps=(d.items||[]).filter(x=>x.status!=="matched");
if($("sm-gaps"))$("sm-gaps").innerHTML=`<div class="row-item"><div class="grow"><h3>High priority</h3><p>${esc(gaps.filter(x=>x.priority==="high").map(x=>x.skill_name).join(", ")||"—")}</p></div></div><div class="row-item"><div class="grow"><h3>Medium priority</h3><p>${esc(gaps.filter(x=>x.priority==="medium").map(x=>x.skill_name).join(", ")||"—")}</p></div></div>`;
if($("sm-recs"))$("sm-recs").innerHTML=(d.recommendations||[]).map((r,i)=>`<div class="row-item"><div class="grow"><h3>${i+1}. ${esc(r.skill_name)}</h3><p>${esc(r.reason||"")}</p></div><span class="badge amber">! ${esc(r.priority)}</span></div>`).join("");}
function w0(){const w=$("sm-state");const d=S.mapping;if(d&&d.needs_profile&&w){w.innerHTML="<p class='muted'>No skills added yet. <a href='profile.html'>Add skills</a>.</p>";return true;}if(w)w.innerHTML="";return false;}
document.addEventListener("DOMContentLoaded",boot);})();
