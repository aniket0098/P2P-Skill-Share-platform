/* Stage 5 industry-skills bridge: real backend data, keeps legacy charts. */
(function(){const API=()=>window.SkillShareAPI;let cache={at:0,data:null};
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;");}
async function insights(force){const now=Date.now();if(!force&&cache.data&&now-cache.at<60000)return cache.data;
const d=await API().getIndustryInsights({limit:100});cache={at:now,data:d};return d;}
async function boot(){if(!API())return;try{const d=await insights();paint(d);}catch(e){note("Industry insights are temporarily unavailable.");}
wire();}function note(m){const el=document.querySelector(".disclaimer,.platform-note,#insight-note");if(el)el.textContent=m;}
function wire(){const s=document.getElementById("skillSearch");const b=document.getElementById("searchBtn");
async function go(){const q=s? s.value.trim():"";try{const d=await API().getIndustrySkills(q?{search:q,limit:50}:{limit:50});paintSearch(d);}catch(e){}}
if(b)b.addEventListener("click",go);if(s)s.addEventListener("keydown",e=>{if(e.key==="Enter")go();});
const dom=document.getElementById("domainFilter");if(dom)dom.addEventListener("change",async()=>{try{const d=await API().getIndustryInsights(dom.value&&dom.value!=="all"?{domain:dom.value}:{});paint(d);}catch(e){}});
const dl=document.getElementById("downloadReportBtn");if(dl)dl.addEventListener("click",async()=>{try{const d=await insights(true);const txt=["Platform industry dataset (sample data).",...d.top_skills.map(x=>`${x.skill_name}: ${x.demand_score}/100 (${x.demand_band}), growth ${x.growth_rate}%`)].join("\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/plain"}));a.download="industry-insights.txt";a.click();}catch(e){}});}
function paint(d){const t=document.getElementById("topSkills");if(t)t.innerHTML=(d.top_skills||[]).map(x=>`<div class="skill-card"><h3>${esc(x.skill_name)}</h3><p>${x.demand_score}/100 · ${esc(x.demand_band)}</p></div>`).join("");
const f=document.getElementById("fastestGrowing");if(f)f.innerHTML=(d.fastest_growing||[]).map(x=>`<div class="row-item"><div class="grow"><h3>${esc(x.skill_name)}</h3><p>+${x.growth_rate}% · ${esc(x.outlook)}</p></div><b>${x.demand_score}</b></div>`).join("");
const e=document.getElementById("emergingSkills");if(e)e.innerHTML=(d.emerging_skills||[]).map(x=>`<div class="row-item"><div class="grow"><h3>${esc(x.skill_name)}</h3><p>${esc(x.outlook)}</p></div></div>`).join("");
note(d.disclaimer||"Platform industry dataset (sample data, not live market statistics).");}
function paintSearch(d){const t=document.getElementById("searchResults");if(!t)return;const items=d.skills||[];t.classList.add("show");t.innerHTML=items.length?items.slice(0,20).map(x=>`<div class="search-result"><strong>${esc(x.skill_name)}</strong><span> · ${x.demand_score}/100 · ${esc(x.demand_band)}</span></div>`).join(""):"<div class='search-result'>No skills found.</div>";}
document.addEventListener("DOMContentLoaded",boot);})();
