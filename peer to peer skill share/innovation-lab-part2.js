/* IL8 part2a: cards */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
W.problemCard = function(p){
  var esc=W.esc;
  return '<div class="il-card"><div class="il-meta"><span class="il-pill '+W.srcClass(p.source)+'">'+
    esc(p.source_label||p.source)+'</span>'+
    (p.category?'<span class="il-cat">'+esc(p.category)+'</span>':'')+'</div>'+
    '<h3>'+esc(p.title)+'</h3><p>'+esc(String(p.description||"").slice(0,160))+'</p>'+
    '<div class="il-skills">'+(p.skills||[]).slice(0,4).map(function(s){
      return '<span>'+esc(s)+'</span>'; }).join("")+'</div>'+
    '<div class="il-actions"><button class="btn small primary" data-idea-from="'+p.id+'">Start Idea</button></div></div>';
};
W.ideaCard = function(i){
  var esc=W.esc;
  var pr = i.milestone_progress||{done:0,total:0,pct:0};
  return '<div class="il-card"><div class="il-meta"><span class="il-cat">'+esc(i.status||"idea")+'</span>'+
    (i.category?'<span class="il-cat">'+esc(i.category)+'</span>':'')+'</div>'+
    '<h3>'+esc(i.title)+'</h3><p>'+esc(String(i.problem_statement||i.description||"").slice(0,150))+'</p>'+
    '<div class="il-skills">'+(i.skills||[]).slice(0,4).map(function(s){
      return '<span>'+esc(s)+'</span>'; }).join("")+'</div>'+
    '<p style="font-size:11px;color:#64748b;">Milestones: '+pr.done+'/'+pr.total+' ('+pr.pct+'%)</p>'+
    '<div class="il-actions"><button class="btn small primary" data-open="'+i.id+'">Open Workspace</button>'+
    (i.is_owner?'':'<button class="btn small ghost" data-join="'+i.id+'">Join</button>')+'</div></div>';
};
})();
