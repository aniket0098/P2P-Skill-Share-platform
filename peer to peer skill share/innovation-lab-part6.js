/* IL8 part6: remaining sections */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
W.detailCenter2 = function(d, cur){
  var esc=W.esc;
  if(cur==="Discussion"){
    return '<div class="il-panel"><h4>Discussion</h4>'+
    '<p style="color:#94a3b8;">Team chat reuses Messages.</p>'+
    '<div class="il-actions"><button class="btn small primary" id="d-discuss2">Open Team Chat</button>'+
    '<a class="btn small ghost" href="messages.html">Messages</a>'+
    '<a class="btn small ghost" href="live-learning.html">Live Learning</a></div>'+
    (d.discussion_id?'<p style="color:#7dd3fc;font-size:12px;">Linked chat #'+d.discussion_id+'</p>':'<p style="color:#64748b;font-size:12px;">No team chat yet.</p>')+'</div>';
  }
  if(cur==="Feedback"){
    return '<div class="il-panel"><h4>Feedback</h4>'+
    (((d.feedback||[]).map(function(f){
      return '<div class="il-ms"><b style="color:#f1f5f9;font-size:13px;">'+esc(f.author_name)+
      ' ('+esc(f.author_type)+')</b><div style="color:#cbd5e1;font-size:13px;">'+esc(f.message)+'</div></div>'; }).join(""))||
      '<p style="color:#64748b;">No feedback yet.</p>')+
    '<div class="il-form"><label>Give feedback</label><textarea id="fb-msg" rows="3"></textarea>'+
    '<button class="btn small primary" id="d-fb">Submit Feedback</button></div></div>';
  }
  if(cur==="Prototype"){
    return '<div class="il-panel"><h4>Prototype</h4>'+
    (((d.linked_projects||[]).map(function(p){
      return '<div class="il-ms"><b style="color:#f1f5f9;">'+esc(p.title)+'</b>'+
      '<div class="il-actions">'+(p.github_url?'<a class="btn small ghost" target="_blank" href="'+esc(p.github_url)+'">GitHub</a>':'')+
      (p.demo_url?'<a class="btn small ghost" target="_blank" href="'+esc(p.demo_url)+'">Demo</a>':'')+'</div></div>'; }).join(""))||
      '<p style="color:#64748b;">No project linked yet.</p>')+'</div>';
  }
  if(cur==="Pitch"){
    var p=d.pitch;
    if(!p) return '<div class="il-panel"><h4>Pitch</h4><p style="color:#64748b;">No pitch yet.</p>'+
      (d.is_owner?'<button class="btn small primary" id="d-pitch-save">Create Draft</button>':"")+'</div>';
    return '<div class="il-panel"><h4>Pitch ('+esc(p.status)+')</h4>'+
      (p.review_note?'<p style="color:#7dd3fc;">'+esc(p.review_note)+'</p>':'')+
      '<div class="il-form"><label>Demo URL</label><input id="pitch-demo" value="'+esc(p.demo_url||"")+'">'+
      '<label>GitHub URL</label><input id="pitch-gh" value="'+esc(p.github_url||"")+'">'+
      '<label>Presentation URL</label><input id="pitch-pres" value="'+esc(p.presentation_url||"")+'">'+
      '<div class="il-actions">'+(d.is_owner?'<button class="btn small ghost" id="d-pitch-save">Save Draft</button>'+
      '<button class="btn small ghost" id="d-pitch-ready">Mark Ready</button>'+
      '<button class="btn small primary" id="d-pitch-submit">Submit</button>':'')+'</div></div></div>';
  }
  var pr=d.milestone_progress||{done:0,total:0,pct:0};
  return '<div class="il-panel"><h4>Idea overview</h4><h3 style="color:#f1f5f9;">'+esc(d.title)+'</h3>'+
    '<p style="color:#94a3b8;">'+esc(d.solution_summary||d.description||"")+'</p>'+
    '<p style="color:#cbd5e1;font-size:12px;">Status: <b>'+esc(d.status)+'</b></p>'+
    '<div class="il-bar"><i style="width:'+pr.pct+'%"></i></div>'+
    '<div class="il-actions">'+
    (d.is_owner?'<button class="btn small ghost" id="d-edit">Edit</button>':'')+
    ((d.is_owner||d.is_member)?'':'<button class="btn small primary" id="d-join">Join Team</button>')+
    '<button class="btn small ghost" id="d-discuss">Discuss Idea</button>'+
    ((d.is_owner||d.is_member)?'<button class="btn small ghost" id="d-ms">+ Milestone</button>'+
    '<button class="btn small ghost" id="d-link">Link Project</button>'+
    '<button class="btn small ghost" id="d-fbreq">Request Feedback</button>':'')+'</div></div>';
};
})();
