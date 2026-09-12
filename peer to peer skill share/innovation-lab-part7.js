/* IL8 part7: actions */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
W.bindDetail = function(root){
  var d=W.S.detail, api=W.api, toast=W.toast;
  if(!d) return;
  function q(id){ return document.getElementById(id); }
  if(q("d-join")) q("d-join").addEventListener("click", async function(){
    await api("/api/innovation/ideas/"+d.id+"/join",{method:"POST",body:"{}"});
    toast("Joined"); W.openDetail(d.id); });
  if(q("d-edit")) q("d-edit").addEventListener("click", function(){ W.openIdeaModal(null, d); });
  async function discuss(){
    var r=await api("/api/innovation/ideas/"+d.id+"/discuss",{method:"POST"});
    window.location.href="messages.html?conv="+r.conversation_id;
  }
  if(q("d-discuss")) q("d-discuss").addEventListener("click", discuss);
  if(q("d-discuss2")) q("d-discuss2").addEventListener("click", discuss);
  if(q("d-ms")) q("d-ms").addEventListener("click", function(){
    var t=prompt("Milestone title:"); if(!t) return;
    api("/api/innovation/ideas/"+d.id+"/milestones",{method:"POST",
      body:JSON.stringify({title:t})}).then(function(){toast("Added");W.openDetail(d.id);})
      .catch(function(e){toast(e.message);}); });
  if(q("d-link")) q("d-link").addEventListener("click", async function(){
    try{
      var mine=await api("/api/users/me/projects");
      var list=(mine.projects||[]).map(function(p,i){return (i+1)+". "+p.title+" (#"+p.id+")";}).join("\n");
      if(!list){ toast("Create a project in Projects first"); return; }
      var pid=prompt("Your projects:\n"+list+"\nEnter project id:"); if(!pid) return;
      await api("/api/innovation/ideas/"+d.id+"/link-project",{method:"POST",
        body:JSON.stringify({project_id:Number(pid)})});
      toast("Project linked"); W.openDetail(d.id);
    }catch(e){ toast(e.message); } });
  if(q("d-fbreq")) q("d-fbreq").addEventListener("click", async function(){
    var m=prompt("Message (optional):")||"";
    await api("/api/innovation/ideas/"+d.id+"/feedback-request",{method:"POST",
      body:JSON.stringify({message:m})}); toast("Requested"); W.openDetail(d.id); });
  if(q("d-newteam")) q("d-newteam").addEventListener("click", async function(){
    var n=prompt("Team name:"); if(!n) return;
    await api("/api/innovation/ideas/"+d.id+"/teams",{method:"POST",
      body:JSON.stringify({name:n})}); toast("Team created"); W.openDetail(d.id); });
  if(q("d-fb")) q("d-fb").addEventListener("click", async function(){
    var m=q("fb-msg").value.trim(); if(!m){toast("Write feedback");return;}
    await api("/api/innovation/ideas/"+d.id+"/feedback",{method:"POST",
      body:JSON.stringify({message:m})}); toast("Posted"); W.openDetail(d.id); });
  root.querySelectorAll("[data-invite]").forEach(function(b){
    b.addEventListener("click", async function(){
      try{
        var res=await api("/api/users/search?q=&limit=25");
        var users=(res.users||[]).slice(0,10);
        if(!users.length){toast("No users yet");return;}
        var txt=users.map(function(u){return u.name+" (#"+u.id+")";}).join("\n");
        var pick=prompt("Invite who?\n"+txt+"\nEnter user id:"); if(!pick) return;
        await api("/api/innovation/teams/"+b.dataset.invite+"/invite",{method:"POST",
          body:JSON.stringify({user_id:Number(pick),role:"member"})});
        toast("Invite sent");
      }catch(e){toast(e.message);} }); });
  root.querySelectorAll("[data-leave]").forEach(function(b){
    b.addEventListener("click", async function(){
      await api("/api/innovation/teams/"+b.dataset.leave+"/leave",{method:"POST"});
      toast("Left team"); W.openDetail(d.id); }); });
  function msSet(id, status){
    api("/api/innovation/milestones/"+id,{method:"PUT",
      body:JSON.stringify({status:status})}).then(function(){W.openDetail(d.id);})
      .catch(function(e){toast(e.message);}); }
  root.querySelectorAll("[data-ms-todo]").forEach(function(b){
    b.addEventListener("click", function(){ msSet(b.dataset.msTodo,"todo"); }); });
  root.querySelectorAll("[data-ms-prog]").forEach(function(b){
    b.addEventListener("click", function(){ msSet(b.dataset.msProg,"in_progress"); }); });
  root.querySelectorAll("[data-ms-done]").forEach(function(b){
    b.addEventListener("click", function(){ msSet(b.dataset.msDone,"completed"); }); });
  function pitchSave(status){
    var body={status:status||"draft", title:d.title};
    var a=document.getElementById("pitch-demo"), g=document.getElementById("pitch-gh"),
        pr2=document.getElementById("pitch-pres");
    if(a&&a.value) body.demo_url=a.value;
    if(g&&g.value) body.github_url=g.value;
    if(pr2&&pr2.value) body.presentation_url=pr2.value;
    api("/api/innovation/ideas/"+d.id+"/pitch",{method:"POST",body:JSON.stringify(body)})
      .then(function(){toast("Pitch saved");W.openDetail(d.id);})
      .catch(function(e){toast(e.message);}); }
  if(q("d-pitch-save")) q("d-pitch-save").addEventListener("click", function(){pitchSave("draft");});
  if(q("d-pitch-ready")) q("d-pitch-ready").addEventListener("click", function(){pitchSave("ready");});
  if(q("d-pitch-submit")) q("d-pitch-submit").addEventListener("click", function(){pitchSave("submitted");});
};
})();
