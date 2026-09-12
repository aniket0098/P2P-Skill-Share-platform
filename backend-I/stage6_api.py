"""Stage 6 API: project gallery + evidence/growth/overview endpoints.
Registered from main.py via register_stage6(app, get_db, get_current_user_model).
Additive only — no existing route is modified here."""
from __future__ import annotations
from fastapi import Depends, HTTPException
from pydantic import BaseModel, field_validator
import stage6_service as stage6
from models import Project, SkillEvidence
def _split_csv(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v or "").strip()]
    return [p.strip() for p in str(value).split(",") if p.strip()]
def _ser_project(row, n: int = 0) -> dict:
    return {"id": row.id, "owner_id": row.owner_id, "title": row.title, "description": row.description, "technologies": _split_csv(getattr(row, "technologies", None)), "technologies_text": getattr(row, "technologies", None), "skills": _split_csv(getattr(row, "skills", None)), "image_url": getattr(row, "image_url", None), "github_url": row.github_url, "demo_url": getattr(row, "demo_url", None), "status": getattr(row, "status", None) or "published", "evidence_count": n, "created_at": row.created_at.isoformat() if row.created_at else None, "updated_at": row.updated_at.isoformat() if row.updated_at else None}
def _csv_or_none(value):
    if value is None:
        return None
    if isinstance(value, list):
        c = [str(v).strip() for v in value if str(v or "").strip()]
        return ", ".join(c[:30]) if c else None
    t = str(value).strip()
    return t[:1000] if t else None
class ProjectIn(BaseModel):
    title: str
    description: str | None = None
    technologies: str | list | None = None
    skills: str | list | None = None
    image_url: str | None = None
    github_url: str | None = None
    demo_url: str | None = None
    status: str | None = "published"
    @field_validator("title")
    @classmethod
    def title_required(cls, v):
        if not v or not str(v).strip():
            raise ValueError("Project title is required")
        return str(v).strip()[:200]
    @field_validator("status")
    @classmethod
    def status_valid(cls, v):
        t = str(v or "published").strip().lower()
        if t not in {"draft", "in_progress", "published"}:
            raise ValueError("Status must be draft/in_progress/published")
        return t
class ProjectUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    technologies: str | list | None = None
    skills: str | list | None = None
    image_url: str | None = None
    github_url: str | None = None
    demo_url: str | None = None
def register_stage6(app, get_db, me_dep):
    # NOTE: GET/POST /api/projects already exist in main.py — they are
    # deliberately NOT redefined here (no duplicate systems).
    @app.get("/api/projects/{project_id}")
    def get_project(project_id: int, db=Depends(get_db)):
        row = db.query(Project).filter(Project.id == project_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        ev = db.query(SkillEvidence).filter(SkillEvidence.source_type == "project", SkillEvidence.source_id == row.id).all()
        data = _ser_project(row, len(ev))
        data["evidence"] = [stage6.serialize_evidence(e) for e in ev]
        return data
    @app.put("/api/projects/{project_id}")
    def update_project(project_id: int, data: ProjectUpdateIn, cu=Depends(me_dep), db=Depends(get_db)):
        row = db.query(Project).filter(Project.id == project_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        if row.owner_id != cu.id:
            raise HTTPException(status_code=403, detail="You can only edit your own projects")
        patch = data.model_dump(exclude_unset=True)
        if "title" in patch:
            t = str(patch["title"] or "").strip()
            if not t:
                raise HTTPException(status_code=422, detail="Project title is required")
            row.title = t[:200]
        if "description" in patch:
            row.description = str(patch["description"] or "").strip() or None
        if "technologies" in patch:
            row.technologies = _csv_or_none(patch["technologies"])
        if "skills" in patch:
            row.skills = _csv_or_none(patch["skills"])
        if "image_url" in patch:
            row.image_url = str(patch["image_url"] or "").strip() or None
        if "github_url" in patch:
            row.github_url = str(patch["github_url"] or "").strip() or None
        if "demo_url" in patch:
            row.demo_url = str(patch["demo_url"] or "").strip() or None
        if patch.get("status") is not None:
            row.status = patch["status"]
        db.flush()
        stage6.sync_project_evidence(db, row)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Could not update project")
        db.refresh(row)
        n = db.query(SkillEvidence).filter(SkillEvidence.user_id == cu.id, SkillEvidence.source_type == "project", SkillEvidence.source_id == row.id).count()
        return _ser_project(row, n)
    @app.delete("/api/projects/{project_id}")
    def delete_project(project_id: int, cu=Depends(me_dep), db=Depends(get_db)):
        row = db.query(Project).filter(Project.id == project_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        if row.owner_id != cu.id:
            raise HTTPException(status_code=403, detail="You can only delete your own projects")
        stage6.delete_source_evidence(db, user_id=cu.id, source_type="project", source_id=row.id)
        db.delete(row)
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Could not delete project")
        return {"message": "Project deleted"}
    @app.get("/api/skills/evidence")
    def get_skill_evidence(cu=Depends(me_dep), db=Depends(get_db)):
        stage6.recompute_user_evidence(db, cu.id)
        try:
            db.commit()
        except Exception:
            db.rollback()
        rows = db.query(SkillEvidence).filter(SkillEvidence.user_id == cu.id).order_by(SkillEvidence.id.desc()).all()
        by_skill = {}
        for r in rows:
            e = by_skill.setdefault(r.skill_id, {"skill_id": r.skill_id, "skill_name": r.skill.name if r.skill else "Unknown", "category": r.skill.category if r.skill else None, "evidence": []})
            e["evidence"].append(stage6.serialize_evidence(r))
        skills = []
        for sid, e in by_skill.items():
            ev = e["evidence"]
            e["evidence_count"] = len(ev)
            e["project_evidence"] = sum(1 for x in ev if x["source_type"] == "project")
            e["learning_evidence"] = sum(1 for x in ev if x["source_type"] == "learning")
            skills.append(e)
        skills.sort(key=lambda x: (-x["evidence_count"], x["skill_name"].lower()))
        return {"evidence": [stage6.serialize_evidence(r) for r in rows], "by_skill": skills, "total": len(rows)}
    @app.get("/api/skills/evidence/{skill_id}")
    def get_skill_evidence_one(skill_id: int, cu=Depends(me_dep), db=Depends(get_db)):
        rows = db.query(SkillEvidence).filter(SkillEvidence.user_id == cu.id, SkillEvidence.skill_id == skill_id).order_by(SkillEvidence.id.desc()).all()
        return {"skill_id": skill_id, "evidence": [stage6.serialize_evidence(r) for r in rows], "total": len(rows)}
    @app.get("/api/skills/growth")
    def get_skill_growth(cu=Depends(me_dep), db=Depends(get_db)):
        stage6.recompute_user_evidence(db, cu.id)
        try:
            db.commit()
        except Exception:
            db.rollback()
        return {"skills": stage6.skill_growth_summary(db, cu.id)}
    @app.get("/api/learning/overview")
    def get_learning_overview(cu=Depends(me_dep), db=Depends(get_db)):
        from models import LearningRecord as _LR
        recs = db.query(_LR).filter(_LR.user_id == cu.id).all()
        for r in recs:
            stage6.sync_learning_evidence(db, r)
        try:
            db.commit()
        except Exception:
            db.rollback()
        def _ser_lr(r):
            res_url = None
            if getattr(r, "resource", None) is not None:
                res_url = r.resource.url
            return {"id": r.id, "skill_name": r.skill_name, "resource_title": r.resource_title, "resource_type": r.resource_type, "resource_id": r.resource_id, "resource_url": res_url, "progress": r.progress_percentage, "status": r.status, "last_accessed": r.last_accessed.isoformat() if r.last_accessed else None, "time_spent_seconds": r.time_spent_seconds or 0, "created_at": r.created_at.isoformat() if r.created_at else None, "updated_at": r.updated_at.isoformat() if r.updated_at else None}
        items = [_ser_lr(r) for r in recs]
        total = len(items)
        done = sum(1 for i in items if (i["status"] or "").lower() == "completed" or (i["progress"] or 0) >= 100)
        avg = round(sum(i["progress"] or 0 for i in items) / total, 1) if total else 0.0
        by_skill = {}
        for i in items:
            key = (i["skill_name"] or "General").strip() or "General"
            e = by_skill.setdefault(key, {"skill": key, "count": 0, "psum": 0.0, "done": 0})
            e["count"] += 1
            e["psum"] += float(i["progress"] or 0)
            if (i["status"] or "").lower() == "completed":
                e["done"] += 1
        sp = [{"skill": k, "count": v["count"], "completed": v["done"], "avg_progress": round(v["psum"] / v["count"], 1) if v["count"] else 0.0} for k, v in by_skill.items()]
        sp.sort(key=lambda x: (-x["count"], -x["avg_progress"]))
        sitems = sorted(items, key=lambda x: x["updated_at"] or "", reverse=True)
        return {"total": total, "completed": done, "active": total - done, "overall_progress": avg, "skills_in_progress": sp, "recent": sitems[:5], "items": sitems}
