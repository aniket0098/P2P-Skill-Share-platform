"""Append build_career_context and ai_context."""
import pathlib

content = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')

p5 = '''

def build_career_context(db, user_id):
    """Privacy-safe compact career context for the authenticated user."""
    user = db.get(User, user_id)
    educ = db.query(Education).filter(Education.user_id == user_id).order_by(
        Education.id.desc()).limit(3).all()
    skills = _skills_dict(db, user_id)
    evidence_by, evidence_total, skills_with_evidence = _evidence_by_source(db, user_id)
    learning = _learning_dict(db, user_id)
    projects = _projects_dict(db, user_id)
    sandbox = _sandbox_dict(db, user_id)
    innovation = _innovation_dict(db, user_id)
    industry = _industry_dict(db, user_id)
    role = industry.get("target_role") or {}
    gaps = industry.get("skill_gaps") or []

    gap_names = [g["skill_name"] for g in gaps]
    resources = _resources_for_gaps(db, gap_names)
    sandbox_targets = []
    if gaps:
        from models import Skill
        sid_rows = []
        for g in gaps:
            sk = db.query(Skill).filter(
                Skill.name.ilike(f"%{g['skill_name']}%")).first()
            if sk:
                sid_rows.append(sk.id)
        sandbox_targets = _sandbox_targets_for_skills(db, sid_rows)

    profile_complete = bool(
        (user and (user.skills or user.interests)) or skills
    )
    has_target = bool(role)

    return {
        "profile": {
            "first_name": _first_name(user) if user else "there",
            "role_label": (user.role if user else None),
            "bio": _clip(user.bio, 200) if user else None,
            "skills": _tokens(user.skills, 10) if user else [],
            "interests": _tokens(user.interests, 10) if user else [],
        },
        "profile_complete": profile_complete,
        "has_target": has_target,
        "education": [
            {
                "institution_name": ed.institution_name,
                "degree": ed.degree,
                "field_of_study": ed.field_of_study,
                "status": getattr(ed, "status", None),
            }
            for ed in educ
        ],
        "student_profile": _student_profile_dict(db, user_id),
        "target_role": role,
        "readiness": industry.get("readiness"),
        "skills": skills[:12],
        "skill_gaps": gaps,
        "skill_recommendations": industry.get("recommendations"),
        "evidence": {
            "total": evidence_total,
            "skills_with_evidence": skills_with_evidence,
            "by_source": evidence_by,
        },
        "learning": learning,
        "projects": projects,
        "sandbox": sandbox,
        "innovation": innovation,
        "learning_resources": resources,
        "sandbox_targets": sandbox_targets,
        "opportunities_available": False,
        "disclaimer": (industry.get("readiness") or {}).get("disclaimer")
        or "Platform industry dataset (sample data, not live market statistics).",
        "provider": {
            "configured": provider_name(),
            "ai_available": any_ai_available(),
        },
    }


def ai_context(context):
    """Trim the full context to the compact subset sent to an AI provider."""
    return {
        "profile": {
            "first_name": (context.get("profile") or {}).get("first_name", "there"),
            "skills": (context.get("profile") or {}).get("skills", []),
            "interests": (context.get("profile") or {}).get("interests", []),
        },
        "profile_complete": context.get("profile_complete"),
        "has_target": context.get("has_target"),
        "education": (context.get("education") or [])[:2],
        "target_role": context.get("target_role"),
        "readiness": context.get("readiness"),
        "skills": (context.get("skills") or [])[:8],
        "skill_gaps": (context.get("skill_gaps") or [])[:6],
        "skill_recommendations": (context.get("skill_recommendations") or [])[:5],
        "evidence": context.get("evidence"),
        "learning": {
            "total": (context.get("learning") or {}).get("total", 0),
            "completed": (context.get("learning") or {}).get("completed", 0),
            "overall_progress": (context.get("learning") or {}).get("overall_progress", 0),
            "recent": ((context.get("learning") or {}).get("recent") or [])[:5],
            "by_skill": ((context.get("learning") or {}).get("by_skill") or [])[:6],
        },
        "projects": {
            "total": (context.get("projects") or {}).get("total", 0),
            "items": ((context.get("projects") or {}).get("items") or [])[:4],
            "tech_set": (context.get("projects") or {}).get("tech_set", [])[:12],
        },
        "sandbox": {
            "joined": (context.get("sandbox") or {}).get("joined", 0),
            "items": ((context.get("sandbox") or {}).get("items") or [])[:3],
        },
        "innovation": {"ideas": ((context.get("innovation") or {}).get("ideas") or [])[:3]},
        "learning_resources": (context.get("learning_resources") or [])[:5],
        "sandbox_targets": (context.get("sandbox_targets") or [])[:4],
        "opportunities_available": context.get("opportunities_available", False),
        "disclaimer": context.get("disclaimer", ""),
    }
'''

content += p5
pathlib.Path('stage9_service.py').write_text(content, encoding='utf-8')
print('Part 5 appended:', len(content), 'chars')
