/* IL8 part5a */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
W.detailCenter = function(d, cur){
  var esc=W.esc;
  var pr=d.milestone_progress||{done:0,total:0,pct:0};
  if(cur==="Problem"){
    return '<div class="il-panel"><h4>Problem</h4><p style="color:#e2e8f0;">'+esc(d.problem_statement||"")+'</p>'+
    '<p style="color:#94a3b8;">Target: '+esc(d.target_users||"-")+'</p>'+
    '<p style="color:#94a3b8;">Impact: '+esc(d.expected_impact||"-")+'</p></div>';
  }
  if(cur==="Team"){
    var cov=d.coverage||{covered:[],missing:[]};
    return '<div class="il-panel"><h4>Team coverage</h4>'+
    '<div class="il-cov">'+cov.covered.map(function(s){return '<span class="ok">'+esc(s)+'</span>';}).join("")+
    cov.missing.map(function(s){return '<span class="miss">'+esc(s)+'</span>';}).join("")+'</div>'+
    (d.teams||[]).map(function(t){
      return '<div style="margin-top:10px;border:1px solid #334155;border-radius:8px;padding:10px;">'+
      '<b style="color:#f1f5f9;">'+esc(t.name)+' ('+t.member_count+')</b>'+
      t.members.map(function(m){return '<div style="color:#cbd5e1;font-size:12px;">'+esc(m.name)+' - '+esc(m.role)+'</div>';}).join("")+
      (((d.is_owner||d.is_member))?'<div class="il-actions"><button class="btn small ghost" data-invite="'+t.id+'">Invite</button>'+
      '<button class="btn small ghost" data-leave="'+t.id+'">Leave</button></div>':'')+'</div>'; }).join("")+
    (((d.is_owner||d.is_member))?'<div class="il-actions"><button class="btn small ghost" id="d-newteam">Create Team</button></div>':'')+'</div>';
  }
  if(cur==="Milestones"){
    return '<div class="il-panel"><h4>Milestones</h4>'+
    ((d.milestones||[]).map(function(m){
      return '<div class="il-ms"><b style="color:#f1f5f9;font-size:13px;">'+esc(m.title)+'</b>'+
      '<div style="color:#94a3b8;font-size:12px;">'+esc(m.description||"")+' ('+esc(m.status)+')</div>'+
      (((d.is_owner||d.is_member))?'<div class="il-actions"><button class="btn small ghost" data-ms-todo="'+m.id+'">Todo</button>'+
      '<button class="btn small ghost" data-ms-prog="'+m.id+'">Start</button>'+
      '<button class="btn small primary" data-ms-done="'+m.id+'">Complete</button></div>':'')+'</div>'; }).join("")||
      '<p style="color:#64748b;">No milestones yet.</p>')+'</div>';
  }
  return W.detailCenter2(d, cur);
};
})();
