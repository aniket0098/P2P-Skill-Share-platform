"""Append context builders to stage9_service.py."""
import pathlib

content = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')

p2 = '''

def _student_profile_dict(db, user_id):
    p = db.query(StudentProfile).filter(StudentProfile.user_id == user_id).first()
    if not p: return None
    return {
        "cgpa": p.cgpa,
        "top_skills": _tokens(p.top_skills, 10),
        "programming_languages": _tokens(p.programming_languages, 10),
        "technologies": _tokens(p.technologies, 10),
        "target_job_role": (p.target_job_role or "").strip() or None,
        "preferred_industry": (p.preferred_industry or "").strip() or None,
        "looking_for": (p.looking_for or "").strip() or None,
    }


def _skills_dict(db, user_id):
    from stage5_service import insight_map
    imap = insight_map(db)
    rows = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    out = []
    for r in rows:
        ev, ev_src = 0, []
        for e in db.query(SkillEvidence).filter(
                SkillEvidence.user_id == user_id,
                SkillEvidence.skill_id == r.skill_id).all():
            ev += 1
            if e.source_type not in ev_src:
                ev_src.append(e.source_type)
        ins = imap.get(r.skill_id)
        out.append({
            "skill_name": r.skill.name if r.skill else "Unknown",
            "category": r.skill.category if r.skill else None,
            "level": normalize_level(r.level),
            "level_num": level_to_num(r.level),
            "self_rating": r.self_rating,
            "evidence_count": ev,
            "evidence_sources": ev_src[:4],
            "is_verified": bool(r.is_verified),
            "demand_score": int(ins.demand_score) if ins and ins.demand_score is not None else None,
        })
    out.sort(key=lambda x: (-x["level_num"], -x["evidence_count"], x["skill_name"].lower()))
    return out


def _learning_dict(db, user_id):
    rows = db.query(LearningRecord).filter(LearningRecord.user_id == user_id).order_by(
        LearningRecord.updated_at.desc()).all()
    items = []
    for r in rows[:10]:
        resource_title = r.resource_title
        if not resource_title and getattr(r, "resource", None) is not None:
            resource_title = r.resource.title
        items.append({
            "skill_name": (r.skill_name or "General").strip(),
            "resource_title": resource_title,
            "resource_type": r.resource_type,
            "progress": r.progress_percentage or 0,
            "status": r.status,
            "updated_at": _iso(r.updated_at),
        })
    total = len(rows)
    done = sum(1 for r in rows if (r.status or "").lower() in ("completed", "done") or (r.progress_percentage or 0) >= 100)
    avg = round(sum((r.progress_percentage or 0) for r in rows) / total, 1) if total else 0.0
    by_skill = {}
    for r in rows:
        key = (r.skill_name or "General").strip() or "General"
        e = by_skill.setdefault(key, {"skill": key, "count": 0, "psum": 0.0, "completed": 0})
        e["count"] += 1
        e["psum"] += float(r.progress_percentage or 0)
        if (r.status or "").lower() == "completed" or (r.progress_percentage or 0) >= 100:
            e["completed"] += 1
    sp = [{"skill": k, "count": v["count"], "completed": v["completed"],
           "avg_progress": round(v["psum"] / v["count"], 1)} for k, v in by_skill.items()]
    sp.sort(key=lambda x: (-x["count"], -x["avg_progress"]))
    return {"total": total, "completed": done, "overall_progress": round(avg, 1),
            "recent": items, "by_skill": sp[:8]}
'''

content += p2
pathlib.Path('stage9_service.py').write_text(content, encoding='utf-8')
print('Part 2 appended:', len(content), 'chars')
