"""Stage 5 seed dataset - platform sample, idempotent."""
from models import IndustryDomain, IndustrySkillInsight, JobRole, RoleSkill, Skill
DOMAINS=[("Software Engineering","Production software."),("Web Development","Web apps."),("Data Science","Stats+ML."),("AI/ML","AI systems."),("Cybersecurity","Protect systems."),("Cloud/DevOps","Cloud+pipelines."),("UI/UX","Interface design."),("Data Analytics","Dashboards.")]
SKILLS=[("Python","Programming","Backend/data/AI."),("JavaScript","Programming","Web."),("TypeScript","Programming","Typed JS."),("Java","Programming","Enterprise."),("C++","Programming","Systems."),("SQL","Databases","Queries."),("PostgreSQL","Databases","RDBMS."),("HTML","Web Development","Structure."),("CSS","Web Development","Styling."),("React","Web Development","UI lib."),("Node.js","Web Development","JS runtime."),("FastAPI","Web Development","API fw."),("REST APIs","Web Development","HTTP."),("Git","Tools","VCS."),("Docker","Cloud/DevOps","Containers."),("AWS","Cloud/DevOps","Cloud."),("Machine Learning","AI / Machine Learning","ML."),("Data Analysis","Data Science","Datasets."),("Statistics","Data Science","Stats."),("Cybersecurity","Cybersecurity","Security."),("UI/UX","Design","Interfaces."),("Communication","Soft Skills","Collab."),("Leadership","Soft Skills","Lead."),("Problem Solving","Soft Skills","Solve."),("Kubernetes","Cloud/DevOps","K8s."),("Data Visualization","Data Science","Charts.")]

ROLES=[("Software Engineer","Software Engineering","Reliable backend/systems software.","entry"),("Frontend Developer","Web Development","Accessible web interfaces.","entry"),("Backend Developer","Web Development","APIs + service logic.","entry"),("Full Stack Developer","Web Development","Frontend + backend features.","entry"),("Data Analyst","Data Analytics","Dashboards + decisions.","entry"),("Data Scientist","Data Science","Statistical/ML models.","entry"),("ML Engineer","AI/ML","Production ML systems.","entry"),("Cybersecurity Analyst","Cybersecurity","Monitoring + hardening.","entry"),("Cloud Engineer","Cloud/DevOps","Cloud infrastructure.","entry"),("DevOps Engineer","Cloud/DevOps","Delivery + reliability.","entry"),("UI/UX Designer","UI/UX","User research + design.","entry")]
ROLE_SKILLS={"Software Engineer":[("Python","advanced","critical","required"),("SQL","intermediate","high","required"),("Git","intermediate","high","required"),("REST APIs","intermediate","high","required"),("Problem Solving","intermediate","high","required"),("Communication","intermediate","medium","required")],"Frontend Developer":[("HTML","advanced","critical","required"),("CSS","advanced","critical","required"),("JavaScript","advanced","critical","required"),("React","intermediate","high","required"),("Git","intermediate","high","required"),("UI/UX","intermediate","medium","required"),("Communication","intermediate","medium","required")],"Backend Developer":[("Python","advanced","critical","required"),("FastAPI","intermediate","critical","required"),("SQL","advanced","high","required"),("PostgreSQL","intermediate","high","required"),("REST APIs","advanced","high","required"),("Git","intermediate","high","required"),("Docker","intermediate","high","required"),("Communication","intermediate","medium","required")],"Full Stack Developer":[("JavaScript","advanced","critical","required"),("React","intermediate","high","required"),("Node.js","intermediate","high","required"),("REST APIs","intermediate","high","required"),("SQL","intermediate","high","required"),("Git","intermediate","high","required"),("Docker","intermediate","medium","required"),("Communication","intermediate","medium","required")],"Data Analyst":[("SQL","advanced","critical","required"),("Data Analysis","advanced","critical","required"),("Data Visualization","intermediate","high","required"),("Statistics","intermediate","high","required"),("Python","intermediate","medium","required"),("Communication","intermediate","medium","required")],"Data Scientist":[("Python","advanced","critical","required"),("Statistics","advanced","critical","required"),("Machine Learning","intermediate","critical","required"),("SQL","advanced","high","required"),("Data Analysis","advanced","high","required"),("Data Visualization","intermediate","medium","required"),("Communication","intermediate","medium","required")],"ML Engineer":[("Python","advanced","critical","required"),("Machine Learning","advanced","critical","required"),("SQL","intermediate","high","required"),("Git","intermediate","high","required"),("Docker","intermediate","high","required"),("Statistics","intermediate","medium","required"),("Communication","intermediate","medium","required")],"Cybersecurity Analyst":[("Cybersecurity","advanced","critical","required"),("SQL","intermediate","high","required"),("Python","intermediate","high","required"),("Git","intermediate","medium","required"),("Communication","intermediate","medium","required"),("Problem Solving","advanced","high","required")],"Cloud Engineer":[("AWS","intermediate","critical","required"),("Docker","intermediate","critical","required"),("Kubernetes","intermediate","high","required"),("Git","intermediate","high","required"),("SQL","intermediate","medium","required"),("Communication","intermediate","medium","required")],"DevOps Engineer":[("Docker","advanced","critical","required"),("Git","advanced","critical","required"),("Kubernetes","intermediate","high","required"),("AWS","intermediate","high","required"),("Python","intermediate","medium","required"),("Communication","intermediate","medium","required")],"UI/UX Designer":[("UI/UX","advanced","critical","required"),("HTML","intermediate","medium","required"),("CSS","intermediate","medium","required"),("Data Analysis","intermediate","medium","required"),("Communication","advanced","high","required"),("Problem Solving","intermediate","medium","required")]}

def seed_stage5(db):
    counts={"domains":0,"skills":0,"roles":0,"role_skills":0,"insights":0}
    dom_ids={}
    for name,desc in DOMAINS:
        r=db.query(IndustryDomain).filter(IndustryDomain.name==name).first()
        if not r:
            r=IndustryDomain(name=name,description=desc);db.add(r);db.flush();counts["domains"]+=1
        dom_ids[name]=r.id
    skill_ids={}
    for name,cat,desc in SKILLS:
        r=db.query(Skill).filter(Skill.name.ilike(name)).first()
        if not r:
            r=Skill(name=name,category=cat,description=desc);db.add(r);db.flush();counts["skills"]+=1
        else:
            ch=False
            if not r.category and cat: r.category=cat;ch=True
            if not r.description and desc: r.description=desc;ch=True
            if ch: db.flush()
        skill_ids[name.lower()]=r.id
    for title,dname,desc,lvl in ROLES:
        r=db.query(JobRole).filter(JobRole.title==title).first()
        if not r:
            r=JobRole(title=title,domain_id=dom_ids.get(dname),description=desc,experience_level=lvl);db.add(r);db.flush();counts["roles"]+=1
        for sname,rlvl,imp,stype in ROLE_SKILLS.get(title,[]):
            sid=skill_ids.get(sname.lower())
            if not sid: continue
            ex=db.query(RoleSkill).filter(RoleSkill.role_id==r.id,RoleSkill.skill_id==sid).first()
            if not ex:
                db.add(RoleSkill(role_id=r.id,skill_id=sid,required_level=rlvl,importance=imp,skill_type=stype));counts["role_skills"]+=1
    for sname,dname,dem,gr,out in INSIGHTS:
        sk=db.query(Skill).filter(Skill.name.ilike(sname)).first()
        if not sk: continue
        did=dom_ids.get(dname)
        q=db.query(IndustrySkillInsight).filter(IndustrySkillInsight.skill_id==sk.id)
        q=q.filter(IndustrySkillInsight.domain_id.is_(None) if did is None else IndustrySkillInsight.domain_id==did)
        if not q.first():
            db.add(IndustrySkillInsight(skill_id=sk.id,domain_id=did,demand_score=dem,growth_rate=gr,outlook=out,period="2026",source_type="platform_sample"));counts["insights"]+=1
    db.commit();return counts

INSIGHTS=[("Python","Software Engineering",92,12.0,"high_growth"),("SQL","Data Analytics",89,9.0,"growing"),("Machine Learning","AI/ML",88,18.0,"high_growth"),("AWS","Cloud/DevOps",84,11.0,"growing"),("Cybersecurity","Cybersecurity",83,9.0,"growing"),("React","Web Development",78,6.0,"growing"),("Docker","Cloud/DevOps",81,10.0,"growing"),("FastAPI","Web Development",72,14.0,"high_growth"),("Data Analysis","Data Analytics",86,8.0,"growing"),("Statistics","Data Science",74,5.0,"stable"),("JavaScript","Web Development",80,4.0,"stable"),("TypeScript","Web Development",76,7.0,"growing"),("PostgreSQL","Software Engineering",75,6.0,"stable"),("Kubernetes","Cloud/DevOps",73,13.0,"high_growth"),("Node.js","Web Development",71,5.0,"stable"),("REST APIs","Software Engineering",77,5.0,"stable"),("Git","Software Engineering",79,3.0,"stable"),("UI/UX","UI/UX",70,6.0,"growing"),("Data Visualization","Data Analytics",74,8.0,"growing"),("Communication","Software Engineering",68,2.0,"stable"),("Problem Solving","Software Engineering",69,2.0,"stable"),("HTML","Web Development",62,1.0,"stable"),("CSS","Web Development",64,1.0,"stable"),("Java","Software Engineering",66,0.0,"stable"),("C++","Software Engineering",48,-2.0,"declining"),("Leadership","Software Engineering",55,3.0,"stable")]
