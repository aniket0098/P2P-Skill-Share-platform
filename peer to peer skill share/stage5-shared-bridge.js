/* Stage 5 shared bridges: profile/passport/career consume same backend gap. */
(function(){async function boot(){const API=window.SkillShareAPI;if(!API||!API.getToken())return;
try{const d=await API.getSkillMapping({});
const pp=document.querySelector(".page-content");
if(pp&&!document.getElementById("s5-shared")&&(window.location.pathname.includes("career-report")||window.location.pathname.includes("skill-passport")||window.location.pathname.includes("profile"))){
const el=document.createElement("section");el.className="panel mt";el.id="s5-shared";
if(d.needs_profile){el.innerHTML="<h2>Industry readiness</h2><p class='muted'>Complete your profile to generate your skill map.</p>";}
else{el.innerHTML=`<h2>Industry readiness — ${d.role.title}: ${d.readiness_score}% (${d.readiness_level})</h2><p>${d.reason}</p><p class='muted'>${d.disclaimer||""}</p>`;}
pp.appendChild(el);}}catch(e){}}
document.addEventListener("DOMContentLoaded",()=>setTimeout(boot,600));})();
