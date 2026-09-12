/* Stage 5 dashboard card: readiness + top gap + next skill (additive). */
(function(){async function boot(){const API=window.SkillShareAPI;if(!API||!API.getToken())return;
try{const d=await API.getSkillMapping({});const host=document.querySelector(".welcome-row div")||document.querySelector(".page-content");
if(!host||document.getElementById("s5-dash"))return;const gap=(d.items||[]).filter(x=>x.status!=="matched")[0];
const next=(d.recommendations||[])[0];const el=document.createElement("p");el.id="s5-dash";el.className="muted";
if(d.needs_profile){el.innerHTML='Complete your profile to generate your skill map. <a href="skill-mapping.html">View skill map</a>';}
else{el.innerHTML=`Industry readiness <b>${d.readiness_score}% (${d.readiness_level})</b> · Target: <b>${d.role.title}</b> · Top gap: <b>${gap?gap.skill_name:"—"}</b> · Next: <b>${next?next.skill_name:"—"}</b> · <a href="skill-mapping.html">View skill map</a>`;}
host.appendChild(el);}catch(e){}}
document.addEventListener("DOMContentLoaded",()=>setTimeout(boot,500));})();
