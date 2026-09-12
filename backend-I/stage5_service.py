"""Stage 5 helpers shared by main.py endpoints."""
from sqlalchemy.orm import Session
from models import IndustryDomain, IndustrySkillInsight, JobRole, RoleSkill, Skill, UserSkill
from skill_engine import EFFORT_BY_GAP, demand_band, importance_weight, level_to_num, normalize_level, readiness_band, readiness_reason, score_role

DISCLAIMER="Platform industry dataset (sample data, not live market statistics)."
def serialize_industry_skill(skill,insight=None,domain_name=None):
    demand=int(insight.demand_score) if insight and insight.demand_score is not None else 50
    growth=float(insight.growth_rate) if insight and insight.growth_rate is not None else 0.0
    return {"id":skill.id,"skill_id":skill.id,"skill_name":skill.name,"name":skill.name,"category":skill.category,"description":skill.description,"domain":domain_name,"demand_score":demand,"demand_band":demand_band(demand),"growth_rate":growth,"outlook":(insight.outlook if insight and insight.outlook else "stable"),"source_type":(insight.source_type if insight and insight.source_type else "platform_sample")}
def serialize_role(role,requirements=None):
    d={"id":role.id,"role_id":role.id,"title":role.title,"domain":(role.domain.name if getattr(role,"domain",None) else None),"domain_id":role.domain_id,"description":role.description,"experience_level":role.experience_level}
    if requirements is not None:
        d["required_skills"]=requirements;d["required_count"]=len(requirements)
    return d
def insight_map(db:Session):
    rows=db.query(IndustrySkillInsight).all();m={}
    for r in rows:
        if r.skill_id not in m or r.domain_id is not None:
            if r.skill_id in m and m[r.skill_id].domain_id is not None and r.domain_id is None: continue
            m[r.skill_id]=r
    return m
def student_map(db:Session,user_id:int):
    rows=db.query(UserSkill).filter(UserSkill.user_id==user_id).all()
    levels={};verified=set();detail={}
    # Stage 6: evidence counts feed the UI/explainability layer only.
    # Readiness math is untouched — evidence never inflates the score.
    from models import SkillEvidence as _SE
    ev_counts={}
    for e in db.query(_SE).filter(_SE.user_id==user_id).all():
        ev_counts[e.skill_id]=ev_counts.get(e.skill_id,{"total":0,"sources":[]})
        ev_counts[e.skill_id]["total"]+=1
        if e.source_type not in ev_counts[e.skill_id]["sources"]:
            ev_counts[e.skill_id]["sources"].append(e.source_type)
    for r in rows:
        num=level_to_num(r.level)
        if r.skill_id not in levels or num>levels[r.skill_id]: levels[r.skill_id]=num
        ev=bool(r.is_verified or r.verified_by or r.source_type)
        prev=detail.get(r.skill_id)
        if prev is None or num>level_to_num(prev.get("level")):
            evc=ev_counts.get(r.skill_id,{"total":0,"sources":[]})
            detail[r.skill_id]={"skill_name":(r.skill.name if r.skill else "Unknown"),"category":(r.skill.category if r.skill else None),"level":str(r.level or "beginner").lower(),"level_num":num,"is_verified":bool(r.is_verified),"evidence_label":("Verified" if r.is_verified else ("Evidence-backed" if ev else "Self-reported")),"evidence_count":evc["total"],"evidence_sources":evc["sources"]}
        if ev: verified.add(r.skill_id)
    return levels,verified,detail
def role_reqs(db:Session,role_id:int):
    out=[]
    for rs in db.query(RoleSkill).filter(RoleSkill.role_id==role_id).all():
        out.append({"skill_id":rs.skill_id,"skill_name":(rs.skill.name if rs.skill else "Unknown"),"category":(rs.skill.category if rs.skill else None),"required_level":str(rs.required_level or "intermediate").lower(),"importance":str(rs.importance or "medium").lower(),"skill_type":str(rs.skill_type or "required").lower()})
    return out


def build_gap(db:Session,user_id:int,role):
    reqs=role_reqs(db,role.id)
    levels,verified,detail=student_map(db,user_id)
    imap=insight_map(db)
    readiness,bonus=score_role([{"skill_id":r["skill_id"],"required_level":r["required_level"],"importance":r["importance"],"skill_type":r["skill_type"]} for r in reqs],levels,verified)
    band=readiness_band(readiness);items=[]
    for r in reqs:
        sid=r["skill_id"];req_num=level_to_num(r["required_level"]);stu_num=int(levels.get(sid,0) or 0)
        status="missing" if stu_num<=0 else ("matched" if stu_num>=req_num else "partial")
        gap=0 if status=="matched" else max(req_num-stu_num,0)
        ins=imap.get(sid);dem=int(ins.demand_score) if ins else 50
        gr=float(ins.growth_rate) if ins and ins.growth_rate is not None else 0.0
        out=ins.outlook if ins and ins.outlook else "stable"
        ps=importance_weight(r["importance"])*10+gap*6+dem/20+max(gr,0)/4
        pri="none" if status=="matched" else ("high" if ps>=42 else ("medium" if ps>=30 else "low"))
        ev=detail.get(sid)
        if status=="matched": reason=f"Matched {r['skill_name']}."
        elif status=="missing": reason=f"Missing {r['skill_name']}: needs {r['required_level']} ({r['importance']}, demand {dem}/100)."
        else: reason=f"{r['skill_name']} needs {r['required_level']} for {role.title}."
        items.append({"skill_id":sid,"skill_name":r["skill_name"],"category":r["category"],"status":status,"priority":pri,"student_level":(ev["level"] if ev else None),"student_level_num":stu_num,"required_level":r["required_level"],"required_level_num":req_num,"gap_levels":gap,"importance":r["importance"],"skill_type":r["skill_type"],"demand_score":dem,"demand_band":demand_band(dem),"growth_rate":gr,"outlook":out,"evidence_status":(ev["evidence_label"] if ev else "No evidence"),"estimated_effort":EFFORT_BY_GAP.get(min(gap,3)),"reason":reason})
    matched=[i for i in items if i["status"]=="matched"];partial=[i for i in items if i["status"]=="partial"];missing=[i for i in items if i["status"]=="missing"]
    gaps=sorted([i for i in items if i["status"]!="matched"],key=lambda x:(-x["gap_levels"],-importance_weight(x["importance"]),-x["demand_score"]))
    recs=[{"skill_id":g["skill_id"],"skill_name":g["skill_name"],"current_level":g["student_level"],"required_level":g["required_level"],"priority":g["priority"],"reason":g["reason"],"estimated_effort":g["estimated_effort"],"demand_score":g["demand_score"]} for g in gaps[:5]]
    return {"role":serialize_role(role,reqs),"readiness_score":readiness,"readiness_level":band,"verified_bonus":bonus,"reason":readiness_reason([m["skill_name"] for m in matched],[g["skill_name"] for g in gaps],role.title),"matched":matched,"partial":partial,"missing":missing,"items":items,"recommendations":recs,"counts":{"required":len([r for r in reqs if r["skill_type"]=="required"]),"matched":len(matched),"partial":len(partial),"missing":len(missing)}}
def resolve_role(db:Session,user,role_id=None,role_title=None):
    from fastapi import HTTPException
    from sqlalchemy import func as _func
    from models import StudentProfile as _SP
    if role_id is not None:
        role=db.query(JobRole).filter(JobRole.id==int(role_id)).first()
        if not role: raise HTTPException(status_code=404,detail="Target role not found")
        return role,"explicit"
    title=(role_title or "").strip()
    if not title and getattr(user,"role",None)=="student":
        p=db.query(_SP).filter(_SP.user_id==user.id).first()
        if p and p.target_job_role: title=p.target_job_role.strip()
    if title:
        role=db.query(JobRole).filter(_func.lower(JobRole.title)==title.lower()).first()
        if role: return role,"profile"
        like=db.query(JobRole).filter(JobRole.title.ilike(f"%{title}%")).first()
        if like: return like,"profile_fuzzy"
        raise HTTPException(status_code=404,detail="Choose a target role.")
    first=db.query(JobRole).order_by(JobRole.id).first()
    if not first: raise HTTPException(status_code=404,detail="Industry roles are temporarily unavailable.")
    return first,"default"
