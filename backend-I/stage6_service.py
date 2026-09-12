"""Stage 6 evidence helpers: learning/project -> skill evidence."""
from __future__ import annotations
import json
from sqlalchemy import func as _func
from sqlalchemy.orm import Session
from models import LearningRecord, LearningResource, Project, Skill, SkillEvidence, SkillHistory, UserSkill
LEARNING_BASE = 20.0
LEARNING_PROGRESS_FACTOR = 0.5
PROJECT_BASE = 45.0
PROJECT_GITHUB_BONUS = 10.0
PROJECT_DEMO_BONUS = 10.0
PROJECT_PUBLISHED_BONUS = 5.0
PROJECT_SCORE_CAP = 70.0
def _clean_tokens(csv_text):
    if not csv_text:
        return []
    parts = csv_text if isinstance(csv_text, list) else str(csv_text).split(",")
    out = []
    for p in parts:
        t = str(p or "").strip()
        if t and t not in out:
            out.append(t)
    return out
def get_or_create_skill(db: Session, name: str, category=None):
    clean = (name or "").strip()
    if not clean:
        return None
    skill = db.query(Skill).filter(_func.lower(Skill.name) == clean.lower()).first()
    if skill:
        return skill
    skill = Skill(name=clean, category=category)
    db.add(skill)
    db.flush()
    return skill
def _parse_progress(value) -> float:
    try:
        p = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(100.0, p))
def learning_evidence_score(progress: float) -> float:
    return round(LEARNING_BASE + _parse_progress(progress) * LEARNING_PROGRESS_FACTOR, 1)
def project_evidence_score(project: Project) -> float:
    score = PROJECT_BASE
    if (getattr(project, "github_url", None) or "").strip():
        score += PROJECT_GITHUB_BONUS
    if (getattr(project, "demo_url", None) or "").strip():
        score += PROJECT_DEMO_BONUS
    if str(getattr(project, "status", "") or "").lower() in ("published", "completed"):
        score += PROJECT_PUBLISHED_BONUS
    return round(min(score, PROJECT_SCORE_CAP), 1)
def evidence_badge(confidence: str) -> str:
    m = {"verified": "Verified", "project": "Project Evidence", "learning": "Learning Evidence", "self_reported": "Self-reported"}
    return m.get((confidence or "").lower(), "Self-reported")
def upsert_evidence(db, *, user_id, skill_id, source_type, source_id, score, confidence, evidence_text=None, extra=None):
    q = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id, SkillEvidence.skill_id == skill_id, SkillEvidence.source_type == source_type)
    q = q.filter(SkillEvidence.source_id.is_(None)) if source_id is None else q.filter(SkillEvidence.source_id == source_id)
    row = q.first()
    payload_extra = None
    if extra:
        try:
            payload_extra = json.dumps(extra)[:2000]
        except Exception:
            payload_extra = None
    if row:
        row.score = float(score)
        row.confidence = confidence
        if evidence_text:
            row.evidence_text = evidence_text
        if payload_extra is not None:
            row.extra_data = payload_extra
        db.flush()
        return row
    row = SkillEvidence(user_id=user_id, skill_id=skill_id, source_type=source_type, source_id=source_id, score=float(score), confidence=confidence, evidence_text=evidence_text, extra_data=payload_extra)
    db.add(row)
    db.flush()
    return row
def delete_source_evidence(db, *, user_id, source_type, source_id) -> int:
    rows = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id, SkillEvidence.source_type == source_type, SkillEvidence.source_id == source_id).all()
    for r in rows:
        db.delete(r)
    db.flush()
    return len(rows)
def record_history(db, *, user_id, skill_id, event_type, note=None, evidence_count=None, confidence=None, from_level=None, to_level=None):
    row = SkillHistory(user_id=user_id, skill_id=skill_id, event_type=event_type, note=(note or "")[:500] if note else None, evidence_count=evidence_count, confidence=confidence, from_level=from_level, to_level=to_level)
    db.add(row)
    db.flush()
    return row
def skills_for_learning_resource(resource, record):
    names = []
    if resource is not None and (resource.skill or "").strip():
        names.append(resource.skill.strip())
    if record and (record.skill_name or "").strip():
        for tok in _clean_tokens(record.skill_name):
            if tok not in names:
                names.append(tok)
    return names
def skills_for_project(project):
    techs = _clean_tokens(getattr(project, "technologies", None))
    extra = _clean_tokens(getattr(project, "skills", None))
    names = []
    for tok in techs + extra:
        if tok not in names:
            names.append(tok)
    drop = {"web development", "data science", "ai/ml", "design", "creative", "hardware"}
    return [n for n in names if n.lower() not in drop]
def serialize_evidence(row) -> dict:
    nm = row.skill.name if row.skill else "Unknown"
    cat = row.skill.category if row.skill else None
    ca = row.created_at.isoformat() if row.created_at else None
    ua = row.updated_at.isoformat() if row.updated_at else None
    return {"id": row.id, "skill_id": row.skill_id, "skill_name": nm, "category": cat, "source_type": row.source_type, "source_id": row.source_id, "score": float(row.score or 0), "confidence": row.confidence, "badge": evidence_badge(row.confidence), "evidence_text": row.evidence_text, "created_at": ca, "updated_at": ua}
def confidence_for_counts(pn: int, ln: int, verified: bool) -> str:
    if verified:
        return "Verified"
    t = pn + ln
    if t >= 4 or (pn >= 1 and ln >= 1 and t >= 3):
        return "High"
    if t >= 2:
        return "Moderate"
    if t == 1:
        return "Low"
    return "No evidence"
def sync_learning_evidence(db, record) -> list:
    rid = getattr(record, "resource_id", None)
    resource = db.query(LearningResource).filter(LearningResource.id == rid).first() if rid else None
    names = skills_for_learning_resource(resource, record)
    stale = db.query(SkillEvidence).filter(SkillEvidence.user_id == record.user_id, SkillEvidence.source_type == "learning", SkillEvidence.source_id == record.id).all()
    wanted = set()
    out = []
    prog = _parse_progress(getattr(record, "progress", 0))
    score = learning_evidence_score(prog)
    st = str(getattr(record, "status", "") or "").lower()
    done = st == "completed" or prog >= 100
    label = "Completed" if done else f"{prog:g}% progress"
    title = resource.title if resource else (record.skill_name or "Learning activity")
    for name in names:
        sk = get_or_create_skill(db, name)
        if not sk:
            continue
        wanted.add(sk.id)
        out.append(upsert_evidence(db, user_id=record.user_id, skill_id=sk.id, source_type="learning", source_id=record.id, score=score, confidence="learning", evidence_text=f"{label} — {title}", extra={"progress": prog}))
    for row in stale:
        if row.skill_id not in wanted:
            db.delete(row)
    db.flush()
    if done:
        for row in out:
            hs = db.query(SkillHistory).filter(SkillHistory.user_id == record.user_id, SkillHistory.skill_id == row.skill_id, SkillHistory.event_type == "learning_completed").all()
            if not any((h.note or "").find(f"#{record.id}") >= 0 for h in hs):
                record_history(db, user_id=record.user_id, skill_id=row.skill_id, event_type="learning_completed", note=f"Completed learning record #{record.id}", confidence="learning")
    return out
def sync_project_evidence(db, project) -> list:
    names = skills_for_project(project)
    stale = db.query(SkillEvidence).filter(SkillEvidence.user_id == project.owner_id, SkillEvidence.source_type == "project", SkillEvidence.source_id == project.id).all()
    wanted = set()
    out = []
    score = project_evidence_score(project)
    gh = bool((project.github_url or "").strip())
    dm = bool((project.demo_url or "").strip())
    for name in names:
        sk = get_or_create_skill(db, name)
        if not sk:
            continue
        wanted.add(sk.id)
        out.append(upsert_evidence(db, user_id=project.owner_id, skill_id=sk.id, source_type="project", source_id=project.id, score=score, confidence="project", evidence_text=f"Project evidence — {project.title}", extra={"has_github": gh, "has_demo": dm}))
    for row in stale:
        if row.skill_id not in wanted:
            db.delete(row)
    db.flush()
    return out
def skill_growth_summary(db, user_id: int) -> list:
    usrows = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    evrows = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id).all()
    hrows = db.query(SkillHistory).filter(SkillHistory.user_id == user_id).order_by(SkillHistory.created_at.desc()).limit(200).all()
    by_skill = {}
    for r in usrows:
        by_skill.setdefault(r.skill_id, {"us": r, "ev": [], "hi": []})
    for e in evrows:
        by_skill.setdefault(e.skill_id, {"us": None, "ev": [], "hi": []})["ev"].append(e)
    for h in hrows:
        by_skill.setdefault(h.skill_id, {"us": None, "ev": [], "hi": []})["hi"].append(h)
    out = []
    for sid, e in by_skill.items():
        us = e.get("us")
        ev = e.get("ev", [])
        hi = e.get("hi", [])
        so = us.skill if us and us.skill else (ev[0].skill if ev else (hi[0].skill if hi else None))
        pn = sum(1 for x in ev if x.source_type == "project")
        ln = sum(1 for x in ev if x.source_type == "learning")
        ver = bool(us and us.is_verified)
        out.append({"skill_id": sid, "skill_name": so.name if so else "Unknown", "category": so.category if so else None, "level": (us.level if us else None), "evidence_count": len(ev), "project_evidence": pn, "learning_evidence": ln, "confidence": confidence_for_counts(pn, ln, ver), "is_verified": ver, "evidence": [serialize_evidence(x) for x in sorted(ev, key=lambda z: z.id)], "history": [{"id": h.id, "event_type": h.event_type, "note": h.note, "confidence": h.confidence, "created_at": h.created_at.isoformat() if h.created_at else None} for h in sorted(hi, key=lambda z: z.id, reverse=True)[:10]]})
    out.sort(key=lambda x: (-x["evidence_count"], x["skill_name"].lower()))
    return out
def recompute_user_evidence(db, user_id: int) -> dict:
    recs = db.query(LearningRecord).filter(LearningRecord.user_id == user_id).all()
    projs = db.query(Project).filter(Project.owner_id == user_id).all()
    n = 0
    for r in recs:
        n += len(sync_learning_evidence(db, r))
    for p in projs:
        n += len(sync_project_evidence(db, p))
    db.flush()
    return {"learning_records": len(recs), "projects": len(projs), "evidence_rows": n}

