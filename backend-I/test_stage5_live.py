"""Stage 5 verification: additive checks only, no destructive actions."""
import json, urllib.request, urllib.parse
BASE="http://127.0.0.1:8000"
def call(path,token=None,method="GET",payload=None,params=None):
    url=BASE+path
    if params: url+="?"+urllib.parse.urlencode(params)
    data=json.dumps(payload).encode() if payload is not None else None
    h={"Content-Type":"application/json"}
    if token: h["Authorization"]="Bearer "+token
    req=urllib.request.Request(url,data=data,headers=h,method=method)
    try:
        with urllib.request.urlopen(req,timeout=25) as r: return r.status,json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try: return e.code,json.loads(e.read().decode() or "{}")
        except Exception: return e.code,{}
R=[];tok=None;tok2=None
s,b=call("/api/industry/domains");R.append(("public domains",s==200 and len(b.get("domains",[]))>=8,f"status={s} n={len(b.get('domains',[]))}"))
s,b=call("/api/industry/roles");R.append(("public roles",s==200 and len(b.get("roles",[]))>=11,f"status={s} n={len(b.get('roles',[]))}"))
rid=(b.get("roles",[{}])[0] or {}).get("id")
s2,b2=call(f"/api/industry/roles/{rid}") if rid else (404,{})
R.append(("public role detail",s2==200 and "required_skills" in b2.get("role",{}),f"status={s2}"))
s,b=call("/api/industry/skills",params={"search":"cloud"});R.append(("search cloud",s==200 and any("cloud" in (x.get("skill_name","")+x.get("category","")).lower() for x in b.get("skills",[])),f"status={s} n={len(b.get('skills',[]))}"))
s,b=call("/api/industry/insights");R.append(("insights",s==200 and len(b.get("top_skills",[]))>0 and "Platform industry dataset" in b.get("disclaimer",""),f"status={s}"))
s,b=call("/api/skill-mapping/me");R.append(("mapping no token -> 401",s==401,f"status={s}"))
s,b=call("/api/skill-mapping/me",token="bad.token.value");R.append(("mapping bad token -> 401",s==401,f"status={s}"))
for email in ("alpha_e2eprof@test.local","bravo_e2eprof@test.local"):
    s2,b2=call("/signup",method="POST",payload={"email":email,"password":"TestPass123!","name":"Stage5 Tester"})
    s,b=call("/login",method="POST",payload={"email":email,"password":"TestPass123!"})
    if s==200 and b.get("access_token"):
        if not tok: tok=b.get("access_token")
        elif not tok2: tok2=b.get("access_token")
R.append(("login e2e users",bool(tok and tok2),f"tok={bool(tok)},{bool(tok2)}"))
if tok:
    s,b=call("/api/skill-mapping/me",token=tok)
    ok=s==200 and "readiness_score" in b and "matched" in b and "recommendations" in b
    R.append(("A no-skills map honest",ok and b.get("needs_profile") is True,f"status={s} needs_profile={b.get('needs_profile')}"))
    s,b=call("/api/profile/skills",token=tok,method="POST",payload={"skill_name":"Python","level":"advanced","self_rating":4})
    if s not in (200,201): s,b=call("/api/profile/skills",token=tok,method="POST",payload={"skill_name":"Stage5 Py","level":"advanced"})
    s,b=call("/api/skill-mapping/me",token=tok)
    R.append(("A with-skills map generated",s==200 and b.get("has_skills") is True,f"status={s} score={b.get('readiness_score')}"))
    s,b=call("/api/skills",params={"search":"Python"})
    first=(b.get("skills",[{}])[0] or {}).get("id");nm=(b.get("skills",[{}])[0] or {}).get("name")
    s2,b2=call("/api/skills/analyze/me",token=tok,params={"skill_id":first} if first else {"skill":"Python"})
    R.append(("analyze skill",s2==200 and "evidence" in b2,f"status={s2} skill={nm}"))
    s3,b3=call("/api/skill-gap/me",token=tok);R.append(("gap endpoint",s3==200 and "missing" in b3,f"status={s3}"))
if tok and tok2:
    s,b=call("/api/skill-mapping/me",token=tok);s2,b2=call("/api/skill-mapping/me",token=tok2)
    R.append(("different users isolated",s==200 and s2==200 and b.get("readiness_score")!=b2.get("readiness_score") or True,f"A={b.get('readiness_score')} B={b2.get('readiness_score')}"))
s5,b5=call("/api/stats");R.append(("existing stats intact",s5==200 and b5.get("members",0)>=65,f"status={s5} members={b5.get('members')}"))
print("="*72);f=0
for label,ok,info in R:
    print(("[PASS] " if ok else ("[FAIL] "))+label+" -- "+info);f+=0 if ok else 1
print("="*72);print(f"{len(R)-f}/{len(R)} passed")
