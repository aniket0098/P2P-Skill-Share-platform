"""MY LEARNING canonical API. Reuses LearningRecord + LearningResource,
stage6 evidence, Activity, CareerEvent, Stage 5 gaps. JWT user only."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload
from models import Activity, LearningRecord, LearningResource, Skill


def _iso(dt):
    return dt.isoformat() if dt else None


def _norm(progress, stored=None):
    try:
        pct = max(0.0, min(100.0, float(progress or 0)))
    except (TypeError, ValueError):
        pct = 0.0
    if pct >= 100:
        return "completed"
    if pct > 0:
        return "in_progress"
    s = (stored or "").strip().lower()
    if s in ("completed", "in_progress"):
        return s
    return "not_started"


def _display(canonical):
    return {"not_started": "NOT_STARTED", "in_progress": "IN_PROGRESS",
            "completed": "COMPLETED"}.get((canonical or "").lower(), "NOT_STARTED")


def _status_map():
    return {"not_started": "not_started", "not-started": "not_started",
            "notstarted": "not_started", "started": "not_started",
            "in_progress": "in_progress", "in-progress": "in_progress",
            "inprogress": "in_progress", "active": "in_progress",
            "completed": "completed", "complete": "completed", "done": "completed"}


def _parse_status(value, progress):
    if value is None:
        return _norm(progress)
    s = str(value).strip().lower()
    m = _status_map()
    if s not in m:
        raise HTTPException(status_code=422,
                            detail="Status must be NOT_STARTED, IN_PROGRESS or COMPLETED")
    return _norm(progress, m[s])


def _ser(r):
    pct = round(max(0.0, min(100.0, float(r.progress_percentage or 0))), 1)
    st = _norm(pct, r.status)
    res = getattr(r, "resource", None)
    return {"id": r.id, "skill_name": r.skill_name,
            "resource_title": r.resource_title, "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "resource_url": (res.url if res is not None else None),
            "resource_provider": (res.provider if res is not None else None),
            "resource_difficulty": (res.difficulty if res is not None else None),
            "progress": pct, "progress_percentage": pct, "status": st,
            "status_display": _display(st), "last_accessed": _iso(r.last_accessed),
            "time_spent_seconds": int(r.time_spent_seconds or 0),
            "created_at": _iso(r.created_at), "updated_at": _iso(r.updated_at)}


def _fmt_dur(total):
    s = max(0, int(total or 0))
    h, m = s // 3600, (s % 3600) // 60
    if h > 0:
        return ("%dh %dm" % (h, m)) if m else ("%dh" % h)
    return ("%dm" % m) if m > 0 else "0m"


def _touch(db, user_id, record, kind, desc):
    try:
        if kind == "learning_completed":
            marker = "[record:%d]" % record.id
            ex = db.query(Activity).filter(
                Activity.user_id == user_id,
                Activity.activity_type == "learning_completed",
                Activity.description.like("%%%s%%" % marker)).first()
            if ex:
                return
            desc = "%s %s" % (desc, marker)
        db.add(Activity(user_id=user_id, activity_type=kind,
                       title=("Learning" if kind == "learning_completed" else "Learning started"),
                       description=desc))
        db.flush()
    except Exception:
        pass


def _sync_ev(db, record, kind):
    n = 0
    try:
        import stage6_service as stage6
        rows = stage6.sync_learning_evidence(db, record) or []
        n = len(rows)
    except Exception:
        n = 0
    try:
        from careerverse_service import record_career_event
        title = (record.resource_title or record.skill_name or "Learning").strip()
        if kind == "completed":
            record_career_event(db, user_id=record.user_id,
                                event_type="learning_completed",
                                title=("Completed: %s" % title),
                                description=("%s - 100%" % (record.skill_name or "Skill")),
                                source_type="learning", source_id=record.id)
        elif kind == "started":
            record_career_event(db, user_id=record.user_id,
                                event_type="learning_started",
                                title=("Started: %s" % title),
                                description=("%s" % (record.skill_name or "Skill")),
                                source_type="learning", source_id=record.id)
    except Exception:
        pass
    return n


def _all(db, uid):
    return (db.query(LearningRecord).options(joinedload(LearningRecord.resource))
            .filter(LearningRecord.user_id == uid)
            .order_by(LearningRecord.updated_at.desc()).all())


def _stats(recs):
    total = len(recs)
    comp = sum(1 for r in recs if _norm(r.progress_percentage, r.status) == "completed")
    act = sum(1 for r in recs if _norm(r.progress_percentage, r.status) == "in_progress")
    avg = round(sum(float(r.progress_percentage or 0) for r in recs) / total, 1) if total else 0.0
    secs = sum(int(r.time_spent_seconds or 0) for r in recs)
    skills = set()
    for r in recs:
        nm = str(r.skill_name or "").strip()
        if nm:
            skills.add(nm)
    return {"total": total, "learning_items": total, "active": act,
            "in_progress": act, "completed": comp,
            "not_started": total - comp - act,
            "average_progress": avg, "overall_progress": avg,
            "total_time_seconds": secs, "total_time_formatted": _fmt_dur(secs),
            "skills_developing": len(skills), "skills_learning": len(skills)}


def _skills(recs):
    by = {}
    for r in recs:
        k = str(r.skill_name or "").strip() or "General"
        e = by.get(k)
        if e is None:
            e = {"skill": k, "skill_name": k, "count": 0, "psum": 0.0, "done": 0}
            by[k] = e
        e["count"] += 1
        e["psum"] += float(r.progress_percentage or 0)
        if _norm(r.progress_percentage, r.status) == "completed":
            e["done"] += 1
    out = []
    for k, v in by.items():
        avg = round(v["psum"] / v["count"], 1) if v["count"] else 0.0
        out.append({"skill": k, "skill_name": k, "count": v["count"],
                    "completed": v["done"], "avg_progress": avg})
    out.sort(key=lambda x: (-x["count"], -x["avg_progress"]))
    return out


def _feed(db, uid, limit=20):
    rows = (db.query(Activity).filter(Activity.user_id == uid)
            .filter(Activity.activity_type.in_(
                ["learning_started", "learning_progress", "learning_completed"]))
            .order_by(Activity.created_at.desc()).limit(limit).all())
    out = []
    for a in rows:
        out.append({"id": a.id, "activity_type": a.activity_type,
                    "description": a.description, "created_at": _iso(a.created_at)})
    return out


def _recos(db, user, recs, limit=6):
    try:
        import stage5_service as s5
        role, _src = s5.resolve_role(db, user)
        an = s5.analyze_role(db, user.id, role)
        gaps = [g for g in (an.get("items") or []) if g.get("status") != "matched"]
        started = set()
        for r in recs:
            if r.resource_id:
                started.add(r.resource_id)
        out = []
        for g in gaps:
            if len(out) >= limit:
                break
            nm = g.get("skill_name") or ""
            cand = (db.query(LearningResource)
                    .filter(func.lower(LearningResource.skill) == nm.lower())
                    .order_by(LearningResource.id).all())
            ch = None
            for c in cand:
                if c.id not in started:
                    ch = c
                    break
            if ch is None and cand:
                ch = cand[0]
            res = None
            if ch is not None:
                res = {"id": ch.id, "title": ch.title, "provider": ch.provider,
                       "url": ch.url, "resource_type": ch.resource_type,
                       "difficulty": ch.difficulty}
            reason = g.get("reason") or ("%s is a %s gap for %s."
                                         % (nm, g.get("priority", "priority"), role.title))
            out.append({"skill_id": g.get("skill_id"), "skill_name": nm,
                        "required_level": g.get("required_level"),
                        "priority": g.get("priority"),
                        "demand_score": g.get("demand_score"),
                        "reason": reason, "resource": res})
        msg = ("Based on skill gaps for %s." % role.title) if out else None
        return {"target_role": role.title, "has_target": True,
                "recommendations": out, "message": msg}
    except Exception:
        cont = [r for r in recs
                if _norm(r.progress_percentage, r.status) == "in_progress"][:limit]
        rec_list = []
        for r in cont:
            res = None
            if r.resource_id:
                res = {"id": r.resource_id, "title": r.resource_title}
            rec_list.append({"skill_name": r.skill_name,
                             "reason": ("Continue '%s'." % r.resource_title),
                             "record_id": r.id, "resource": res})
        return {"target_role": None, "has_target": False,
                "recommendations": rec_list,
                "message": "Choose a target career to receive personalized recommendations."}


def _roadmap(db, user, recs):
    try:
        import stage5_service as s5
        role, _src = s5.resolve_role(db, user)
        an = s5.analyze_role(db, user.id, role)
        by = {}
        for r in recs:
            k = str(r.skill_name or "").strip().lower()
            if k and k not in by:
                by[k] = r
        steps = []
        for it in (an.get("items") or [])[:12]:
            rec = by.get(str(it.get("skill_name") or "").lower())
            if it.get("status") == "matched":
                st = "done"
            elif rec is None:
                st = "todo"
            elif _norm(rec.progress_percentage, rec.status) == "completed":
                st = "done"
            else:
                st = "current"
            steps.append({"skill_name": it.get("skill_name"),
                          "status": it.get("status"), "state": st,
                          "required_level": it.get("required_level"),
                          "record_id": (rec.id if rec else None),
                          "progress": (round(float(rec.progress_percentage or 0), 1)
                                       if rec else 0)})
        cur = None
        for s in steps:
            if s["state"] != "done":
                cur = s
                break
        if cur is not None and cur["state"] == "todo":
            cur["state"] = "next"
        return {"target_role": role.title, "has_target": True, "steps": steps}
    except Exception:
        return {"target_role": None, "has_target": False, "steps": [],
                "message": "Choose a target career to see your learning roadmap."}


class ProgressIn(BaseModel):
    progress: float | None = None
    progress_percentage: float | None = None
    status: str | None = None
    time_spent_seconds: int | None = None

    @field_validator("progress", "progress_percentage")
    @classmethod
    def _pct(cls, v):
        if v is None:
            return v
        f = float(v)
        if f < 0 or f > 100:
            raise ValueError("progress_percentage must be between 0 and 100")
        return f

    @field_validator("time_spent_seconds")
    @classmethod
    def _secs(cls, v):
        if v is None:
            return v
        n = int(v)
        if n < 0 or n > 86400 * 30:
            raise ValueError("time_spent_seconds out of range")
        return n


class TimeIn(BaseModel):
    seconds: int

    @field_validator("seconds")
    @classmethod
    def _secs(cls, v):
        n = int(v)
        if n <= 0 or n > 12 * 3600:
            raise ValueError("seconds must be between 1 and 43200")
        return n


def register_learning(app, get_db, me_dep):
    @app.get("/api/learning/me")
    def learning_me(db: Session = Depends(get_db), cu=Depends(me_dep)):
        recs = _all(db, cu.id)
        items = [_ser(r) for r in recs]
        st = _stats(recs)
        act = [i for i in items if i["status"] == "in_progress"]
        done = [i for i in items if i["status"] == "completed"]
        todo = [i for i in items if i["status"] == "not_started"]
        return {"overview": st, "stats": st, "active": act,
                "completed": done, "not_started": todo,
                "history": items, "records": items, "items": items,
                "skills": _skills(recs), "recent_activity": _feed(db, cu.id, 20)}

    @app.get("/api/learning/stats")
    def learning_stats(db: Session = Depends(get_db), cu=Depends(me_dep)):
        return _stats(_all(db, cu.id))

    @app.get("/api/learning/active")
    def learning_active(db: Session = Depends(get_db), cu=Depends(me_dep)):
        out = []
        for r in _all(db, cu.id):
            if _norm(r.progress_percentage, r.status) == "in_progress":
                out.append(_ser(r))
        return {"records": out}

    @app.get("/api/learning/completed")
    def learning_completed(db: Session = Depends(get_db), cu=Depends(me_dep)):
        out = []
        for r in _all(db, cu.id):
            if _norm(r.progress_percentage, r.status) == "completed":
                out.append(_ser(r))
        return {"records": out}

    @app.get("/api/learning/history")
    def learning_history(status: str | None = None, skill: str | None = None,
                         q: str | None = None, sort: str = "recent",
                         db: Session = Depends(get_db), cu=Depends(me_dep)):
        query = (db.query(LearningRecord).options(joinedload(LearningRecord.resource))
                 .filter(LearningRecord.user_id == cu.id))
        if skill:
            query = query.filter(func.lower(LearningRecord.skill_name) == skill.strip().lower())
        if q:
            like = "%%%s%%" % q.strip()
            query = query.filter(or_(LearningRecord.resource_title.ilike(like),
                                     LearningRecord.skill_name.ilike(like),
                                     LearningRecord.resource_type.ilike(like)))
        rows = query.all()
        items = [_ser(r) for r in rows]
        if status:
            s = status.strip().lower()
            if s in ("not-started", "started"):
                s = "not_started"
            if s in ("not_started", "in_progress", "completed"):
                items = [i for i in items if i["status"] == s]
        key = (sort or "recent").strip().lower()
        if key in ("progress", "progress_desc"):
            items.sort(key=lambda i: i["progress"], reverse=True)
        elif key == "progress_asc":
            items.sort(key=lambda i: i["progress"])
        elif key in ("newest", "created"):
            items.sort(key=lambda i: i["created_at"] or "", reverse=True)
        elif key in ("time", "learning_time"):
            items.sort(key=lambda i: i["time_spent_seconds"], reverse=True)
        elif key in ("alpha", "alphabetical", "title"):
            items.sort(key=lambda i: (i["resource_title"] or "").lower())
        else:
            items.sort(key=lambda i: i["last_accessed"] or i["updated_at"] or "",
                       reverse=True)
        sk = sorted(set((r.skill_name or "").strip() for r in rows
                        if (r.skill_name or "").strip()))
        ty = sorted(set((r.resource_type or "").strip() for r in rows
                        if (r.resource_type or "").strip()))
        return {"records": items, "total": len(items),
                "skills": sk, "resource_types": ty}

    @app.get("/api/learning/recommendations")
    def learning_recos(limit: int = 6, db: Session = Depends(get_db), cu=Depends(me_dep)):
        return _recos(db, cu, _all(db, cu.id), max(1, min(limit, 12)))

    @app.get("/api/learning/roadmap")
    def learning_roadmap(db: Session = Depends(get_db), cu=Depends(me_dep)):
        return _roadmap(db, cu, _all(db, cu.id))

    @app.get("/api/learning/activity")
    def learning_activity(limit: int = 20, db: Session = Depends(get_db), cu=Depends(me_dep)):
        return {"activity": _feed(db, cu.id, max(1, min(limit, 100)))}

    @app.post("/api/learning/start/{resource_id}")
    def learning_start(resource_id: int, db: Session = Depends(get_db), cu=Depends(me_dep)):
        resource = db.get(LearningResource, resource_id)
        if not resource:
            raise HTTPException(status_code=404, detail="Learning resource not found")
        ex = (db.query(LearningRecord).options(joinedload(LearningRecord.resource))
              .filter(LearningRecord.user_id == cu.id,
                      LearningRecord.resource_id == resource.id).first())
        if ex is not None:
            ex.last_accessed = datetime.now(timezone.utc)
            db.commit()
            db.refresh(ex)
            _sync_ev(db, ex, "resumed")
            try:
                db.commit()
            except Exception:
                db.rollback()
            db.refresh(ex)
            return {"record": _ser(ex), "created": False,
                    "message": "Resumed existing learning record."}
        rec = LearningRecord(user_id=cu.id, skill_name=(resource.skill or "General"),
                             resource_title=resource.title,
                             resource_type=(resource.resource_type or "course"),
                             progress_percentage=0, status="not_started",
                             resource_id=resource.id,
                             last_accessed=datetime.now(timezone.utc))
        db.add(rec)
        db.flush()
        if rec.skill_name:
            es = db.query(Skill).filter(
                func.lower(Skill.name) == rec.skill_name.strip().lower()).first()
            if es is None:
                db.add(Skill(name=rec.skill_name.strip()))
                db.flush()
        _touch(db, cu.id, rec, "learning_started", ("Started: %s" % rec.resource_title))
        _sync_ev(db, rec, "started")
        db.commit()
        db.refresh(rec)
        return {"record": _ser(rec), "created": True,
                "message": ("Started '%s'." % rec.resource_title)}

    @app.patch("/api/learning/{record_id}/progress")
    def learning_progress(record_id: int, payload: ProgressIn,
                          db: Session = Depends(get_db), cu=Depends(me_dep)):
        rec = db.get(LearningRecord, record_id)
        if not rec or rec.user_id != cu.id:
            raise HTTPException(status_code=404, detail="Learning record not found")
        pct = payload.progress_percentage
        if pct is None:
            pct = payload.progress
        if pct is None:
            pct = float(rec.progress_percentage or 0)
        pct = round(max(0.0, min(100.0, float(pct))), 1)
        was_done = _norm(rec.progress_percentage, rec.status) == "completed"
        rec.progress_percentage = pct
        rec.status = _parse_status(payload.status, pct)
        rec.last_accessed = datetime.now(timezone.utc)
        if payload.time_spent_seconds:
            rec.time_spent_seconds = int(rec.time_spent_seconds or 0) + int(payload.time_spent_seconds)
        db.flush()
        now_done = rec.status == "completed"
        kind = "completed" if (now_done and not was_done) else "progress"
        if now_done and not was_done:
            _touch(db, cu.id, rec, "learning_completed",
                   ("Completed: %s" % rec.resource_title))
        _sync_ev(db, rec, kind)
        db.commit()
        db.refresh(rec)
        msg = ("Learning completed! Evidence updated."
               if (now_done and not was_done) else "Progress updated.")
        return {"record": _ser(rec), "was_completed": now_done, "message": msg}

    @app.patch("/api/learning/{record_id}/time")
    def learning_time(record_id: int, payload: TimeIn,
                      db: Session = Depends(get_db), cu=Depends(me_dep)):
        rec = db.get(LearningRecord, record_id)
        if not rec or rec.user_id != cu.id:
            raise HTTPException(status_code=404, detail="Learning record not found")
        rec.time_spent_seconds = int(rec.time_spent_seconds or 0) + int(payload.seconds)
        rec.last_accessed = datetime.now(timezone.utc)
        db.flush()
        try:
            import stage6_service as stage6
            stage6.sync_learning_evidence(db, rec)
        except Exception:
            pass
        db.commit()
        db.refresh(rec)
        return {"record": _ser(rec), "message": "Learning time recorded."}

