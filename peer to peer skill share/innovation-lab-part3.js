/* IL8 part3: main render */
(function () {
"use strict";
var W = window.IL8; if (!W) return;
var S = W.S;
W.render = function(){
  var root = document.getElementById("il-root"); if(!root) return;
  var esc=W.esc, api=W.api;
  if (S.tab==="discover"){
    var mine = S.mine||{ideas:[],teams:[],pending_invites:[],evidence_count:0};
    var inv = (mine.pending_invites||[]).map(function(v){
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;">'+
      '<span style="color:#cbd5e1;font-size:12px;">'+esc(v.team_name)+' by '+esc(v.inviter)+'</span>'+
      '<button class="btn small primary" data-accept="'+v.id+'">Accept</button>'+
      '<button class="btn small ghost" data-reject="'+v.id+'">Reject</button></div>'; }).join("");
    root.innerHTML =
    '<h2 style="color:#f1f5f9;font-size:16px;margin:0 0 10px;">Featured Problems</h2>'+
    '<div class="il-grid">'+(S.problems.slice(0,6).map(W.problemCard).join("")||
      '<div class="il-empty"><h3>No problems yet</h3></div>')+'</div>'+
    '<h2 style="color:#f1f5f9;font-size:16px;margin:22px 0 10px;">Trending Ideas</h2>'+
    '<div class="il-grid">'+(S.ideas.slice(0,6).map(W.ideaCard).join("")||
      '<div class="il-empty"><h3>No ideas yet</h3></div>')+'</div>'+
    '<h2 style="color:#f1f5f9;font-size:16px;margin:22px 0 10px;">My Lab</h2>'+
    '<div class="il-grid"><div class="il-card"><h3>My Ideas ('+(mine.ideas||[]).length+')</h3>'+
    '<p>'+((mine.ideas||[]).slice(0,5).map(function(i){return esc(i.title);}).join(" - ")||"No innovation projects yet.")+'</p></div>'+
    '<div class="il-card"><h3>My Teams ('+(mine.teams||[]).length+')</h3>'+
    '<p>'+((mine.teams||[]).map(function(t){return esc(t.name);}).join(" - ")||"No teams yet.")+'</p></div>'+
    '<div class="il-card"><h3>Invites ('+(mine.pending_invites||[]).length+')</h3>'+
    (inv||'<p>No pending invites.</p>')+'</div>'+
    '<div class="il-card"><h3>Innovation Evidence</h3><p>'+(mine.evidence_count||0)+' items (source: innovation).</p>'+
    '<div class="il-actions"><a class="btn small ghost" href="skill-passport.html">Skill Passport</a></div></div></div>';
  } else if (S.tab==="problems"){
    root.innerHTML = '<div class="il-filters"><input id="il-q" placeholder="Search..." value="'+esc(S.search)+'">'+
    '<select id="il-cat"><option value="">All</option>'+S.cats.map(function(c){
      return '<option '+(S.category===c?"selected":"")+' value="'+esc(c)+'">'+esc(c)+'</option>'; }).join("")+'</select>'+
    '<button class="btn small ghost" id="il-apply">Apply</button></div>'+
    '<div class="il-grid">'+(S.problems.map(W.problemCard).join("")||
      '<div class="il-empty"><h3>No problems</h3></div>')+'</div>';
    document.getElementById("il-apply").addEventListener("click", async function(){
      S.search=document.getElementById("il-q").value;
      S.category=document.getElementById("il-cat").value;
      var qs="?search="+encodeURIComponent(S.search)+"&category="+encodeURIComponent(S.category);
      var d=await api("/api/innovation/problems"+qs); S.problems=d.problems||[]; W.render();
    });
  } else if (S.tab==="ideas"){
    root.innerHTML = '<div class="il-grid">'+(S.ideas.map(W.ideaCard).join("")||
      '<div class="il-empty"><h3>No ideas yet</h3><button class="btn small primary" id="il-empty-new">+ New Idea</button></div>')+'</div>';
    var b=document.getElementById("il-empty-new");
    if(b) b.addEventListener("click", function(){ W.openIdeaModal(); });
  } else if (S.tab==="mine"){
    W.boot(); W.setTabSilent("discover"); return;
  } else if (S.tab==="detail"){
    W.renderDetail(root); return;
  }
  W.bindCards(root);
};
W.bindCards = function(root){
  var api=W.api, toast=W.toast;
  root.querySelectorAll("[data-open]").forEach(function(b){
    b.addEventListener("click", function(){ W.openDetail(Number(b.dataset.open)); }); });
  root.querySelectorAll("[data-join]").forEach(function(b){
    b.addEventListener("click", async function(){
      try{ await api("/api/innovation/ideas/"+b.dataset.join+"/join",{method:"POST",body:"{}"});
        toast("Joined team"); W.boot(); }catch(e){ toast(e.message); } }); });
  root.querySelectorAll("[data-idea-from]").forEach(function(b){
    b.addEventListener("click", function(){ W.openIdeaModal(Number(b.dataset.ideaFrom)); }); });
  root.querySelectorAll("[data-accept]").forEach(function(b){
    b.addEventListener("click", async function(){
      await api("/api/innovation/invites/"+b.dataset.accept+"/accept",{method:"POST"});
      toast("Accepted"); W.boot(); }); });
  root.querySelectorAll("[data-reject]").forEach(function(b){
    b.addEventListener("click", async function(){
      await api("/api/innovation/invites/"+b.dataset.reject+"/reject",{method:"POST"});
      toast("Rejected"); W.boot(); }); });
};
W.openDetail = async function(id){
  try{
    W.S.detail = await W.api("/api/innovation/ideas/"+id);
    W.setTabSilent("detail"); W.renderDetail(document.getElementById("il-root"));
  }catch(e){ W.toast(e.message); }
};
})();
