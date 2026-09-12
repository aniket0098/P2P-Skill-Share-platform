/* Stage 8 bridges: api-client + dashboard + passport + career (additive). */
(function () {
var A = window.SkillShareAPI; if (!A) return;
async function req(path, opts){
  var t = A.getToken();
  var r = await fetch((window.SKILLSHARE_API_BASE||"http://127.0.0.1:8000")+path,
    Object.assign({headers:{"Content-Type":"application/json","Authorization":"Bearer "+t}}, opts||{}));
  if (r.status===401) throw {status:401, message:"Session expired"};
  var b=null; try{ b=await r.json(); }catch(e){}
  if(!r.ok) throw {status:r.status, message:(b&&(b.detail||b.message))||"Request failed"};
  return b;
}
if(!A.getInnovationDiscover) A.getInnovationDiscover = function(){ return req("/api/innovation/discover"); };
if(!A.getInnovationEvidence) A.getInnovationEvidence = function(){ return req("/api/innovation/evidence"); };
if(!A.getInnovationMy) A.getInnovationMy = function(){ return req("/api/innovation/my"); };

/* Dashboard: next-mission card (only when user has innovation activity). */
document.addEventListener("DOMContentLoaded", function(){
  setTimeout(async function(){
    try{
      if(!A.getToken()) return;
      var mine = await A.getInnovationMy().catch(function(){return null;});
      if(!mine) return;
      var n = (mine.ideas||[]).length + (mine.teams||[]).length;
      var host = document.querySelector(".page-content");
      if(!host || !n) return;
      if(document.getElementById("il-next")) return;
      var el = document.createElement("section");
      el.id="il-next"; el.className="panel";
      el.style.cssText="margin-bottom:14px;border-color:#8b5cf6;";
      el.innerHTML='<div class="section-head"><h2>Next Mission — Innovation Lab</h2>'+
        '<a href="innovation-lab.html">Open Lab</a></div>'+
        '<p class="muted">Validate your problem statement, complete your next milestone, and request feedback.</p>';
      host.insertBefore(el, host.firstChild);
    }catch(e){}
  }, 800);
});

/* Skill Passport: append Innovation Evidence row (real data only). */
document.addEventListener("DOMContentLoaded", function(){
  setTimeout(async function(){
    try{
      if(!A.getToken()) return;
      if(!/skill-passport/i.test(window.location.pathname)) return;
      var d = await A.getInnovationEvidence().catch(function(){return null;});
      if(!d || !d.total) return;
      var panels = document.querySelectorAll(".grid-3 .panel");
      if(!panels.length) return;
      var box = panels[panels.length-1].querySelector(".row-list");
      if(!box) return;
      var row = document.createElement("div");
      row.className="row-item";
      row.innerHTML='<div class="grow"><h3>Innovation Lab</h3><p>'+d.total+
        ' innovation evidence items (traceable to ideas/milestones/pitches)</p></div>'+
        '<span class="badge purple">Innovation</span>';
      box.appendChild(row);
    }catch(e){}
  }, 900);
});

/* Career Report: append Innovation Experience (real data only). */
document.addEventListener("DOMContentLoaded", function(){
  setTimeout(async function(){
    try{
      if(!A.getToken()) return;
      if(!/career-report/i.test(window.location.pathname)) return;
      var m = await A.getInnovationMy().catch(function(){return null;});
      if(!m) return;
      var ni=(m.ideas||[]).length, nt=(m.teams||[]).length, ne=(m.evidence_count||0);
      if(!ni && !nt && !ne) return;
      var sec = document.querySelector(".grid-2");
      if(!sec || document.getElementById("il-career")) return;
      var el=document.createElement("section");
      el.id="il-career"; el.className="panel";
      el.innerHTML='<div class="section-head"><h2>Innovation Experience</h2>'+
        '<a href="innovation-lab.html">Lab</a></div><div class="row-list">'+
        '<div class="row-item"><div class="grow"><h3>'+ni+' ideas - '+nt+' teams</h3>'+
        '<p>'+ne+' innovation evidence items feeding skill growth</p></div></div></div>';
      sec.appendChild(el);
    }catch(e){}
  }, 900);
});
})();
