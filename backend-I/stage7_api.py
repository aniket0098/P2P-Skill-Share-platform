"""Stage 7 API: Industry Sandbox endpoints."""
from __future__ import annotations
import json
from fastapi import Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from models import (
    SandboxChallenge, SandboxChallengeSkill, SandboxTask, SandboxResource,
    SandboxParticipant, SandboxSubmission, SandboxEvaluation, SandboxEvaluationCriterion, Skill,
)
import stage7_service as s7

class SaveDraftIn(BaseModel):
    content: str | None = None
    github_url: str | None = None
    demo_url: str | None = None
    draft_data: dict | None = None

class SubmitIn(BaseModel):
    content: str | None = None
    github_url: str | None = None
    demo_url: str | None = None

class EvaluationIn(BaseModel):
    overall_score: float | None = None
    feedback: str | None = None
    evaluation_type: str | None = "automated"
    criteria: list | None = None
    @field_validator("overall_score")
    @classmethod
    def score_range(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError("Score must be between 0 and 100")
        return v

def _filter_options(db: Session) -> dict:
    domains = [r[0] for r in db.query(SandboxChallenge.domain).filter(
        SandboxChallenge.domain.isnot(None)).distinct().all() if r[0]]
    difficulties = [r[0] for r in db.query(SandboxChallenge.difficulty).distinct().all() if r[0]]
    statuses = [r[0] for r in db.query(SandboxChallenge.status).distinct().all() if r[0]]
    return {"domains": sorted(domains), "difficulties": sorted(difficulties), "statuses": sorted(statuses)}

def register_stage7(app, get_db, me_dep):

    @app.get("/api/sandbox/challenges")
    def list_challenges(search: str = "", domain: str = "", difficulty: str = "",
        status: str = "", skill: str = "", limit: int = 50, db: Session = Depends(get_db)):
        q = db.query(SandboxChallenge)
        if status: q = q.filter(SandboxChallenge.status == status)
        if domain: q = q.filter(func.lower(SandboxChallenge.domain) == domain.lower())
        if difficulty: q = q.filter(func.lower(SandboxChallenge.difficulty) == difficulty.lower())
        if search and search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(or_(SandboxChallenge.title.ilike(term),
                SandboxChallenge.description.ilike(term), SandboxChallenge.industry.ilike(term)))
        if skill and skill.strip():
            sr = db.query(Skill).filter(func.lower(Skill.name) == skill.strip().lower()).first()
            if sr:
                ids = [r[0] for r in db.query(SandboxChallengeSkill.challenge_id)
                    .filter(SandboxChallengeSkill.skill_id == sr.id).all()]
                q = q.filter(SandboxChallenge.id.in_(ids)) if ids else q.filter(False)
            else: return {"challenges": [], "filters": _filter_options(db)}
        rows = q.order_by(SandboxChallenge.created_at.desc()).limit(min(max(limit, 1), 100)).all()
        return {"challenges": [s7.serialize_challenge(r) for r in rows], "filters": _filter_options(db)}

    @app.get("/api/sandbox/challenges/{challenge_id}")
    def challenge_detail(challenge_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        ch = db.get(SandboxChallenge, challenge_id)
        if not ch: raise HTTPException(status_code=404, detail="Challenge not found")
        data = s7.serialize_challenge(ch)
        data["tasks"] = [s7.serialize_task(t) for t in ch.tasks]
        data["resources"] = [s7.serialize_resource(r) for r in ch.resources]
        participant = db.query(SandboxParticipant).filter(
            SandboxParticipant.challenge_id == challenge_id,
            SandboxParticipant.user_id == cu.id).first()
        data["participation"] = (
            {"status": participant.status, "started_at": participant.started_at.isoformat() if participant.started_at else None}
            if participant else None)
        return data

    @app.post("/api/sandbox/challenges/{challenge_id}/start")
    def start_challenge(challenge_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        ch = db.get(SandboxChallenge, challenge_id)
        if not ch: raise HTTPException(status_code=404, detail="Challenge not found")
        if ch.status != "open": raise HTTPException(status_code=400, detail="Challenge is not open")
        existing = db.query(SandboxParticipant).filter(
            SandboxParticipant.challenge_id == challenge_id,
            SandboxParticipant.user_id == cu.id).first()
        participant = s7.get_or_create_participant(db, challenge_id, cu.id)
        db.commit()
        return {"participant": {"id": participant.id, "status": participant.status,
                                "started_at": participant.started_at.isoformat() if participant.started_at else None},
                "already_joined": existing is not None,
                "message": "Resuming challenge" if existing else "Challenge started"}

    @app.get("/api/sandbox/my-challenges")
    def my_challenges(cu=Depends(me_dep), db: Session = Depends(get_db)):
        parts = db.query(SandboxParticipant).filter(
            SandboxParticipant.user_id == cu.id).order_by(SandboxParticipant.started_at.desc()).all()
        out = []
        for p in parts:
            ch = db.get(SandboxChallenge, p.challenge_id)
            if not ch: continue
            sub = db.query(SandboxSubmission).filter(
                SandboxSubmission.challenge_id == p.challenge_id,
                SandboxSubmission.user_id == cu.id).order_by(SandboxSubmission.id.desc()).first()
            out.append({"participant": {"id": p.id, "status": p.status},
                "challenge": s7.serialize_challenge(ch),
                "submission": s7.serialize_submission(sub) if sub else None})
        return {"challenges": out}

    @app.get("/api/sandbox/my-challenges/{challenge_id}")
    def my_challenge_detail(challenge_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        ch = db.get(SandboxChallenge, challenge_id)
        if not ch: raise HTTPException(status_code=404, detail="Not found")
        participant = db.query(SandboxParticipant).filter(
            SandboxParticipant.challenge_id == challenge_id,
            SandboxParticipant.user_id == cu.id).first()
        if not participant: raise HTTPException(status_code=404, detail="Not joined")
        sub = db.query(SandboxSubmission).filter(
            SandboxSubmission.challenge_id == challenge_id,
            SandboxSubmission.user_id == cu.id).order_by(SandboxSubmission.id.desc()).first()
        evaluation = None
        if sub and sub.status == "submitted":
            ev = db.query(SandboxEvaluation).filter(
                SandboxEvaluation.submission_id == sub.id).first()
            if ev: evaluation = s7.serialize_evaluation(ev)
        data = s7.serialize_challenge(ch)
        data["tasks"] = [s7.serialize_task(t) for t in ch.tasks]
        data["resources"] = [s7.serialize_resource(r) for r in ch.resources]
        data["participant"] = {"id": participant.id, "status": participant.status}
        data["submission"] = s7.serialize_submission(sub) if sub else None
        data["evaluation"] = evaluation
        return data

    @app.get("/api/sandbox/workspace/{challenge_id}")
    def get_workspace(challenge_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        ch = db.get(SandboxChallenge, challenge_id)
        if not ch: raise HTTPException(status_code=404, detail="Not found")
        participant = db.query(SandboxParticipant).filter(
            SandboxParticipant.challenge_id == challenge_id,
            SandboxParticipant.user_id == cu.id).first()
        if not participant: raise HTTPException(status_code=404, detail="Join the challenge first")
        sub = db.query(SandboxSubmission).filter(
            SandboxSubmission.challenge_id == challenge_id,
            SandboxSubmission.user_id == cu.id,
            SandboxSubmission.status == "draft").order_by(SandboxSubmission.attempt.desc()).first()
        data = s7.serialize_challenge(ch)
        data["tasks"] = [s7.serialize_task(t) for t in ch.tasks]
        data["resources"] = [s7.serialize_resource(r) for r in ch.resources]
        data["participant"] = {"id": participant.id, "status": participant.status}
        draft = s7.serialize_submission(sub) if sub else None
        # The frontend workspace reads `submission`; keep `draft` as the
        # original key for backwards compatibility with earlier drafts.
        data["draft"] = draft
        data["submission"] = draft
        return data

    @app.put("/api/sandbox/workspace/{challenge_id}/draft")
    def save_draft(challenge_id: int, data: SaveDraftIn, cu=Depends(me_dep), db: Session = Depends(get_db)):
        ch = db.get(SandboxChallenge, challenge_id)
        if not ch: raise HTTPException(status_code=404, detail="Not found")
        sub = s7.get_or_create_submission(db, challenge_id, cu.id)
        if sub.status != "draft": raise HTTPException(status_code=400, detail="Already sent")
        if data.content is not None: sub.content = data.content
        if data.github_url is not None: sub.github_url = data.github_url.strip() if data.github_url else None
        if data.demo_url is not None: sub.demo_url = data.demo_url.strip() if data.demo_url else None
        if data.draft_data is not None:
            try: sub.draft_data = json.dumps(data.draft_data)[:5000]
            except Exception: pass
        sub.updated_at = func.now()
        db.commit()
        return {"submission": s7.serialize_submission(sub), "message": "Draft saved"}

    @app.post("/api/sandbox/workspace/{challenge_id}/submit")
    def submit_solution(challenge_id: int, data: SubmitIn, cu=Depends(me_dep), db: Session = Depends(get_db)):
        ch = db.get(SandboxChallenge, challenge_id)
        if not ch: raise HTTPException(status_code=404, detail="Not found")
        participant = db.query(SandboxParticipant).filter(
            SandboxParticipant.challenge_id == challenge_id,
            SandboxParticipant.user_id == cu.id).first()
        if not participant: raise HTTPException(status_code=400, detail="Join first")
        sub = db.query(SandboxSubmission).filter(
            SandboxSubmission.challenge_id == challenge_id,
            SandboxSubmission.user_id == cu.id,
            SandboxSubmission.status == "draft").order_by(SandboxSubmission.attempt.desc()).first()
        if not sub: raise HTTPException(status_code=400, detail="No draft to submit")
        if not (sub.content or "").strip() and not (sub.github_url or "").strip():
            raise HTTPException(status_code=400, detail="Add a solution description or a GitHub URL before submitting")
        sub.status = "submitted"
        sub.submitted_at = func.now()
        sub.updated_at = func.now()
        if data.content is not None: sub.content = data.content
        if data.github_url is not None: sub.github_url = data.github_url.strip() if data.github_url else None
        if data.demo_url is not None: sub.demo_url = data.demo_url.strip() if data.demo_url else None
        if participant.status == "in_progress": participant.status = "submitted"
        db.commit()
        return {"submission": s7.serialize_submission(sub), "message": "Solution submitted for evaluation"}

    @app.post("/api/sandbox/submissions/{submission_id}/evaluate")
    def evaluate_submission(submission_id: int, data: EvaluationIn, cu=Depends(me_dep), db: Session = Depends(get_db)):
        sub = db.get(SandboxSubmission, submission_id)
        if not sub: raise HTTPException(status_code=404, detail="Not found")
        if cu.role not in ("admin", "mentor", "faculty"):
            raise HTTPException(status_code=403, detail="Not authorized")
        ev = db.query(SandboxEvaluation).filter(
            SandboxEvaluation.submission_id == submission_id).first()
        if not ev: ev = SandboxEvaluation(submission_id=submission_id); db.add(ev)
        ev.overall_score = data.overall_score; ev.feedback = data.feedback
        ev.evaluated_by = cu.id; ev.evaluation_type = data.evaluation_type or "automated"
        if data.criteria:
            for c in ev.criteria: db.delete(c)
            db.flush()
            for c in data.criteria:
                db.add(SandboxEvaluationCriterion(evaluation_id=ev.id,
                    name=c.get("name", "Criterion"), score=float(c.get("score", 0)),
                    max_score=float(c.get("max_score", 100)), comment=c.get("comment")))
        participant = db.query(SandboxParticipant).filter(
            SandboxParticipant.challenge_id == sub.challenge_id,
            SandboxParticipant.user_id == sub.user_id).first()
        if participant:
            participant.status = "completed" if (data.overall_score is not None and data.overall_score >= 50) else "evaluated"
            participant.completed_at = func.now() if participant.status == "completed" else None
        db.commit(); db.refresh(ev)
        evidence = s7.create_sandbox_evidence(db, ev); db.commit()
        return {"evaluation": s7.serialize_evaluation(ev), "evidence_created": len(evidence)}

    @app.get("/api/sandbox/submissions/{submission_id}")
    def get_submission(submission_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        sub = db.get(SandboxSubmission, submission_id)
        if not sub: raise HTTPException(status_code=404, detail="Not found")
        if sub.user_id != cu.id and cu.role not in ("admin", "mentor", "faculty"):
            raise HTTPException(status_code=403, detail="Not authorized")
        ev = db.query(SandboxEvaluation).filter(SandboxEvaluation.submission_id == sub.id).first()
        data = s7.serialize_submission(sub)
        data["evaluation"] = s7.serialize_evaluation(ev) if ev else None
        return data

    @app.get("/api/sandbox/dashboard")
    def sandbox_dashboard(cu=Depends(me_dep), db: Session = Depends(get_db)):
        return {"stats": s7.student_dashboard_stats(db, cu.id)}

    @app.get("/api/sandbox/recommendations")
    def sandbox_recommendations(cu=Depends(me_dep), db: Session = Depends(get_db)):
        return {"recommendations": s7.recommend_challenges(db, cu.id)}

    @app.post("/api/sandbox/admin/challenges")
    def create_challenge(data: dict, cu=Depends(me_dep), db: Session = Depends(get_db)):
        if cu.role != "admin": raise HTTPException(status_code=403, detail="Admin only")
        title = (data.get("title") or "").strip()
        if not title: raise HTTPException(status_code=400, detail="Title required")
        slug = (data.get("slug") or title.lower().replace(" ", "-")[:60]).strip()
        base = slug; c = 1
        while db.query(SandboxChallenge).filter(SandboxChallenge.slug == slug).first():
            slug = f"{base}-{c}"; c += 1
        ch = SandboxChallenge(title=title, slug=slug, description=data.get("description", ""),
            industry=data.get("industry"), domain=data.get("domain"),
            difficulty=data.get("difficulty", "intermediate"), company_name=data.get("company_name"),
            is_demo=data.get("is_demo", False), created_by=cu.id)
        if data.get("evaluation_criteria"): ch.evaluation_criteria = json.dumps(data["evaluation_criteria"])
        db.add(ch); db.flush()
        for sk in (data.get("skills") or []):
            sn = (sk.get("name") or sk if isinstance(sk, str) else "").strip()
            if not sn: continue
            so = db.query(Skill).filter(func.lower(Skill.name) == sn.lower()).first()
            if not so: so = Skill(name=sn); db.add(so); db.flush()
            db.add(SandboxChallengeSkill(challenge_id=ch.id, skill_id=so.id))
        for i, t in enumerate(data.get("tasks") or []):
            db.add(SandboxTask(challenge_id=ch.id, title=(t.get("title") or f"Task {i+1}").strip(),
                task_type=t.get("task_type", "text_response"), order_index=i))
        db.commit()
        return {"challenge": s7.serialize_challenge(ch), "message": "Created"}
