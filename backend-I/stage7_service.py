
"""Stage 7 service: challenge catalog, workspace, submission, evaluation, evidence."""
from __future__ import annotations
import json
from sqlalchemy import func as _func
from sqlalchemy.orm import Session
from models import (
    SandboxChallenge, SandboxChallengeSkill, SandboxTask, SandboxResource,
    SandboxParticipant, SandboxSubmission, SandboxEvaluation, SandboxEvaluationCriterion,
    Skill, SkillEvidence, SkillHistory, UserSkill,
)
import stage6_service as s6


def serialize_challenge(row: SandboxChallenge) -> dict:
    skills = []
    for cs in row.skills:
        if cs.skill:
            skills.append({
                "skill_id": cs.skill_id,
                "skill_name": cs.skill.name,
                "category": cs.skill.category,
                "skill_level": cs.skill_level,
            })
    criteria = None
    if row.evaluation_criteria:
        try:
            criteria = json.loads(row.evaluation_criteria)
        except Exception:
            criteria = None
    return {
        "id": row.id,
        "title": row.title,
        "slug": row.slug,
        "description": row.description,
        "business_context": row.business_context,
        "expected_outcome": row.expected_outcome,
        "industry": row.industry,
        "domain": row.domain,
        "difficulty": row.difficulty,
        "estimated_time": row.estimated_time,
        "status": row.status,
        "company_name": row.company_name,
        "is_demo": row.is_demo,
        "evaluation_criteria": criteria,
        "deadline": row.deadline.isoformat() if row.deadline else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "skills": skills,
        "task_count": len(row.tasks) if row.tasks else 0,
        "resource_count": len(row.resources) if row.resources else 0,
    }


def serialize_task(row: SandboxTask) -> dict:
    return {"id": row.id, "title": row.title, "description": row.description,
            "task_type": row.task_type, "instructions": row.instructions, "order_index": row.order_index}


def serialize_resource(row: SandboxResource) -> dict:
    return {"id": row.id, "title": row.title, "resource_type": row.resource_type,
            "url": row.url, "description": row.description}


def serialize_submission(row: SandboxSubmission) -> dict:
    draft = None
    if row.draft_data:
        try:
            draft = json.loads(row.draft_data)
        except Exception:
            draft = None
    return {"id": row.id, "challenge_id": row.challenge_id, "status": row.status,
            "content": row.content, "github_url": row.github_url, "demo_url": row.demo_url,
            "draft_data": draft, "attempt": row.attempt,
            "submitted_at": row.submitted_at.isoformat() if row.submitted_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None}


def serialize_evaluation(row: SandboxEvaluation) -> dict:
    criteria = [{"name": c.name, "score": c.score, "max_score": c.max_score, "comment": c.comment}
                for c in row.criteria]
    return {"id": row.id, "submission_id": row.submission_id, "overall_score": row.overall_score,
            "feedback": row.feedback, "evaluation_type": row.evaluation_type,
            "evaluated_by": row.evaluated_by, "criteria": criteria,
            "created_at": row.created_at.isoformat() if row.created_at else None}


def get_or_create_participant(db: Session, challenge_id: int, user_id: int) -> SandboxParticipant:
    """Idempotent: returns existing participant or creates one."""
    row = db.query(SandboxParticipant).filter(
        SandboxParticipant.challenge_id == challenge_id,
        SandboxParticipant.user_id == user_id,
    ).first()
    if row:
        return row
    row = SandboxParticipant(challenge_id=challenge_id, user_id=user_id, status="in_progress")
    db.add(row)
    db.flush()
    return row


def get_or_create_submission(db: Session, challenge_id: int, user_id: int) -> SandboxSubmission:
    """Returns the latest draft submission for this user+challenge, or creates one."""
    row = db.query(SandboxSubmission).filter(
        SandboxSubmission.challenge_id == challenge_id,
        SandboxSubmission.user_id == user_id,
        SandboxSubmission.status == "draft",
    ).order_by(SandboxSubmission.attempt.desc()).first()
    if row:
        return row
    max_attempt = db.query(_func.max(SandboxSubmission.attempt)).filter(
        SandboxSubmission.challenge_id == challenge_id,
        SandboxSubmission.user_id == user_id,
    ).scalar() or 0
    row = SandboxSubmission(
        challenge_id=challenge_id, user_id=user_id,
        status="draft", attempt=max_attempt + 1,
    )
    db.add(row)
    db.flush()
    return row


def sandbox_evidence_score(evaluation: SandboxEvaluation) -> float:
    if evaluation.overall_score is None:
        return 0.0
    return round(float(evaluation.overall_score), 1)


def sandbox_confidence_label(evaluation: SandboxEvaluation) -> str:
    if evaluation.overall_score is None:
        return "self_reported"
    if evaluation.evaluation_type in ("mentor", "faculty", "industry"):
        return "verified"
    return "project"


def create_sandbox_evidence(db: Session, evaluation: SandboxEvaluation) -> list:
    """Create skill evidence from a sandbox evaluation using Stage 6 upsert_evidence."""
    submission = evaluation.submission
    if not submission:
        return []
    challenge = db.get(SandboxChallenge, submission.challenge_id)
    if not challenge:
        return []
    score = sandbox_evidence_score(evaluation)
    confidence = sandbox_confidence_label(evaluation)
    evidence_text = f"Industry Sandbox \u2014 {challenge.title}"
    if evaluation.overall_score is not None:
        evidence_text += f" (score {evaluation.overall_score:.0f}/100)"
    out = []
    for cs in challenge.skills:
        if not cs.skill:
            continue
        ev = s6.upsert_evidence(
            db, user_id=submission.user_id, skill_id=cs.skill_id,
            source_type="sandbox", source_id=submission.id,
            score=score, confidence=confidence, evidence_text=evidence_text,
            extra={"challenge_id": challenge.id, "challenge_title": challenge.title,
                   "evaluation_id": evaluation.id, "overall_score": evaluation.overall_score},
        )
        out.append(ev)
    if out and challenge.skills:
        s6.record_history(
            db, user_id=submission.user_id,
            skill_id=challenge.skills[0].skill_id,
            event_type="sandbox_completed",
            note=f"Industry Sandbox challenge completed: {challenge.title}",
            confidence=confidence,
        )
    db.flush()
    return out

def student_dashboard_stats(db: Session, user_id: int) -> dict:
    """Real stats for the student sandbox dashboard."""
    joined = db.query(SandboxParticipant).filter(SandboxParticipant.user_id == user_id).count()
    in_progress = db.query(SandboxParticipant).filter(
        SandboxParticipant.user_id == user_id, SandboxParticipant.status == "in_progress").count()
    submitted = db.query(SandboxParticipant).filter(
        SandboxParticipant.user_id == user_id,
        SandboxParticipant.status.in_(["submitted", "evaluated", "completed"])).count()
    completed = db.query(SandboxParticipant).filter(
        SandboxParticipant.user_id == user_id, SandboxParticipant.status == "completed").count()
    sandbox_ev = db.query(SkillEvidence).filter(
        SkillEvidence.user_id == user_id, SkillEvidence.source_type == "sandbox").count()
    skills_demonstrated = db.query(_func.count(_func.distinct(SkillEvidence.skill_id))).filter(
        SkillEvidence.user_id == user_id, SkillEvidence.source_type == "sandbox").scalar() or 0
    return {"joined": joined, "in_progress": in_progress, "submitted": submitted,


            "completed": completed, "evidence_count": sandbox_ev, "skills_demonstrated": skills_demonstrated}


def recommend_challenges(db: Session, user_id: int, limit: int = 5) -> list:
    """Deterministic challenge recommendations based on skill gaps."""
    from stage5_service import student_map, role_reqs, resolve_role
    from models import User
    user = db.get(User, user_id)
    if not user:
        return []
    try:
        role, _ = resolve_role(db, user)
    except Exception:
        return []
    levels, verified, detail = student_map(db, user_id)
    reqs = role_reqs(db, role.id)
    gap_skill_ids = set()
    lvl_map = {"beginner": 1, "intermediate": 2, "advanced": 3, "expert": 4}
    for r in reqs:
        sid = r["skill_id"]
        req_num = lvl_map.get((r.get("required_level") or "").lower(), 2)
        stu_num = int(levels.get(sid, 0) or 0)
        if stu_num < req_num:
            gap_skill_ids.add(sid)
    if not gap_skill_ids:
        return []
    joined_ids = set(r[0] for r in db.query(SandboxParticipant.challenge_id).filter(
        SandboxParticipant.user_id == user_id).all())
    rows = db.query(SandboxChallenge).filter(SandboxChallenge.status == "open").all()
    scored = []
    for ch in rows:
        if ch.id in joined_ids:
            continue
        overlap_ids = set(cs.skill_id for cs in ch.skills) & gap_skill_ids
        if overlap_ids:
            names = [cs.skill.name for cs in ch.skills if cs.skill_id in overlap_ids and cs.skill]
            scored.append((len(overlap_ids), ch, names))
    scored.sort(key=lambda x: -x[0])
    out = []
    for _, ch, skill_names in scored[:limit]:
        out.append({
            "challenge": serialize_challenge(ch),
            "reason": f"Matches your target role ({role.title}) and helps demonstrate {', '.join(skill_names[:3])}.",
            "matched_skills": skill_names,
        })
    return out

