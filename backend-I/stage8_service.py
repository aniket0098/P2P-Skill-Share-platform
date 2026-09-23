"""Stage 8 service (additive, DB-agnostic)."""
from sqlalchemy import or_
from sqlalchemy.orm import Session
import stage6_service as s6

SCORES = {"idea_created": 15.0, "milestone_completed": 35.0, "prototype_linked": 45.0,
          "feedback_received": 40.0, "pitch_submitted": 50.0, "pitch_reviewed": 60.0}

DEMO_PROBLEMS = [
    {"title": "Campus skill-gap visibility", "category": "Education",
     "description": "Small colleges struggle to track student-industry skill gaps in real time.",
     "impact": "Evidence-driven mentoring.", "difficulty": "intermediate",
     "skills_text": "Python, Data Analysis, UI/UX", "team_size": "3-5", "source": "demo"},
    {"title": "Mess food-waste routing", "category": "Sustainability",
     "description": "Campus messes over-produce food daily with no demand signal.",
     "impact": "Less waste, lower cost.", "difficulty": "beginner",
     "skills_text": "Web Development, Data Analysis", "team_size": "2-4", "source": "demo"},
    {"title": "Rural clinic triage assistant", "category": "Healthcare",
     "description": "Small clinics need a simple offline symptom-triage helper.",
     "impact": "Faster triage.", "difficulty": "advanced",
     "skills_text": "Python, Machine Learning, UI/UX", "team_size": "3-5", "source": "demo"},
    {"title": "Smart attendance on edge", "category": "AI",
     "description": "Classrooms need low-cost attendance vision on edge devices.",
     "impact": "Saves faculty hours.", "difficulty": "advanced",
     "skills_text": "Python, Computer Vision", "team_size": "2-4", "source": "demo"},
    {"title": "Local-language crop advisory", "category": "Agriculture",
     "description": "Farmers need timely pest/weather advisories in their language.",
     "impact": "Better yield decisions.", "difficulty": "intermediate",
     "skills_text": "Python, Mobile", "team_size": "3-5", "source": "demo"},
    {"title": "Accessible campus navigation", "category": "Accessibility",
     "description": "Visually impaired students need reliable audio campus navigation.",
     "impact": "Independent mobility.", "difficulty": "intermediate",
     "skills_text": "Mobile, Accessibility", "team_size": "2-4", "source": "demo"},
]


def _tokens(csv_text):
    if not csv_text:
        return []
    parts = csv_text if isinstance(csv_text, list) else str(csv_text).split(",")
    out = []
    for p in parts:
        t = str(p or "").strip()
        if t and t not in out:
            out.append(t)
    return out


def _notification_category(ntype: str) -> str:
    """Map a notification type to its preference category.

    Known types keep their own category so Settings can control them
    individually; anything else falls into the catch-all "general"
    bucket (same vocabulary as main.DEFAULT_NOTIFICATION_PREFS)."""
    known = (
        "application_status",
        "innovation",
        "innovation_invite",
        "innovation_feedback",
    )
    t = (ntype or "").strip().lower()
    return t if t in known else "general"


def _notification_allowed(db: Session, user_id: int, ntype: str) -> bool:
    """True when this user wants this notification category in-app.

    Reads user_settings.notification_prefs (TEXT holding a JSON object;
    NULL = every category enabled). FAIL-OPEN by design: a missing
    table/row/JSON or any unexpected error always allows the write, so
    notification delivery can never be broken by the preference
    system — worst case the user receives an extra notification."""
    try:
        from sqlalchemy import text as _text
        row = db.execute(
            _text(
                "SELECT notification_prefs FROM user_settings WHERE user_id = :u"
            ),
            {"u": user_id},
        ).first()
        if not row or not row[0]:
            return True
        import json as _json
        prefs = row[0] if isinstance(row[0], dict) else _json.loads(row[0])
        if not isinstance(prefs, dict):
            return True
        if prefs.get("in_app", True) is False:
            return False
        return bool(prefs.get(_notification_category(ntype), True))
    except Exception:
        return True


def notify(db: Session, user_id: int, ntype: str, title: str, message="", link=""):
    # Same pattern as main.create_notification: raw notifications table.
    # Portable DDL: try Postgres form first, fall back to SQLite form.
    #
    # STAGE 32: honour the account's notification preferences BEFORE
    # writing. This function is the platform's single notification
    # writer, so one check here covers every producer (innovation,
    # innovation_invite, innovation_feedback, application_status, ...).
    # Missing user_settings row / missing table / any error => allowed
    # (fail-open), so existing users and legacy databases keep working
    # exactly as before and a broken preference read can never swallow
    # a real notification silently... it lets it through instead.
    if not _notification_allowed(db, user_id, ntype):
        return
    try:
        from sqlalchemy import text as _text
        try:
            db.execute(_text(
                "CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, "
                "user_id INTEGER, type VARCHAR DEFAULT 'general', title VARCHAR, "
                "message TEXT, link VARCHAR DEFAULT '', is_read BOOLEAN DEFAULT FALSE, "
                "created_at TIMESTAMPTZ DEFAULT NOW())"))
        except Exception:
            try:
                db.execute(_text(
                    "CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    "user_id INTEGER, type VARCHAR DEFAULT 'general', title VARCHAR, "
                    "message TEXT, link VARCHAR DEFAULT '', is_read BOOLEAN DEFAULT 0, "
                    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"))
            except Exception:
                pass
        db.execute(_text(
            "INSERT INTO notifications (user_id, type, title, message, link) "
            "VALUES (:u, :t, :ti, :m, :l)"),
            {"u": user_id, "t": ntype[:50], "ti": title[:200],
             "m": (message or "")[:1000], "l": (link or "")[:500]})
        db.flush()
    except Exception:
        pass


def serialize_problem(p):
    return {"id": p.id, "title": p.title, "category": p.category,
            "description": p.description, "impact": p.impact,
            "difficulty": p.difficulty, "skills": _tokens(p.skills_text),
            "team_size": p.team_size, "status": p.status, "source": p.source,
            "source_label": p.source_label or (p.source or "").upper(),
            "posted_by": p.posted_by,
            "created_at": p.created_at.isoformat() if p.created_at else None}


def serialize_member(m):
    u = m.user
    return {"id": m.id, "user_id": m.user_id, "role": m.role, "status": m.status,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "name": u.name if u else "Unknown", "skills": _tokens(u.skills) if u else []}


def serialize_team(db: Session, t):
    from models import InnovationTeamMember as _M
    members = db.query(_M).filter(_M.team_id == t.id).all()
    active = [m for m in members if m.status == "active"]
    return {"id": t.id, "idea_id": t.idea_id, "name": t.name,
            "description": t.description, "created_by": t.created_by,
            "conversation_id": t.conversation_id, "member_count": len(active),
            "members": [serialize_member(m) for m in members],
            "created_at": t.created_at.isoformat() if t.created_at else None}


def serialize_milestone(m):
    return {"id": m.id, "idea_id": m.idea_id, "title": m.title,
            "description": m.description, "status": m.status,
            "due_date": m.due_date.isoformat() if m.due_date else None,
            "assignee_id": m.assignee_id,
            "assignee_name": m.assignee.name if m.assignee else None,
            "completed_at": m.completed_at.isoformat() if m.completed_at else None,
            "created_at": m.created_at.isoformat() if m.created_at else None}


def serialize_feedback(f):
    return {"id": f.id, "idea_id": f.idea_id, "author_id": f.author_id,
            "author_name": f.author.name if f.author else "Unknown",
            "author_type": f.author_type, "message": f.message,
            "score": f.score, "category": f.category,
            "created_at": f.created_at.isoformat() if f.created_at else None}


def serialize_pitch(p):
    return {"id": p.id, "idea_id": p.idea_id, "title": p.title,
            "description": p.description, "problem": p.problem,
            "solution": p.solution, "target_users": p.target_users,
            "impact": p.impact, "technology": p.technology,
            "demo_url": p.demo_url, "github_url": p.github_url,
            "presentation_url": p.presentation_url, "video_url": p.video_url,
            "status": p.status,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
            "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
            "reviewer_id": p.reviewer_id, "review_note": p.review_note}


def idea_skill_names(db, idea_id):
    from models import InnovationIdeaSkill as _IS
    rows = db.query(_IS).filter(_IS.idea_id == idea_id).all()
    return [r.skill.name for r in rows if r.skill]


def sync_idea_skills(db, idea, names):
    from models import InnovationIdeaSkill as _IS
    wanted = []
    for n in _tokens(names):
        sk = s6.get_or_create_skill(db, n)
        if sk:
            wanted.append(sk)
    existing = db.query(_IS).filter(_IS.idea_id == idea.id).all()
    have = {r.skill_id for r in existing}
    want = {s.id for s in wanted}
    for r in existing:
        if r.skill_id not in want:
            db.delete(r)
    for s in wanted:
        if s.id not in have:
            db.add(_IS(idea_id=idea.id, skill_id=s.id))
    idea.skills_text = ", ".join([s.name for s in wanted]) if wanted else None
    db.flush()
    return [s.name for s in wanted]


def serialize_idea(db, idea, viewer_id=None):
    from models import (InnovationMilestone as _MS, InnovationProjectLink as _PL,
                        InnovationTeam as _T, InnovationTeamMember as _M)
    teams = db.query(_T).filter(_T.idea_id == idea.id).all()
    milestones = db.query(_MS).filter(_MS.idea_id == idea.id).order_by(_MS.id).all()
    done = sum(1 for m in milestones if m.status == "completed")
    links = db.query(_PL).filter(_PL.idea_id == idea.id).all()
    member_ids = set()
    for t in teams:
        for m in db.query(_M).filter(_M.team_id == t.id, _M.status == "active").all():
            member_ids.add(m.user_id)
    total = len(milestones)
    return {"id": idea.id, "owner_id": idea.owner_id,
            "owner_name": idea.owner.name if idea.owner else "Unknown",
            "problem_id": idea.problem_id,
            "problem_title": idea.problem.title if idea.problem else None,
            "title": idea.title, "problem_statement": idea.problem_statement,
            "description": idea.description, "target_users": idea.target_users,
            "solution_summary": idea.solution_summary,
            "expected_impact": idea.expected_impact, "category": idea.category,
            "domain": idea.domain,
            "skills": idea_skill_names(db, idea.id) or _tokens(idea.skills_text),
            "reference_links": idea.reference_links, "image_url": idea.image_url,
            "status": idea.status, "project_id": idea.project_id,
            "discussion_id": idea.discussion_id,
            "teams": [serialize_team(db, t) for t in teams],
            "team_member_ids": sorted(member_ids),
            "is_member": (viewer_id in member_ids) if viewer_id else False,
            "is_owner": (viewer_id == idea.owner_id) if viewer_id else False,
            "milestones": [serialize_milestone(m) for m in milestones],
            "milestone_progress": {"done": done, "total": total,
                                   "pct": round(done / total * 100, 1) if total else 0.0},
            "linked_projects": [{"id": x.project_id,
                                 "title": x.project.title if x.project else "Project",
                                 "github_url": x.project.github_url if x.project else None,
                                 "demo_url": x.project.demo_url if x.project else None}
                                for x in links],
            "created_at": idea.created_at.isoformat() if idea.created_at else None,
            "updated_at": idea.updated_at.isoformat() if idea.updated_at else None}


def is_member(db, idea_id, user_id):
    from models import InnovationTeam as _T, InnovationTeamMember as _M
    tids = [r[0] for r in db.query(_T.id).filter(_T.idea_id == idea_id).all()]
    if not tids:
        return False
    return db.query(_M).filter(_M.team_id.in_(tids), _M.user_id == user_id,
                               _M.status == "active").first() is not None


def can_collaborate(db, idea, user_id):
    return idea.owner_id == user_id or is_member(db, idea.id, user_id)


def upsert_innovation_evidence(db, *, user_id, skill_names, source_id, kind, idea_title):
    score = SCORES.get(kind, 15.0)
    confidence = "self_reported" if kind == "idea_created" else "project"
    out = []
    for name in _tokens(skill_names)[:12]:
        sk = s6.get_or_create_skill(db, name)
        if not sk:
            continue
        ev = s6.upsert_evidence(db, user_id=user_id, skill_id=sk.id,
                                source_type="innovation", source_id=source_id,
                                score=score, confidence=confidence,
                                evidence_text=f"Innovation Lab — {idea_title} ({kind})",
                                extra={"kind": kind, "idea_id": source_id})
        out.append(ev)
        hs = db.query(s6.SkillHistory).filter(
            s6.SkillHistory.user_id == user_id, s6.SkillHistory.skill_id == sk.id,
            s6.SkillHistory.event_type == "innovation_" + kind).all()
        if not any((h.note or "").find(f"#{source_id}") >= 0 for h in hs):
            s6.record_history(db, user_id=user_id, skill_id=sk.id,
                              event_type="innovation_" + kind,
                              note=f"Innovation #{source_id}: {idea_title}"[:500],
                              confidence=confidence)
    db.flush()
    return out


def team_skill_coverage(db, idea_id, required):
    from models import (InnovationTeam as _T, InnovationTeamMember as _M,
                        User as _U, UserSkill as _US)
    tids = [r[0] for r in db.query(_T.id).filter(_T.idea_id == idea_id).all()]
    mids = set()
    for tid in tids:
        for uid in db.query(_M.user_id).filter(_M.team_id == tid, _M.status == "active").all():
            mids.add(uid[0])
    have = set()
    for uid in mids:
        u = db.get(_U, uid)
        if u:
            for t in _tokens(u.skills):
                have.add(t.lower())
        for us in db.query(_US).filter(_US.user_id == uid).all():
            if us.skill:
                have.add(us.skill.name.lower())
    req = _tokens(required)
    covered = [r for r in req if r.lower() in have]
    missing = [r for r in req if r.lower() not in have]
    pct = round(len(covered) / len(req) * 100, 1) if req else 100.0
    return {"required": req, "covered": covered, "missing": missing,
            "coverage_pct": pct, "member_count": len(mids)}


def find_collaborators(db, idea_id, limit=8):
    from models import (InnovationIdea as _I, InnovationTeam as _T,
                        InnovationTeamMember as _M, User as _U, UserSkill as _US)
    idea = db.get(_I, idea_id)
    if not idea:
        return []
    required = [s.lower() for s in _tokens(idea.skills_text)]
    if not required:
        return []
    tids = [r[0] for r in db.query(_T.id).filter(_T.idea_id == idea_id).all()]
    excluded = {idea.owner_id}
    for tid in tids:
        for uid in db.query(_M.user_id).filter(_M.team_id == tid).all():
            excluded.add(uid[0])
    # STAGE 32: users who opted out of discovery (discoverable=false)
    # or set profile_visibility=private are never suggested. One batched
    # read; any failure falls back to today's behavior (no filtering).
    try:
        from models import UserSettings as _PS
        hidden = {
            r[0]
            for r in db.query(_PS.user_id).filter(
                or_(_PS.discoverable == False,  # noqa: E712
                    _PS.profile_visibility == "private")
            ).all()
        }
    except Exception:
        hidden = set()
    scored = []
    for u in db.query(_U).filter(_U.account_status == "active").limit(200).all():
        if u.id in excluded or u.id in hidden:
            continue
        bag = set(t.lower() for t in _tokens(u.skills))
        for us in db.query(_US).filter(_US.user_id == u.id).all():
            if us.skill:
                bag.add(us.skill.name.lower())
        overlap = [r for r in required if r in bag]
        if overlap:
            scored.append((len(overlap), u, overlap))
    scored.sort(key=lambda x: (-x[0], (x[1].name or "").lower()))
    return [{"user_id": u.id, "name": u.name, "skills": _tokens(u.skills)[:8],
             "matched_skills": ov, "match_count": len(ov)}
            for _, u, ov in scored[:max(limit, 1)]]


def seed_demo_problems(db):
    from models import InnovationProblem as _P
    if db.query(_P).filter(_P.source == "demo").count():
        return 0
    for d in DEMO_PROBLEMS:
        db.add(_P(title=d["title"], category=d["category"],
                  description=d["description"], impact=d.get("impact"),
                  difficulty=d.get("difficulty"), skills_text=d.get("skills_text"),
                  team_size=d.get("team_size"), status="open",
                  source="demo", source_label="DEMO"))
    db.flush()
    return len(DEMO_PROBLEMS)


def my_summary(db, user_id):
    from models import (InnovationIdea as _I, InnovationInvite as _V,
                        InnovationTeam as _T, InnovationTeamMember as _M,
                        SkillEvidence as _E)
    ideas = db.query(_I).filter(_I.owner_id == user_id).order_by(_I.updated_at.desc()).all()
    tids = [r[0] for r in db.query(_M.team_id).filter(
        _M.user_id == user_id, _M.status == "active").all()]
    teams = db.query(_T).filter(_T.id.in_(tids)).all() if tids else []
    invites = db.query(_V).filter(_V.invitee_id == user_id,
                                  _V.status == "pending").all()
    ev = db.query(_E).filter(_E.user_id == user_id,
                             _E.source_type == "innovation").count()
    return {"ideas": [{"id": i.id, "title": i.title, "status": i.status,
                       "category": i.category} for i in ideas],
            "teams": [{"id": t.id, "name": t.name, "idea_id": t.idea_id} for t in teams],
            "pending_invites": [{"id": v.id, "team_id": v.team_id, "idea_id": v.idea_id,
                                 "team_name": v.team.name if v.team else "Team",
                                 "role": v.role,
                                 "inviter": v.inviter.name if v.inviter else "A teammate"}
                                for v in invites],
            "evidence_count": ev}




