"""Stage 10 — CareerVerse aggregation layer.

CareerVerse does NOT independently calculate everything. It aggregates
existing platform data (profile, skills, evidence, learning, projects,
sandbox, innovation, readiness) and presents the student's career journey.

Recording hooks (record_career_event, record_*_event) write CareerEvent rows
at real user actions. Every event is traceable to its source.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models import (
    CareerEvent,
    CareerGoal,
    Education,
    IndustryDomain,
    InnovationIdea,
    InnovationMilestone,
    LearningRecord,
    Project,
    SandboxChallenge,
    SandboxParticipant,
    SandboxSubmission,
    SkillEvidence,
    StudentProfile,
    User,
    UserSkill,
)
from skill_engine import level_to_num, readiness_band
import stage5_service as s5
import stage9_service as s9


# ---------------------------------------------------------------------------
# Career event recording hooks
# ---------------------------------------------------------------------------

def _meta(extra: dict | None) -> str | None:
    if not extra:
        return None
    try:
        return json.dumps(extra, default=str)[:2000]
    except Exception:
        return None


def record_career_event(
    db: Session,
    *,
    user_id: int,
    event_type: str,
    title: str,
    description: str | None = None,
    source_type: str = "system",
    source_id: int | None = None,
    extra: dict | None = None,
    created_at: datetime | None = None,
) -> CareerEvent | None:
    """Record one career-level event. Idempotent on (user, type, source).

    Returns the event row, or None if a duplicate already exists.
    Never raises on duplicate — safe to call from hot paths.
    """
    existing = db.query(CareerEvent).filter(
        CareerEvent.user_id == user_id,
        CareerEvent.event_type == event_type,
        CareerEvent.source_type == source_type,
        CareerEvent.source_id == source_id,
    ).first()
    if existing is not None:
        return None
    row = CareerEvent(
        user_id=user_id,
        event_type=event_type,
        title=title,
        description=description,
        source_type=source_type,
        source_id=source_id,
        metadata_json=_meta(extra),
    )
    if created_at is not None:
        row.created_at = created_at
    db.add(row)
    db.flush()
    return row


def backfill_career_events(db: Session, user_id: int) -> int:
    """Generate career events from a user's EXISTING historical data.

    Called on first CareerVerse visit (and by seed script). Only creates
    events that do not already exist. Returns count of events created.
    """
    created = 0

    profile = db.query(StudentProfile).filter(StudentProfile.user_id == user_id).first()
    if profile and profile.created_at:
        if record_career_event(
            db, user_id=user_id, event_type="profile_completed",
            title="Profile completed",
            description="Academic and career profile set up.",
            source_type="profile", source_id=profile.id,
            created_at=profile.created_at,
        ):
            created += 1

    first_us = db.query(UserSkill).filter(
        UserSkill.user_id == user_id
    ).order_by(UserSkill.id.asc()).first()
    if first_us:
        ts = first_us.created_at or (profile.created_at if profile else None)
        if record_career_event(
            db, user_id=user_id, event_type="skill_analyzed",
            title="Skill analysis started",
            description="First skill mapped to your profile.",
            source_type="skill", source_id=first_us.skill_id,
            created_at=ts,
        ):
            created += 1

    for rec in db.query(LearningRecord).filter(
        LearningRecord.user_id == user_id
    ).order_by(LearningRecord.id.asc()).all():
        ts = rec.created_at or rec.updated_at
        if record_career_event(
            db, user_id=user_id, event_type="learning_started",
            title=f"Started learning: {rec.skill_name}",
            description=rec.resource_title,
            source_type="learning", source_id=rec.id,
            created_at=ts,
        ):
            created += 1
        if rec.status == "completed":
            done_ts = rec.updated_at or rec.created_at
            if record_career_event(
                db, user_id=user_id, event_type="learning_completed",
                title=f"Completed learning: {rec.skill_name}",
                description=rec.resource_title,
                source_type="learning", source_id=rec.id,
                created_at=done_ts,
            ):
                created += 1

    for proj in db.query(Project).filter(
        Project.owner_id == user_id
    ).order_by(Project.id.asc()).all():
        ts = proj.created_at
        if record_career_event(
            db, user_id=user_id, event_type="project_created",
            title=f"Project created: {proj.title}",
            description=proj.description,
            source_type="project", source_id=proj.id,
            created_at=ts,
        ):
            created += 1
        if str(proj.status or "").lower() in ("published", "completed"):
            if record_career_event(
                db, user_id=user_id, event_type="project_completed",
                title=f"Project completed: {proj.title}",
                description=None,
                source_type="project", source_id=proj.id,
                created_at=proj.updated_at or ts,
            ):
                created += 1

    for part in db.query(SandboxParticipant).filter(
        SandboxParticipant.user_id == user_id
    ).order_by(SandboxParticipant.id.asc()).all():
        ch = db.query(SandboxChallenge).filter(
            SandboxChallenge.id == part.challenge_id
        ).first()
        ch_title = ch.title if ch else "Industry Sandbox challenge"
        if record_career_event(
            db, user_id=user_id, event_type="sandbox_started",
            title=f"Sandbox started: {ch_title}",
            description=None,
            source_type="sandbox", source_id=part.challenge_id,
            created_at=part.joined_at,
        ):
            created += 1

    for sub in db.query(SandboxSubmission).filter(
        SandboxSubmission.user_id == user_id
    ).order_by(SandboxSubmission.id.asc()).all():
        ch = db.query(SandboxChallenge).filter(
            SandboxChallenge.id == sub.challenge_id
        ).first()
        ch_title = ch.title if ch else "challenge"
        if record_career_event(
            db, user_id=user_id, event_type="sandbox_submitted",
            title=f"Sandbox submitted: {ch_title}",
            description=f"Attempt #{sub.attempt}",
            source_type="sandbox", source_id=sub.id,
            created_at=sub.submitted_at,
        ):
            created += 1
        if sub.status == "evaluated":
            if record_career_event(
                db, user_id=user_id, event_type="sandbox_evaluated",
                title=f"Sandbox evaluated: {ch_title}",
                description=f"Score {sub.score}/100" if sub.score is not None else None,
                source_type="sandbox", source_id=sub.id,
                created_at=sub.evaluated_at or sub.submitted_at,
            ):
                created += 1

    for idea in db.query(InnovationIdea).filter(
        InnovationIdea.owner_id == user_id
    ).order_by(InnovationIdea.id.asc()).all():
        if record_career_event(
            db, user_id=user_id, event_type="innovation_created",
            title=f"Innovation created: {idea.title}",
            description=idea.description,
            source_type="innovation", source_id=idea.id,
            created_at=idea.created_at,
        ):
            created += 1
        ms = db.query(InnovationMilestone).filter(
            InnovationMilestone.idea_id == idea.id,
            InnovationMilestone.status == "completed",
        ).order_by(InnovationMilestone.id.asc()).all()
        for m in ms:
            if record_career_event(
                db, user_id=user_id, event_type="innovation_milestone",
                title=f"Milestone: {m.title}",
                description=f"On idea: {idea.title}",
                source_type="innovation", source_id=m.id,
                created_at=m.completed_at or m.created_at,
            ):
                created += 1

def _iso(dt):
    return dt.isoformat() if dt else None


def _compute_journey_progress(
    *,
    has_profile: bool,
    skill_count: int,
    learning_total: int,
    project_total: int,
    sandbox_joined: int,
    innovation_ideas: int,
    readiness_score: float | None,
) -> int:
    """Deterministic journey progress (0-100) from real data presence."""
    pct = 0
    if has_profile:
        pct += 15
    pct += min(skill_count * 3, 15)
    pct += min(learning_total * 4, 16)
    pct += min(project_total * 5, 15)
    if sandbox_joined > 0:
        pct += 10
    if innovation_ideas > 0:
        pct += 9
    if readiness_score is not None:
        pct += min(int(readiness_score / 10), 20)
    return min(pct, 100)


def get_career_snapshot(db: Session, user_id: int) -> dict:
    """CareerVerse snapshot: real platform state only."""
    backfill_career_events(db, user_id)
    user = db.get(User, user_id)
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == user_id).first()
    education = db.query(Education).filter(Education.user_id == user_id).order_by(
        Education.id.desc()
    ).first()
    skills = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    evidence_total = db.query(SkillEvidence).filter(
        SkillEvidence.user_id == user_id
    ).count()
    learning = db.query(LearningRecord).filter(LearningRecord.user_id == user_id).all()
    learning_total = len(learning)
    learning_completed = sum(1 for r in learning if r.status == "completed")
    learning_in_progress = [r for r in learning if 0 < (r.progress_percentage or 0) < 100]
    project_total = db.query(Project).filter(Project.owner_id == user_id).count()
    project_completed = db.query(Project).filter(
        Project.owner_id == user_id,
        Project.status.in_(["published", "completed"])
    ).count()
    sandbox_joined = db.query(SandboxParticipant).filter(
        SandboxParticipant.user_id == user_id
    ).count()
    sandbox_submitted = db.query(SandboxSubmission).filter(
        SandboxSubmission.user_id == user_id
    ).count()
    innovation_ideas = db.query(InnovationIdea).filter(
        InnovationIdea.owner_id == user_id
    ).count()
    innovation_milestones = db.query(InnovationMilestone).join(
        InnovationIdea, InnovationMilestone.idea_id == InnovationIdea.id
    ).filter(
        InnovationIdea.owner_id == user_id,
        InnovationMilestone.status == "completed",
    ).count()
    target_role = None
    readiness = None
    skill_gaps = []
    if user:
        try:
            # resolve_role returns (role_row, source); build_gap returns the
            # canonical Stage 5 readiness/gap analysis for that role.
            role_row, _src = s5.resolve_role(db, user)
            gap = s5.build_gap(db, user_id, role_row)
            domain_name = None
            if role_row.domain_id:
                dm = db.get(IndustryDomain, role_row.domain_id)
                domain_name = dm.name if dm else None
            target_role = {"id": role_row.id, "title": role_row.title, "domain": domain_name}
            readiness = {"score": gap.get("readiness_score"), "level": gap.get("readiness_level"),
                         "reason": gap.get("reason"), "disclaimer": s5.DISCLAIMER}
            skill_gaps = gap.get("items", [])[:8]
        except Exception:
            pass
    next_mission = None
    try:
        ctx = s9.build_career_context(db, user_id)
        next_mission = s9._compute_next_mission(ctx)
    except Exception:
        pass
    goal = db.query(CareerGoal).filter(CareerGoal.user_id == user_id, CareerGoal.status == "active").order_by(
        CareerGoal.updated_at.desc()).first()
    jp = _compute_journey_progress(has_profile=profile is not None, skill_count=len(skills),
        learning_total=learning_total, project_total=project_total, sandbox_joined=sandbox_joined,
        innovation_ideas=innovation_ideas, readiness_score=readiness.get("score") if readiness else None)
    return {
        "user": {"name": user.name if user else None, "public_id": user.public_id if user else None,
                 "joined_at": _iso(user.created_at) if user else None},
        "education": {"college": education.institution if education else None, "degree": education.degree if education else None,
                      "branch": education.field_of_study if education else None, "graduation_year": education.graduation_year if education else None} if education else None,
        "profile": {"target_job_role": profile.target_job_role if profile else None,
                    "preferred_industry": profile.preferred_industry if profile else None,
                    "cgpa": profile.cgpa if profile else None} if profile else None,
        "target_role": target_role, "readiness": readiness, "skill_gaps": skill_gaps,
        "skills": {"count": len(skills), "evidence_total": evidence_total,
            "top": [{"skill_id": us.skill_id, "name": us.skill.name if us.skill else None, "level": us.level, "is_verified": us.is_verified}
                for us in sorted(skills, key=lambda x: (x.is_verified, x.level or ""), reverse=True)[:8]]},
        "learning": {"total": learning_total, "completed": learning_completed,
            "in_progress": [{"skill_name": r.skill_name, "resource_title": r.resource_title, "progress": r.progress_percentage or 0}
                for r in learning_in_progress[:3]]},
        "projects": {"total": project_total, "completed": project_completed},
        "sandbox": {"joined": sandbox_joined, "submitted": sandbox_submitted},
        "innovation": {"ideas": innovation_ideas, "milestones_completed": innovation_milestones},
        "next_mission": next_mission,
        "active_goal": {"id": goal.id, "target_role": goal.target_role, "target_domain": goal.target_domain, "status": goal.status} if goal else None,
        "journey_progress": jp,
    }


def get_career_timeline(db: Session, user_id: int, limit: int = 60) -> list:
    """Career Replay: chronological career events."""
    events = db.query(CareerEvent).filter(
        CareerEvent.user_id == user_id
    ).order_by(CareerEvent.created_at.desc()).limit(limit).all()
    return [{"id": e.id, "event_type": e.event_type, "title": e.title,
             "description": e.description, "source_type": e.source_type,
             "created_at": _iso(e.created_at)} for e in events]


def get_career_roadmap(db: Session, user_id: int) -> list:
    """Roadmap based on real platform state. No future stage marked complete."""
    profile = db.query(StudentProfile).filter(StudentProfile.user_id == user_id).first()
    skills = db.query(UserSkill).filter(UserSkill.user_id == user_id).count()
    learning = db.query(LearningRecord).filter(LearningRecord.user_id == user_id).all()
    learning_total = len(learning)
    learning_completed = sum(1 for r in learning if r.status == "completed")
    projects = db.query(Project).filter(Project.owner_id == user_id).count()
    sandbox = db.query(SandboxParticipant).filter(SandboxParticipant.user_id == user_id).count()
    innovation = db.query(InnovationIdea).filter(InnovationIdea.owner_id == user_id).count()
    readiness_score = None
    try:
        ctx = s9.build_career_context(db, user_id)
        readiness_score = (ctx.get("readiness") or {}).get("score")
    except Exception:
        pass
    return [
        {"id": "profile", "title": "Profile & Skills",
         "status": "completed" if (profile and skills > 0) else ("current" if profile else "upcoming"),
         "description": f"{skills} skill(s) mapped" if profile else "Complete your profile"},
        {"id": "learning", "title": "Skill Development",
         "status": "completed" if learning_completed > 0 else ("current" if learning_total > 0 else "upcoming"),
         "description": f"{learning_completed}/{learning_total} learning completed"},
        {"id": "sandbox", "title": "Industry Experience",
         "status": "completed" if sandbox > 0 else "upcoming",
         "description": f"{sandbox} sandbox challenge(s) joined"},
        {"id": "projects", "title": "Project Building",
         "status": "completed" if projects > 0 else "upcoming",
         "description": f"{projects} project(s)"},
        {"id": "innovation", "title": "Innovation",
         "status": "completed" if innovation > 0 else "upcoming",
         "description": f"{innovation} idea(s)"},
        {"id": "interview", "title": "Interview Readiness",
         "status": "completed" if (readiness_score is not None and readiness_score >= 75)
                else ("current" if (readiness_score is not None and readiness_score >= 50) else "upcoming"),
         "description": f"Readiness {readiness_score}%" if readiness_score is not None else "Set a target role first"},
        {"id": "internship", "title": "Internship Readiness",
         "status": "completed" if (readiness_score is not None and readiness_score >= 60)
                else ("current" if (readiness_score is not None and readiness_score >= 40) else "upcoming"),
         "description": f"Readiness {readiness_score}%" if readiness_score is not None else "Set a target role first"},
        {"id": "placement", "title": "Target Career",
         "status": "completed" if (readiness_score is not None and readiness_score >= 75)
                else ("current" if (readiness_score is not None and readiness_score >= 60) else "upcoming"),
         "description": f"Readiness {readiness_score}%" if readiness_score is not None else "Set a target role first"},

    ]

def get_next_mission(db: Session, user_id: int):
    """Next mission."""
    try:
        ctx = s9.build_career_context(db, user_id)
        return s9._compute_next_mission(ctx)
    except Exception:
        return None


def get_career_goals(db: Session, user_id: int) -> list:
    goals = db.query(CareerGoal).filter(
        CareerGoal.user_id == user_id
    ).order_by(CareerGoal.updated_at.desc()).all()
    return [{"id": g.id, "target_role": g.target_role, "target_domain": g.target_domain,
             "target_level": g.target_level, "target_date": _iso(g.target_date),
             "status": g.status, "note": g.note, "created_at": _iso(g.created_at)} for g in goals]


def simulate_what_if(db: Session, user_id: int, actions: list) -> dict:
    """What-if simulation comparing current vs projected state.

    Readiness is recalculated by the existing Stage 5 deterministic engine —
    never invented by AI. Actions are explicit skill-level improvements.
    """
    user = db.get(User, user_id)
    role_row = None
    current_readiness = None
    current_level = None
    if user:
        try:
            # resolve_role returns (role_row, source); build_gap returns the
            # canonical Stage 5 readiness analysis.
            role_row, _src = s5.resolve_role(db, user)
            gap = s5.build_gap(db, user_id, role_row)
            current_readiness = gap.get("readiness_score")
            current_level = gap.get("readiness_level")
        except Exception:
            role_row = None
    user_skills = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    current_skills = []
    for us in user_skills:
        sn = us.skill.name if us.skill else "Unknown"
        ec = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id, SkillEvidence.skill_id == us.skill_id).count()
        current_skills.append({"skill_id": us.skill_id, "skill_name": sn, "level": us.level,
                               "level_num": level_to_num(us.level), "evidence_count": ec})
    projected_skills = {s["skill_id"]: dict(s) for s in current_skills}
    applied_actions = []
    for act in actions:
        sid = act.get("skill_id")
        new_level = act.get("new_level")
        if sid is None or not new_level:
            continue
        if sid in projected_skills:
            projected_skills[sid]["level"] = new_level
            projected_skills[sid]["level_num"] = level_to_num(new_level)
        applied_actions.append({"skill_id": sid, "new_level": new_level})
    projected_readiness = current_readiness
    projected_level = current_level
    if role_row is not None and applied_actions:
        reqs = s5.role_reqs(db, role_row.id)
        if reqs:
            student_levels = {}
            for us in user_skills:
                lvl = level_to_num(us.level)
                if us.skill_id in projected_skills:
                    lvl = projected_skills[us.skill_id]["level_num"]
                student_levels[us.skill_id] = lvl
            verified = set()
            for us in user_skills:
                if us.is_verified:
                    verified.add(us.skill_id)
            score, bonus = s5.score_role(reqs, student_levels, verified)
            projected_readiness = score
            projected_level = readiness_band(score)
    delta = None
    if current_readiness is not None and projected_readiness is not None:
        delta = round(projected_readiness - current_readiness, 1)
    return {
        "current": {"readiness": current_readiness, "readiness_level": current_level, "skills": current_skills},
        "projected": {"readiness": projected_readiness, "readiness_level": projected_level, "skills": list(projected_skills.values())},
        "actions_applied": applied_actions,
        "delta": delta,
        "disclaimer": s5.DISCLAIMER,
    }


def set_career_goal(db, user_id, *, target_role, target_domain=None,
                    target_level=None, target_date=None, note=None) -> dict:
    """Create or update the active career goal (idempotent on active)."""
    existing = db.query(CareerGoal).filter(
        CareerGoal.user_id == user_id, CareerGoal.status == "active"
    ).first()
    if existing:
        existing.target_role = target_role
        if target_domain is not None: existing.target_domain = target_domain
        if target_level is not None: existing.target_level = target_level
        if target_date is not None: existing.target_date = target_date
        if note is not None: existing.note = note
        db.flush()
        goal = existing
    else:
        goal = CareerGoal(user_id=user_id, target_role=target_role,
            target_domain=target_domain, target_level=target_level,
            target_date=target_date, note=note)
        db.add(goal)
        db.flush()
    record_career_event(db, user_id=user_id, event_type="career_goal_set",
        title=f"Career goal set: {target_role}", description=note,
        source_type="career_goal", source_id=goal.id)
    db.commit()
    return {"id": goal.id, "target_role": goal.target_role, "target_domain": goal.target_domain,
            "target_level": goal.target_level, "target_date": _iso(goal.target_date), "status": goal.status}
