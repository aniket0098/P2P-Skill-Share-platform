"""Append projects, sandbox, innovation dicts."""
import pathlib

content = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')

p3a = '''

def _projects_dict(db, user_id):
    rows = db.query(Project).filter(Project.owner_id == user_id).order_by(
        Project.updated_at.desc()).all()
    items = []
    tech = []
    for p in rows[:8]:
        pts = _tokens(p.technologies, 12)
        tech.extend(pts)
        items.append({
            "title": p.title,
            "status": p.status or "draft",
            "technologies": pts,
            "has_github": bool((p.github_url or "").strip()),
            "has_demo": bool((p.demo_url or "").strip()),
            "updated_at": _iso(p.updated_at),
        })
    return {"total": len(rows), "items": items, "tech_set": list(dict.fromkeys(tech))[:20]}


def _sandbox_dict(db, user_id):
    parts = db.query(SandboxParticipant).filter(SandboxParticipant.user_id == user_id).order_by(
        SandboxParticipant.started_at.desc()).all()
    items = []
    for p in parts[:8]:
        ch = db.get(SandboxChallenge, p.challenge_id)
        if not ch:
            continue
        items.append({
            "id": ch.id,
            "title": ch.title,
            "status": p.status,
            "difficulty": ch.difficulty,
            "skills": [cs.skill.name for cs in ch.skills if cs.skill][:6],
            "is_demo": bool(ch.is_demo),
            "completed_at": _iso(p.completed_at),
        })
    n_submitted = db.query(SandboxSubmission).filter(SandboxSubmission.user_id == user_id).count()
    by_src, _, _ = _evidence_by_source(db, user_id)
    return {"joined": len(parts), "submitted": n_submitted,
            "evidence": by_src.get("sandbox", 0),
            "items": items}


def _innovation_dict(db, user_id):
    owned_ids = [i.id for i in db.query(InnovationIdea).filter(
        InnovationIdea.owner_id == user_id).all()]
    joined_ids = [r[0] for r in db.query(InnovationTeam.idea_id).join(
        InnovationTeamMember, InnovationTeam.id == InnovationTeamMember.team_id
    ).filter(
        InnovationTeamMember.user_id == user_id,
        InnovationTeamMember.status == "active",
        InnovationTeam.idea_id.isnot(None),
    ).distinct().all() if r[0]]
    idea_ids = list(dict.fromkeys(owned_ids + joined_ids))
    items = []
    for iid in idea_ids[:6]:
        idea = db.get(InnovationIdea, iid)
        if not idea:
            continue
        skills = [s.skill.name for s in db.query(InnovationIdeaSkill).filter(
            InnovationIdeaSkill.idea_id == iid).all() if s.skill]
        ms_done = db.query(InnovationMilestone).filter(
            InnovationMilestone.idea_id == iid,
            InnovationMilestone.status == "completed").count()
        fb = db.query(InnovationFeedback).filter(InnovationFeedback.idea_id == iid).count()
        items.append({
            "id": iid,
            "title": idea.title,
            "status": idea.status,
            "skills": skills[:8],
            "owner": idea.owner_id == user_id,
            "milestones_completed": ms_done,
            "feedback_count": fb,
            "updated_at": _iso(idea.updated_at),
        })
    return {"ideas": items}
'''

content += p3a
pathlib.Path('stage9_service.py').write_text(content, encoding='utf-8')
print('Part 3a appended:', len(content), 'chars')
