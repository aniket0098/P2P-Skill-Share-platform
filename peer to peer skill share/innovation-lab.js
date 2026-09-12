/* Innovation Lab Stage 8 part 1: boot + lists. Real backend only. */
(function () {
"use strict";
var API = window.SkillShareAPI;
if (!API || !API.getToken()) { window.location.href = "login.html"; return; }
window.IL8 = window.IL8 || {};
var S = window.IL8.S || (window.IL8.S = { tab: "discover", problems: [], ideas: [],
  mine: null, detail: null, cats: [], search: "", category: "", ideaStep: 1, ideaDraft: {} });

function esc(v){ return String(v==null?"":v).replace(/&/g,"&amp;")
  .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
window.IL8.esc = esc;
function toast(m){ try{ var r=document.getElementById("toast-root"); if(!r) return;
  var t=document.createElement("div"); t.textContent=m;
  t.style.cssText="position:fixed;bottom:24px;right:24px;background:#1e293b;color:#e2e8f0;padding:12px 20px;border-radius:8px;border:1px solid #8b5cf6;z-index:9999;font-size:13px;";
  r.appendChild(t); setTimeout(function(){t.remove();},3000);}catch(e){} }
window.IL8.toast = toast;
function srcClass(s){ s=String(s||"").toLowerCase();
  if(s==="industry") return "il-src-industry"; if(s==="platform") return "il-src-platform";
  if(s==="demo") return "il-src-demo"; return "il-src-community"; }
window.IL8.srcClass = srcClass;

async function api(path, opts){
  var token = API.getToken();
  var res = await fetch((window.SKILLSHARE_API_BASE||"http://127.0.0.1:8000")+path,
    Object.assign({headers:{"Content-Type":"application/json","Authorization":"Bearer "+token}}, opts||{}));
  if (res.status===401){ window.location.href="login.html"; throw new Error("Session expired"); }
  var body=null; try{ body=await res.json(); }catch(e){}
  if(!res.ok) throw new Error((body&&(body.detail||body.message))||("Request failed ("+res.status+")"));
  return body;
}
window.IL8.api = api;

function shell(){
  var main = document.querySelector(".page-content") || document.body;
  if (document.getElementById("il-root")) return;
  main.innerHTML =
  '<div class="il-hero"><span class="eyebrow" style="color:#a78bfa;">Discover - Create - Build</span>'+
  '<h1>Innovation <span>Lab</span></h1>'+
  '<p>Discover a real problem, propose an idea, form a team, build milestones, get feedback, link your project, pitch — and earn traceable skill evidence.</p>'+
  '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">'+
  '<button class="btn small primary" id="il-new-idea">+ New Idea</button>'+
  '<button class="btn small ghost" id="il-new-problem">+ Suggest Problem</button></div></div>'+
  '<div class="il-tabs" id="il-tabs">'+
  '<button class="il-tab active" data-tab="discover">Discover</button>'+
  '<button class="il-tab" data-tab="problems">Problem Hub</button>'+
  '<button class="il-tab" data-tab="ideas">Ideas</button>'+
  '<button class="il-tab" data-tab="mine">My Lab</button>'+
  '<button class="il-tab" data-tab="detail" id="il-tab-detail" style="display:none;">Workspace</button></div>'+
  '<div id="il-root"><div class="il-empty"><h3>Loading Innovation Lab...</h3></div></div>'+
  '<div id="il-modal-root"></div>';
  document.querySelectorAll("#il-tabs .il-tab").forEach(function(b){
    b.addEventListener("click", function(){ window.IL8.setTab(b.dataset.tab); }); });
  document.getElementById("il-new-idea").addEventListener("click", function(){ window.IL8.openIdeaModal(); });
  document.getElementById("il-new-problem").addEventListener("click", function(){ window.IL8.openProblemModal(); });
}
window.IL8.setTab = function(t){ S.tab=t;
  document.querySelectorAll("#il-tabs .il-tab").forEach(function(b){
    b.classList.toggle("active", b.dataset.tab===t); });
  document.getElementById("il-tab-detail").style.display = (t==="detail"?"":"none");
  window.IL8.render();
};
window.IL8.setTabSilent = function(t){ S.tab=t;
  document.querySelectorAll("#il-tabs .il-tab").forEach(function(b){
    b.classList.toggle("active", b.dataset.tab===t); });
  document.getElementById("il-tab-detail").style.display = (t==="detail"?"":"none");
};

async function boot(){
  shell();
  try{
    var d = await api("/api/innovation/discover");
    S.problems = d.featured_problems||[]; S.mine = d.mine||null;
    var di = await api("/api/innovation/ideas?limit=50");
    S.ideas = di.ideas||[];
    var dp = await api("/api/innovation/problems");
    if (dp.problems) S.problems = dp.problems;
    if (dp.categories) S.cats = dp.categories;
  }catch(e){ toast(e.message); }
  window.IL8.render();
}
window.IL8.boot = boot;
document.addEventListener("DOMContentLoaded", boot);
})();
