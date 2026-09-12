/* IL8 part4a: workspace top */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
W.renderDetail = function(root){
  var d=W.S.detail, esc=W.esc;
  if(!d){ root.innerHTML='<div class="il-empty"><h3>Select an idea</h3></div>'; return; }
  var pr=d.milestone_progress||{done:0,total:0,pct:0};
  var nav=["Overview","Problem","Team","Milestones","Discussion","Feedback","Prototype","Pitch"];
  var cur=W.S.detailTab||"Overview";
  var center = W.detailCenter(d, cur);
  root.innerHTML='<button class="btn small ghost" id="d-back">Back to Ideas</button>'+
  '<div class="il-detail" style="margin-top:10px;">'+
  '<div class="il-panel il-nav"><h4>Workspace</h4>'+
  nav.map(function(n){return '<button data-nav="'+n+'" class="'+(n===cur?"active":"")+'">'+n+'</button>';}).join("")+'</div>'+
  '<div>'+center+'</div>'+
  '<div class="il-panel"><h4>Team / progress</h4>'+
  '<p style="color:#cbd5e1;font-size:12px;">'+(d.skills||[]).map(esc).join(", ")+'</p>'+
  '<div class="il-bar"><i style="width:'+pr.pct+'%"></i></div>'+
  '<p style="color:#94a3b8;font-size:12px;">'+pr.done+'/'+pr.total+' done</p>'+
  '<div class="il-actions"><a class="btn small ghost" href="skill-passport.html">Passport</a>'+
  '<a class="btn small ghost" href="career-report.html">Career Report</a></div></div></div>';
  document.getElementById("d-back").addEventListener("click", function(){ W.setTab("ideas"); });
  root.querySelectorAll("[data-nav]").forEach(function(b){
    b.addEventListener("click", function(){ W.S.detailTab=b.dataset.nav; W.renderDetail(root); }); });
  W.bindDetail(root);
};
})();
