"""MY LEARNING + EXPLORE SKILLS canonical API. Reuses LearningRecord +
LearningResource, stage6 evidence, Activity, CareerEvent, Stage 5 gaps.
JWT user only. Adds: public catalog, course detail, watch-progress
(unique watched ranges), bookmarks."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload
from models import (Activity, LearningBookmark, LearningRecord,
                    LearningResource, LearningWatchSegment, Skill, User)


def _optional_user(request: Request, db: Session):
    """Best-effort JWT user for public catalog (never raises)."""
    try:
        authz = request.headers.get("authorization", "") or ""
        if not authz.lower().startswith("bearer "):
            return None
        token = authz.split(" ", 1)[1].strip()
        if not token:
            return None
        import auth as authmod
        payload = authmod.decode_access_token(token)
        if not payload:
            return None
        uid = int(payload.get("sub"))
        return db.get(User, uid)
    except Exception:
        return None


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
    watched = int(getattr(r, "watched_seconds", 0) or 0)
    pos = int(getattr(r, "last_position_seconds", 0) or 0)
    total = getattr(r, "total_duration_seconds", None)
    if total is None and res is not None:
        total = getattr(res, "duration_seconds", None)
    try:
        total = int(total) if total else 0
    except (TypeError, ValueError):
        total = 0
    if total and total > 0:
        # Server is source of truth: progress derives from unique watched time.
        pct = round(min(100.0, watched / total * 100.0), 1)
    return {"id": r.id, "skill_name": r.skill_name,
            "resource_title": r.resource_title, "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "resource_url": (res.url if res is not None else None),
            "resource_media_url": (getattr(res, "media_url", None) if res is not None else None),
            "resource_provider": (res.provider if res is not None else None),
            "resource_difficulty": (res.difficulty if res is not None else None),
            "resource_category": (getattr(res, "category", None) if res is not None else None),
            "resource_course_key": (getattr(res, "course_key", None) if res is not None else None),
            "progress": pct, "progress_percentage": pct, "status": st,
            "status_display": _display(st), "last_accessed": _iso(r.last_accessed),
            "time_spent_seconds": int(r.time_spent_seconds or 0),
            "watched_seconds": watched, "last_position_seconds": pos,
            "total_duration_seconds": total,
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


def _norm_text(v):
    return str(v or "").strip()


def _yt_id(url):
    """Extract a real YouTube video id from a watch/embed/shorts URL.

    Returns None when the URL is not a YouTube video, so non-embeddable
    resources are never presented as watchable.
    """
    import re
    u = str(url or "")
    m = re.search(
        r"(?:youtube\.com/(?:watch\?[^#]*v=|embed/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,})",
        u)
    return m.group(1) if m else None


def _is_watchable(res):
    """True only when a real, embeddable video source exists.

    media_url: direct MP4 (project-hosted sample lectures).
    url: validated YouTube video (embedded via IFrame player API).
    Everything else is an external reading/course link -> NOT watchable,
    so the UI must offer an "Open source" action instead of a fake player.
    """
    if str(getattr(res, "media_url", "") or "").strip():
        return True
    return bool(_yt_id(getattr(res, "url", None)))


def _dur_secs(res):
    """Duration in seconds.

    Prefers explicit duration_seconds (project-hosted sample lectures).
    Falls back to parsing estimated_duration strings ONLY for course-level
    catalog display — long provider courses are not second-precision
    watchable videos. Returns 0 when unknown.
    """
    try:
        explicit = int(getattr(res, "duration_seconds", None) or 0)
    except (TypeError, ValueError):
        explicit = 0
    if explicit > 0:
        return explicit
    import re
    txt = _norm_text(getattr(res, "estimated_duration", None)).lower()
    if not txt:
        return 0
    m = re.search(r"(\d+(?:\.\d+)?)\s*(hour|hr|minute|min)", txt)
    if not m:
        return 0
    val, unit = float(m.group(1)), m.group(2)
    if unit.startswith("hour") or unit == "hr":
        return int(val * 3600)
    return int(val * 60)


def _fmt_secs(total):
    s = max(0, int(total or 0))
    h, m = s // 3600, (s % 3600) // 60
    if h > 0:
        return ("%dh %dm" % (h, m)) if m else ("%dh" % h)
    if m > 0:
        return "%dm" % m
    return ("%ds" % s) if s else "0m"


def _cat_for(res):
    c = _norm_text(getattr(res, "category", None))
    if c:
        return c
    skill = _norm_text(getattr(res, "skill", None)).lower()
    comm = {"english speaking", "professional communication", "public speaking",
            "presentation skills", "interview communication", "business writing",
            "english", "communication"}
    career = {"resume building", "linkedin profile building", "interview preparation",
              "aptitude", "problem solving", "team collaboration"}
    biz = {"excel", "data analysis", "project management", "entrepreneurship",
           "design thinking"}
    if skill in comm:
        return "Communication"
    if skill in career:
        return "Career"
    if skill in biz:
        return "Business"
    return "Technology"


def _ser_res(res, rec=None, saved=False):
    secs = _dur_secs(res)
    pct = round(float(getattr(rec, "progress_percentage", 0) or 0), 1) if rec else 0.0
    if rec is not None:
        watched = int(getattr(rec, "watched_seconds", 0) or 0)
        rtotal = int(getattr(rec, "total_duration_seconds", 0) or 0) or secs
        if rtotal > 0:
            pct = round(min(100.0, watched / rtotal * 100.0), 1)
    st = _norm(pct, getattr(rec, "status", None) if rec else None)
    return {"id": res.id, "title": res.title, "description": res.description,
            "provider": res.provider, "url": res.url,
            "media_url": getattr(res, "media_url", None),
            "thumbnail_url": res.thumbnail_url,
            "resource_type": res.resource_type, "skill": res.skill,
            "topic": res.topic, "difficulty": (res.difficulty or "beginner").lower(),
            "category": _cat_for(res), "estimated_duration": res.estimated_duration,
            "duration_seconds": secs,
            "duration_label": (_fmt_secs(secs) if secs else (res.estimated_duration or "Self-paced")),
            "source_platform": res.source_platform,
            "course_key": getattr(res, "course_key", None),
            "course_title": getattr(res, "course_title", None),
            "lecture_order": int(getattr(res, "lecture_order", 0) or 0),
            "is_lecture": bool(getattr(res, "is_lecture", False)),
            "watchable": bool(_is_watchable(res)),
            "yt_id": _yt_id(res.url) if not getattr(res, "media_url", None) else None,
            "progress": pct, "status": st, "record_id": (rec.id if rec else None),
            "watched_seconds": (int(getattr(rec, "watched_seconds", 0) or 0) if rec else 0),
            "last_position_seconds": (int(getattr(rec, "last_position_seconds", 0) or 0) if rec else 0),
            "saved": bool(saved)}


def _merge_ranges(segs):
    """Merge [start,end) intervals; returns (merged, unique_seconds)."""
    ivs = []
    for s, e in segs:
        try:
            a, b = int(s), int(e)
        except (TypeError, ValueError):
            continue
        if b <= a or a < 0:
            continue
        ivs.append((a, b))
    ivs.sort()
    merged = []
    for a, b in ivs:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return merged, sum(b - a for a, b in merged)


def _recalc_from_segments(db, rec, total):
    segs = db.query(LearningWatchSegment).filter(
        LearningWatchSegment.record_id == rec.id).all()
    merged, unique = _merge_ranges([(s.start_sec, s.end_sec) for s in segs])
    unique = max(0, int(unique))
    # Compact stored segments to the merged union (bounded row count).
    for s in segs:
        db.delete(s)
    db.flush()
    for a, b in merged[-64:]:
        db.add(LearningWatchSegment(record_id=rec.id, start_sec=a, end_sec=b))
    db.flush()
    total = max(0, int(total or 0))
    rec.watched_seconds = unique
    rec.total_duration_seconds = total or None
    if total > 0:
        rec.watched_seconds = min(unique, total)
        rec.progress_percentage = round(min(100.0, unique / total * 100.0), 1)
    else:
        rec.progress_percentage = round(max(0.0, min(100.0, float(rec.progress_percentage or 0))), 1)
    pct = float(rec.progress_percentage or 0)
    if pct >= 100:
        rec.status = "completed"
    elif pct > 0 and (rec.status or "") == "not_started":
        rec.status = "in_progress"
    return unique


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


class WatchIn(BaseModel):
    segments: list | None = None
    position_seconds: int | None = None
    duration_seconds: int | None = None
    completed: bool = False

    @field_validator("segments")
    @classmethod
    def seg_valid(cls, v):
        if v is None:
            return []
        if not isinstance(v, list) or len(v) > 64:
            raise ValueError("segments: max 64 ranges")
        out = []
        for item in v:
            if not isinstance(item, (list, tuple)) or len(item) != 2:
                raise ValueError("each segment must be [start, end]")
            try:
                a, b = int(item[0]), int(item[1])
            except (TypeError, ValueError):
                raise ValueError("segment bounds must be integers")
            if b <= a or a < 0 or (b - a) > 36000:
                raise ValueError("invalid segment range")
            out.append([a, b])
        return out



class TimeIn(BaseModel):
    seconds: int

    @field_validator("seconds")
    @classmethod
    def _secs(cls, v):
        n = int(v)
        if n <= 0 or n > 12 * 3600:
            raise ValueError("seconds must be between 1 and 43200")
        return n


class RecordInit(BaseModel):
    """Real runtime duration reported by the actual media player.

    Used only to establish a canonical total for resources that have no
    pre-seeded duration (e.g. YouTube full-course videos). The value must
    match the resource's explicit duration within 10% when one is set;
    otherwise 60 s .. 12 h is accepted and persisted on the record.
    """

    duration_seconds: int

    @field_validator("duration_seconds")
    @classmethod
    def _dur(cls, v):
        n = int(v)
        if n < 10 or n > 12 * 3600:
            raise ValueError("duration_seconds must be between 10 and 43200")
        return n


def register_learning(app, get_db, me_dep):
    @app.get("/api/learning/catalog")
    def learning_catalog(request: Request, db: Session = Depends(get_db)):
        cu = None
        try:
            cu = _optional_user(request, db)
        except Exception:
            cu = None
        resources = (db.query(LearningResource)
                     .order_by(LearningResource.skill.asc(),
                               LearningResource.id.asc()).all())
        rec_by_res = {}
        saved_ids = set()
        if cu is not None:
            for r in _all(db, cu.id):
                if r.resource_id:
                    rec_by_res[r.resource_id] = r
            saved_ids = {b.resource_id for b in
                         db.query(LearningBookmark).filter(
                             LearningBookmark.user_id == cu.id).all()}
        items = [_ser_res(r, rec_by_res.get(r.id), r.id in saved_ids)
                 for r in resources]
        courses = {}
        for it, res in zip(items, resources):
            key = getattr(res, "course_key", None) or None
            if not key:
                continue
            c = courses.get(key)
            if c is None:
                c = courses[key] = {
                    "course_key": key,
                    "course_title": getattr(res, "course_title", None) or ((res.skill or "General") + " Course"),
                    "skill": res.skill, "category": it["category"],
                    "difficulty": it["difficulty"], "provider": res.provider,
                    "lectures": [], "total_seconds": 0,
                    "watched_seconds": 0, "started": 0, "completed": 0,
                    "saved": False, "record_id": None, "progress": 0.0,
                    "status": "not_started", "thumbnail_seed": res.skill or key,
                    "description": res.description or ""}
            c["lectures"].append(it)
            c["total_seconds"] += int(it["duration_seconds"] or 0)
            if it["duration_seconds"]:
                c["watched_seconds"] += min(int(it.get("watched_seconds", 0) or 0),
                                            int(it["duration_seconds"] or 0))
            if it["record_id"]:
                c["started"] += 1
                if c["record_id"] is None:
                    c["record_id"] = it["record_id"]
            if it["status"] == "completed":
                c["completed"] += 1
            if it.get("saved"):
                c["saved"] = True
        course_list = []
        for key, c in courses.items():
            c["lectures"].sort(key=lambda x: (x["lecture_order"] or 0, x["id"]))
            tot = int(c["total_seconds"] or 0)
            w = min(int(c["watched_seconds"] or 0), tot) if tot else 0
            c["progress"] = round(min(100.0, w / tot * 100.0), 1) if tot else 0.0
            c["status"] = "completed" if (c["lectures"] and c["completed"] == len(c["lectures"])) else ("in_progress" if c["started"] else "not_started")
            c["lecture_count"] = len(c["lectures"])
            c["duration_label"] = _fmt_secs(tot)
            c["first_lecture_id"] = c["lectures"][0]["id"] if c["lectures"] else None
            course_list.append(c)
        course_list.sort(key=lambda cc: (-(1 if cc["started"] else 0), (cc["course_title"] or "").lower()))
        lectures = [it for it in items if it.get("is_lecture")]
        by_skill = {}
        for it in items:
            s = by_skill.get(it["skill"] or "General")
            if s is None:
                s = by_skill[it["skill"] or "General"] = {
                    "skill": it["skill"] or "General",
                    "category": it["category"], "count": 0,
                    "lectures": 0, "courses": set(), "sample": None}
            s["count"] += 1
            if it.get("is_lecture"):
                s["lectures"] += 1
            if it.get("course_key"):
                s["courses"].add(it["course_key"])
            if s["sample"] is None:
                s["sample"] = {"id": it["id"], "title": it["title"]}
        skills = [{"skill": v["skill"], "category": v["category"],
                   "resources": v["count"], "lectures": v["lectures"],
                   "courses": len(v["courses"]), "sample": v["sample"]}
                  for v in by_skill.values()]
        skills.sort(key=lambda s: (-s["resources"], s["skill"].lower()))
        return {"resources": items, "courses": course_list,
                "lectures": lectures, "skills": skills,
                "counts": {"resources": len(items),
                           "courses": len(course_list),
                           "lectures": len(lectures),
                           "skills": len(skills),
                           "watchable_lectures": sum(
                               1 for it in lectures if it.get("watchable"))}}
    @app.get("/api/learning/courses/{course_key}")
    def learning_course(course_key: str, request: Request,
                        db: Session = Depends(get_db)):
        cu = None
        try:
            cu = _optional_user(request, db)
        except Exception:
            cu = None
        rows = (db.query(LearningResource)
                .filter(LearningResource.course_key == course_key)
                .order_by(LearningResource.lecture_order.asc(),
                          LearningResource.id.asc()).all())
        if not rows:
            raise HTTPException(status_code=404, detail="Course not found")
        rec_by_res = {}
        saved_ids = set()
        if cu is not None:
            for r in _all(db, cu.id):
                if r.resource_id:
                    rec_by_res[r.resource_id] = r
            saved_ids = {b.resource_id for b in
                         db.query(LearningBookmark).filter(
                             LearningBookmark.user_id == cu.id).all()}
        items = [_ser_res(r, rec_by_res.get(r.id), r.id in saved_ids)
                 for r in rows]
        # Duration-weighted course progress. Lectures without a stored
        # duration fall back to the learner record's duration, then to the
        # average known lecture duration, so zero-duration metadata cannot
        # hide real per-lecture progress.
        durs = [int(getattr(r, "duration_seconds", 0) or 0) for r in rows]
        known = [d for d in durs if d > 0]
        est = int(round(sum(known) / float(len(known)))) if known else 0
        tot = 0
        wsum = 0
        for r, d0 in zip(rows, durs):
            rec = rec_by_res.get(r.id)
            d = d0
            if d <= 0 and rec is not None:
                d = int(rec.total_duration_seconds or 0)
            if d <= 0:
                d = est
            if d <= 0:
                d = 100  # flat weight when no duration info exists at all
            pct = float(rec.progress_percentage or 0) if rec is not None else 0.0
            tot += d
            wsum += min(d, int(round(pct / 100.0 * d)))
        prog = round(min(100.0, wsum / float(tot) * 100.0), 1) if tot else 0.0
        first = rows[0]
        return {"course_key": course_key,
                "course_title": getattr(first, "course_title", None) or ((first.skill or "General") + " Course"),
                "skill": first.skill, "category": _cat_for(first),
                "difficulty": (first.difficulty or "beginner").lower(),
                "provider": first.provider,
                "description": first.description or "",
                "total_seconds": tot, "duration_label": _fmt_secs(tot),
                "watched_seconds": wsum, "progress": prog,
                "lecture_count": len(items), "lectures": items}

    @app.get("/api/learning/resources/{resource_id}")
    def learning_resource_one(resource_id: int, request: Request,
                              db: Session = Depends(get_db)):
        res = db.get(LearningResource, resource_id)
        if not res:
            raise HTTPException(status_code=404, detail="Resource not found")
        cu = None
        try:
            cu = _optional_user(request, db)
        except Exception:
            cu = None
        rec = None
        saved = False
        if cu is not None:
            rec = (db.query(LearningRecord).filter(
                LearningRecord.user_id == cu.id,
                LearningRecord.resource_id == resource_id).first())
            saved = db.query(LearningBookmark).filter(
                LearningBookmark.user_id == cu.id,
                LearningBookmark.resource_id == resource_id).first() is not None
        item = _ser_res(res, rec, saved)
        rel = (db.query(LearningResource)
               .filter(LearningResource.skill == res.skill,
                       LearningResource.id != res.id)
               .order_by(LearningResource.id.asc()).limit(6).all())
        rel_items = []
        for r in rel:
            rr = None
            if cu is not None and r.id in {k: v for k, v in
                                           ((x.resource_id, x) for x in _all(db, cu.id) if x.resource_id)}.keys():
                rr = {x.resource_id: x for x in _all(db, cu.id) if x.resource_id}[r.id]
            rel_items.append(_ser_res(r, rr, False))
        sib = []
        ckey = getattr(res, "course_key", None)
        if ckey:
            sib = (db.query(LearningResource)
                   .filter(LearningResource.course_key == ckey,
                           LearningResource.id != res.id)
                   .order_by(LearningResource.lecture_order.asc()).all())
        sib_items = [_ser_res(r, None, False) for r in sib]
        return {"resource": item, "record": (_ser(rec) if rec else None),
                "related": rel_items, "siblings": sib_items}




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

    @app.post("/api/learning/{record_id}/watch")
    def learning_watch(record_id: int, payload: WatchIn,
                       db: Session = Depends(get_db), cu=Depends(me_dep)):
        rec = db.get(LearningRecord, record_id)
        if not rec or rec.user_id != cu.id:
            raise HTTPException(status_code=404, detail="Learning record not found")
        res = db.get(LearningResource, rec.resource_id) if rec.resource_id else None
        canon = _dur_secs(res) if res is not None else 0
        if canon <= 0:
            canon = int(rec.total_duration_seconds or 0) or 0
        incoming_total = 0
        try:
            incoming_total = int(payload.duration_seconds or 0)
        except (TypeError, ValueError):
            incoming_total = 0
        if canon > 0 and incoming_total > 0:
            lo = int(canon * 0.9)
            hi = int(canon * 1.1) + 2
            if incoming_total < lo or incoming_total > hi:
                raise HTTPException(status_code=422, detail="Duration mismatch for this lecture")
        total = canon or incoming_total or int(rec.total_duration_seconds or 0) or 0
        if total <= 0:
            raise HTTPException(status_code=422, detail="Unknown duration for this resource")
        if total > 12 * 3600:
            raise HTTPException(status_code=422, detail="Duration out of range")
        was_done = _norm(rec.progress_percentage, rec.status) == "completed"
        new_segs = []
        for a, b in (payload.segments or []):
            a = max(0, min(a, total))
            b = max(0, min(b, total))
            if b > a:
                new_segs.append((a, b))
        for a, b in new_segs:
            db.add(LearningWatchSegment(record_id=rec.id, start_sec=a, end_sec=b))
        db.flush()
        unique = _recalc_from_segments(db, rec, total)
        try:
            pos = int(payload.position_seconds) if payload.position_seconds is not None else int(rec.last_position_seconds or 0)
        except (TypeError, ValueError):
            pos = 0
        rec.last_position_seconds = max(0, min(pos, total))
        if payload.completed or unique >= total:
            rec.progress_percentage = 100.0
            rec.status = "completed"
            rec.watched_seconds = total
            rec.last_position_seconds = total
        elif unique > 0 and (rec.status or "") == "not_started":
            rec.status = "in_progress"
        rec.last_accessed = datetime.now(timezone.utc)
        db.flush()
        now_done = _norm(rec.progress_percentage, rec.status) == "completed"
        if now_done and not was_done:
            _touch(db, cu.id, rec, "learning_completed", ("Completed: %s" % rec.resource_title))
        elif unique > 0:
            _touch(db, cu.id, rec, "learning_progress", ("Progress %s%%: %s" % (round(float(rec.progress_percentage or 0)), rec.resource_title)))
        _sync_ev(db, rec, ("completed" if (now_done and not was_done) else "progress"))
        db.commit()
        db.refresh(rec)
        return {"record": _ser(rec), "was_completed": now_done,
                "watched_seconds": int(rec.watched_seconds or 0),
                "total_duration_seconds": total,
                "message": ("Lecture completed! Evidence updated." if (now_done and not was_done) else "Watch progress saved.")}

    @app.post("/api/learning/{record_id}/init")
    def learning_record_init(record_id: int, payload: RecordInit,
                             db: Session = Depends(get_db), cu=Depends(me_dep)):
        """Persist the REAL runtime duration read from the actual video player.

        Called once when a resource has no pre-seeded duration (e.g. long
        YouTube courses). The duration becomes the canonical denominator for
        that record, so progress = unique watched seconds / real duration.
        Nobody can init someone else's record (JWT ownership check below).
        """
        rec = db.get(LearningRecord, record_id)
        if not rec or rec.user_id != cu.id:
            raise HTTPException(status_code=404, detail="Learning record not found")
        if _norm(rec.progress_percentage, rec.status) == "completed":
            return {"record": _ser(rec), "message": "Record already completed."}
        res = db.get(LearningResource, rec.resource_id) if rec.resource_id else None
        canon = _dur_secs(res) if res is not None else 0
        incoming = int(payload.duration_seconds or 0)
        if canon > 0:
            lo = int(canon * 0.9)
            hi = int(canon * 1.1) + 2
            if incoming < lo or incoming > hi:
                raise HTTPException(status_code=422,
                                    detail="Duration mismatch for this lecture")
        rec.total_duration_seconds = incoming
        rec.last_accessed = datetime.now(timezone.utc)
        if int(rec.watched_seconds or 0) > 0:
            # Re-derive progress from the new real total.
            uniq = int(rec.watched_seconds or 0)
            rec.progress_percentage = round(min(100.0, uniq / incoming * 100.0), 1)
            if (rec.status or "") == "not_started" and uniq > 0:
                rec.status = "in_progress"
        db.commit()
        db.refresh(rec)
        return {"record": _ser(rec), "message": "Real duration recorded."}

    @app.get("/api/learning/bookmarks")
    def learning_bookmarks(db: Session = Depends(get_db), cu=Depends(me_dep)):
        rows = (db.query(LearningBookmark)
                .filter(LearningBookmark.user_id == cu.id).all())
        rec_by_res = {}
        for r in _all(db, cu.id):
            if r.resource_id:
                rec_by_res[r.resource_id] = r
        return {"bookmarks": [_ser_res(b.resource, rec_by_res.get(b.resource_id), True) for b in rows if b.resource is not None]}

    @app.post("/api/learning/bookmarks/{resource_id}")
    def learning_bookmark_add(resource_id: int, db: Session = Depends(get_db), cu=Depends(me_dep)):
        res = db.get(LearningResource, resource_id)
        if not res:
            raise HTTPException(status_code=404, detail="Resource not found")
        ex = db.query(LearningBookmark).filter(
            LearningBookmark.user_id == cu.id,
            LearningBookmark.resource_id == resource_id).first()
        if ex is None:
            db.add(LearningBookmark(user_id=cu.id, resource_id=resource_id))
            db.commit()
            created = True
        else:
            created = False
        return {"saved": True, "created": created, "resource_id": resource_id}

    @app.delete("/api/learning/bookmarks/{resource_id}")
    def learning_bookmark_del(resource_id: int, db: Session = Depends(get_db), cu=Depends(me_dep)):
        ex = db.query(LearningBookmark).filter(
            LearningBookmark.user_id == cu.id,
            LearningBookmark.resource_id == resource_id).first()
        if ex is None:
            raise HTTPException(status_code=404, detail="Bookmark not found")
        db.delete(ex)
        db.commit()
        return {"saved": False, "resource_id": resource_id}


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

