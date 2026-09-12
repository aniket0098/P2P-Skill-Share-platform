/* IL8 part8: modals */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
W.openIdeaModal = function(problemId, existing){
  W.S.ideaStep=1;
  W.S.ideaDraft=existing?Object.assign({},existing):{problem_id:problemId||null};
  renderIdeaModal();
};
function renderIdeaModal(){
  var root=document.getElementById("il-modal-root"), esc=W.esc, toast=W.toast, api=W.api;
  var st=W.S.ideaStep, dr=W.S.ideaDraft;
  function fld(id,label,val,ta){
    return '<label>'+label+'</label>'+(ta?'<textarea id="'+id+'" rows="3">'+esc(val||"")+'</textarea>':'<input id="'+id+'" value="'+esc(val||"")+'">'); }
  var body="";
  if(st===1) body=fld("f-title","Idea title *",dr.title)+fld("f-cat","Category",dr.category)+fld("f-skills","Skills (comma separated)",(dr.skills||[]).join(", "));
  else if(st===2) body=fld("f-ps","Problem being solved *",dr.problem_statement,true)+fld("f-tu","Target users",dr.target_users,true);
  else body=fld("f-sol","Proposed solution",dr.solution_summary,true)+fld("f-imp","Expected impact",dr.expected_impact,true);
  root.innerHTML='<div class="il-modal"><div class="il-modal-box"><h3>'+
    (dr.id?"Edit idea":"New idea")+' - step '+st+'/3</h3>'+
    '<div class="il-steps"><span class="'+(st>=1?"on":"")+'"></span><span class="'+(st>=2?"on":"")+'"></span><span class="'+(st>=3?"on":"")+'"></span></div>'+
    '<div class="il-form">'+body+'</div>'+
    '<div class="il-actions" style="margin-top:12px;">'+
    (st>1?'<button class="btn small ghost" id="m-back">Back</button>':'<button class="btn small ghost" id="m-cancel">Cancel</button>')+
    (st<3?'<button class="btn small primary" id="m-next">Next</button>':'<button class="btn small primary" id="m-save">'+(dr.id?"Save":"Create")+'</button>')+
    '</div></div></div>';
  function collect(){
    ["f-title","f-cat","f-skills","f-ps","f-tu","f-sol","f-imp"].forEach(function(id){
      var el=document.getElementById(id); if(!el) return;
      if(id==="f-title") dr.title=el.value; if(id==="f-cat") dr.category=el.value;
      if(id==="f-skills") dr.skills=el.value.split(",").map(function(s){return s.trim();}).filter(Boolean);
      if(id==="f-ps") dr.problem_statement=el.value; if(id==="f-tu") dr.target_users=el.value;
      if(id==="f-sol") dr.solution_summary=el.value; if(id==="f-imp") dr.expected_impact=el.value; });
  }
  var c=document.getElementById("m-cancel");
  if(c) c.addEventListener("click",function(){root.innerHTML="";});
  var bk=document.getElementById("m-back");
  if(bk) bk.addEventListener("click",function(){collect();W.S.ideaStep--;renderIdeaModal();});
  var nx=document.getElementById("m-next");
  if(nx) nx.addEventListener("click",function(){collect();
    if(st===1&&!(dr.title||"").trim()){toast("Title required");return;}
    W.S.ideaStep++;renderIdeaModal();});
  var sv=document.getElementById("m-save");
  if(sv) sv.addEventListener("click",async function(){collect();
    try{
      var payload={title:dr.title,category:dr.category,skills:dr.skills,
        problem_statement:dr.problem_statement,target_users:dr.target_users,
        solution_summary:dr.solution_summary,expected_impact:dr.expected_impact,
        problem_id:dr.problem_id||null};
      var r;
      if(dr.id) r=await api("/api/innovation/ideas/"+dr.id,{method:"PUT",body:JSON.stringify(payload)});
      else r=await api("/api/innovation/ideas",{method:"POST",body:JSON.stringify(payload)});
      root.innerHTML=""; toast("Saved"); W.boot();
      if(r&&r.idea) W.openDetail(r.idea.id);
    }catch(e){toast(e.message);} });
}
W.openProblemModal = function(){
  var root=document.getElementById("il-modal-root"), toast=W.toast, api=W.api;
  root.innerHTML='<div class="il-modal"><div class="il-modal-box"><h3>Suggest a problem</h3>'+
  '<div class="il-form"><label>Title *</label><input id="p-title">'+
  '<label>Category</label><input id="p-cat">'+
  '<label>Description *</label><textarea id="p-desc" rows="3"></textarea>'+
  '<label>Skills (comma separated)</label><input id="p-skills"></div>'+
  '<div class="il-actions" style="margin-top:12px;"><button class="btn small ghost" id="p-cancel">Cancel</button>'+
  '<button class="btn small primary" id="p-save">Submit</button></div></div></div>';
  document.getElementById("p-cancel").addEventListener("click",function(){root.innerHTML="";});
  document.getElementById("p-save").addEventListener("click",async function(){
    try{
      await api("/api/innovation/problems",{method:"POST",body:JSON.stringify({
        title:document.getElementById("p-title").value,
        category:document.getElementById("p-cat").value,
        description:document.getElementById("p-desc").value,
        skills:document.getElementById("p-skills").value.split(",")})});
      root.innerHTML=""; toast("Suggested"); W.boot();
    }catch(e){toast(e.message);} });
};
})();
