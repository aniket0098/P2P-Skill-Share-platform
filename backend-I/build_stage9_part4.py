"""Append industry dict and resource matching."""
import pathlib

content = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')

p4 = '''

def _industry_dict(db, user_id):
    """Target role + requirement/gap analysis reusing Stage 5 engine."""
    from fastapi import HTTPException
    from stage5_service import build_gap, resolve_role, DISCLAIMER
    empty = {"target_role": None, "readiness": None, "skill_gaps": [],
             "recommendations": [], "counts": None}
    user = db.get(User, user_id)
    if not user:
        return empty
    try:
        role, _src = resolve_role(db, user)
    except HTTPException:
        return empty
    except Exception:
        return empty
    gap = build_gap(db, user_id, role)
    items = gap.get("matched", []) + gap.get("partial", []) + gap.get("missing", [])
    items.sort(key=lambda x: (-x.get("gap_levels", 0), x["skill_name"].lower()))
    return {
        "target_role": {
            "id": role.id,
            "title": role.title,
            "description": _clip(role.description, 180),
            "experience_level": role.experience_level,
            "domain": (role.domain.name if getattr(role, "domain", None) else None),
        },
        "readiness": {
            "score": gap.get("readiness_score"),
            "level": gap.get("readiness_level"),
            "reason": gap.get("reason"),
            "disclaimer": DISCLAIMER,
        },
        "skill_gaps": [
            {
                "skill_name": i["skill_name"],
                "status": i["status"],
                "priority": i["priority"],
                "required_level": i["required_level"],
                "student_level": i.get("student_level"),
                "gap_levels": i.get("gap_levels"),
                "reason": i.get("reason"),
                "importance": i.get("importance"),
                "demand_score": i.get("demand_score"),
                "evidence_status": i.get("evidence_status"),
                "estimated_effort": i.get("estimated_effort"),
            }
            for i in items if i["status"] != "matched"
        ][:12],
        "recommendations": gap.get("recommendations", [])[:6],
        "counts": gap.get("counts"),
    }


def _resources_for_gaps(db, gap_names):
    if not gap_names:
        return []
    out, seen = [], set()
    for name in gap_names[:6]:
        rows = db.query(LearningResource).filter(
            LearningResource.skill.ilike(f"%{name}%")).order_by(
            LearningResource.title).limit(2).all()
        for r in rows:
            if r.id in seen:
                continue
            seen.add(r.id)
            out.append({"id": r.id, "skill": r.skill, "title": r.title,
                        "provider": r.provider, "difficulty": r.difficulty,
                        "resource_type": r.resource_type, "url": r.url})
            if len(out) >= 8:
                return out
    return out


def _sandbox_targets_for_skills(db, gap_skill_ids):
    if not gap_skill_ids:
        return []
    ids = [r[0] for r in db.query(SandboxChallengeSkill.challenge_id).filter(
        SandboxChallengeSkill.skill_id.in_(gap_skill_ids)).all()]
    if not ids:
        return []
    rows = db.query(SandboxChallenge).filter(
        SandboxChallenge.id.in_(ids),
        SandboxChallenge.status == "open").order_by(
        SandboxChallenge.created_at.desc()).limit(5).all()
    out = []
    for ch in rows:
        out.append({
            "id": ch.id, "title": ch.title, "difficulty": ch.difficulty,
            "estimated_time": ch.estimated_time, "industry": ch.industry,
            "skills": [cs.skill.name for cs in ch.skills if cs.skill][:6],
            "is_demo": bool(ch.is_demo),
        })
    return out
'''

content += p4
pathlib.Path('stage9_service.py').write_text(content, encoding='utf-8')
print('Part 4 appended:', len(content), 'chars')
