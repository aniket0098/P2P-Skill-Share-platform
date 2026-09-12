"""Stage 8 API: Innovation Lab (additive, under /api/innovation/*)."""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func as _func, or_ as _or
from sqlalchemy.orm import Session
import stage8_service as s8


class IdeaIn(BaseModel):
    title: str
    problem_statement: str | None = None
    description: str | None = None
    target_users: str | None = None
    solution_summary: str | None = None
    expected_impact: str | None = None
    category: str | None = None
    domain: str | None = None
    skills: list | str | None = None
    reference_links: str | None = None
    problem_id: int | None = None
    status: str | None = None

    @field_validator("title")
    @classmethod
    def _t(cls, v):
        if not v or not str(v).strip():
            raise ValueError("Title required")
        return str(v).strip()[:200]


class IdeaUpdateIn(BaseModel):
    title: str | None = None
    problem_statement: str | None = None
    description: str | None = None
    target_users: str | None = None
    solution_summary: str | None = None
    expected_impact: str | None = None
    category: str | None = None
    domain: str | None = None
    skills: list | str | None = None
    reference_links: str | None = None
    problem_id: int | None = None
    status: str | None = None


def _idea_payload(data) -> dict:
    skills = None
    if getattr(data, "skills", None) is not None:
        skills = s8._tokens(data.skills)
    return {"title": getattr(data, "title", None),
            "problem_statement": getattr(data, "problem_statement", None),
            "description": getattr(data, "description", None),
            "target_users": getattr(data, "target_users", None),
            "solution_summary": getattr(data, "solution_summary", None),
            "expected_impact": getattr(data, "expected_impact", None),
            "category": getattr(data, "category", None),
            "domain": getattr(data, "domain", None),
            "skills": skills,
            "reference_links": getattr(data, "reference_links", None),
            "problem_id": getattr(data, "problem_id", None),
            "status": getattr(data, "status", None)}


def _apply_idea_fields(db, idea, payload, owner_check=True):
    from models import InnovationProblem as _P, INNOVATION_IDEA_STATUSES as _ST
    if payload.get("title") is not None:
        t = str(payload["title"]).strip()
        if not t:
            raise HTTPException(status_code=400, detail="Title required")
        idea.title = t[:200]
    for f in ("problem_statement", "description", "target_users", "solution_summary",
              "expected_impact", "category", "domain", "reference_links"):
        if payload.get(f) is not None:
            v = payload[f]
            idea.__setattr__(f, str(v).strip()[:5000] if str(v or "").strip() else None)
    if payload.get("problem_id") is not None:
        pid = payload["problem_id"]
        if pid is None:
            idea.problem_id = None
        else:
            pr = db.get(_P, int(pid))
            if not pr:
                raise HTTPException(status_code=404, detail="Problem not found")
            idea.problem_id = pr.id
    if payload.get("status") is not None:
        st = str(payload["status"]).strip().lower()
        if st not in _ST:
            raise HTTPException(status_code=400, detail="Invalid status")
        idea.status = st
    if payload.get("skills") is not None:
        s8.sync_idea_skills(db, idea, payload["skills"])
    idea.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return idea


def _get_idea(db, idea_id):
    from models import InnovationIdea as _I
    idea = db.get(_I, int(idea_id))
    if not idea:
        raise HTTPException(status_code=404, detail="Idea not found")
    return idea


def _team_of(db, team_id):
    from models import InnovationTeam as _T
    t = db.get(_T, int(team_id))
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    return t


def _require_team_role(db, team, user_id):
    from models import InnovationTeamMember as _M
    idea = team.idea
    if idea and idea.owner_id == user_id:
        return True
    m = db.query(_M).filter(_M.team_id == team.id, _M.user_id == user_id,
                            _M.status == "active").first()
    if not m:
        raise HTTPException(status_code=403, detail="Not a team member")
    return True


def register_stage8(app, get_db, me_dep):
    from models import (InnovationFeedback as _F, InnovationFeedbackRequest as _FR,
                        InnovationIdea as _I, InnovationInvite as _V,
                        InnovationMilestone as _MS, InnovationPitch as _PT,
                        InnovationProblem as _P, InnovationProjectLink as _PL,
                        InnovationTeam as _T, InnovationTeamMember as _M,
                        Project as _PJ, User as _U)

    @app.get("/api/innovation/problems")
    def list_problems(search: str = "", category: str = "", source: str = "",
                      db: Session = Depends(get_db)):
        try:
            s8.seed_demo_problems(db)
            db.commit()
        except Exception:
            db.rollback()
        q = db.query(_P)
        if category.strip():
            q = q.filter(_func.lower(_P.category) == category.strip().lower())
        if source.strip():
            q = q.filter(_func.lower(_P.source) == source.strip().lower())
        if search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(_or(_P.title.ilike(term), _P.description.ilike(term)))
        rows = q.order_by(_P.created_at.desc()).limit(100).all()
        cats = sorted({r.category for r in db.query(_P.category).all() if r[0]})
        return {"problems": [s8.serialize_problem(r) for r in rows],
                "categories": cats}

    @app.post("/api/innovation/problems")
    def create_problem(data: dict, cu=Depends(me_dep), db: Session = Depends(get_db)):
        title = str(data.get("title") or "").strip()
        desc = str(data.get("description") or "").strip()
        if not title or not desc:
            raise HTTPException(status_code=400, detail="Title and description required")
        src = str(data.get("source") or "community").strip().lower()
        if src not in ("community", "industry", "platform", "demo"):
            src = "community"
        # Only admins may post industry/platform problems; others become community.
        if src in ("industry", "platform") and getattr(cu, "role", "") != "admin":
            src = "community"
        p = _P(title=title[:200], category=str(data.get("category") or "").strip()[:80] or None,
               description=desc[:5000], impact=str(data.get("impact") or "").strip()[:2000] or None,
               difficulty=str(data.get("difficulty") or "").strip().lower()[:20] or None,
               skills_text=", ".join(s8._tokens(data.get("skills")))[:500] or None,
               team_size=str(data.get("team_size") or "").strip()[:20] or None,
               status="open", source=src,
               source_label={"community": "COMMUNITY PROBLEM", "industry": "INDUSTRY PROBLEM",
                             "platform": "PLATFORM CHALLENGE", "demo": "DEMO"}[src],
               posted_by=cu.id)
        db.add(p)
        db.commit()
        db.refresh(p)
        return {"problem": s8.serialize_problem(p)}

    @app.get("/api/innovation/ideas")
    def list_ideas(search: str = "", category: str = "", status: str = "",
                   mine: str = "", limit: int = 50, cu=Depends(me_dep),
                   db: Session = Depends(get_db)):
        q = db.query(_I)
        if mine.strip().lower() in ("1", "true", "mine"):
            q = q.filter(_I.owner_id == cu.id)
        if category.strip():
            q = q.filter(_func.lower(_I.category) == category.strip().lower())
        if status.strip():
            q = q.filter(_I.status == status.strip().lower())
        if search.strip():
            term = f"%{search.strip()}%"
            q = q.filter(_or(_I.title.ilike(term), _I.description.ilike(term),
                             _I.problem_statement.ilike(term)))
        rows = q.order_by(_I.updated_at.desc()).limit(min(max(limit, 1), 100)).all()
        return {"ideas": [s8.serialize_idea(db, r, cu.id) for r in rows]}

    @app.post("/api/innovation/ideas")
    def create_idea(data: IdeaIn, cu=Depends(me_dep), db: Session = Depends(get_db)):
        idea = _I(owner_id=cu.id, title=data.title.strip()[:200], status="idea")
        db.add(idea)
        db.flush()
        _apply_idea_fields(db, idea, _idea_payload(data))
        if not idea.status or idea.status == "idea":
            idea.status = "idea"
        db.commit()
        db.refresh(idea)
        try:
            s8.upsert_innovation_evidence(db, user_id=cu.id,
                                          skill_names=s8.idea_skill_names(db, idea.id),
                                          source_id=idea.id, kind="idea_created",
                                          idea_title=idea.title)
            db.commit()
        except Exception:
            db.rollback()
        return {"idea": s8.serialize_idea(db, idea, cu.id)}

    @app.get("/api/innovation/ideas/{idea_id}")
    def get_idea(idea_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        ms = db.query(_MS).filter(_MS.idea_id == idea.id).all()
        fb = db.query(_F).filter(_F.idea_id == idea.id).order_by(_F.created_at.desc()).all()
        pt = db.query(_PT).filter(_PT.idea_id == idea.id).order_by(_PT.id.desc()).first()
        data = s8.serialize_idea(db, idea, cu.id)
        data["feedback"] = [s8.serialize_feedback(f) for f in fb]
        data["pitch"] = s8.serialize_pitch(pt) if pt else None
        data["coverage"] = s8.team_skill_coverage(db, idea.id, s8.idea_skill_names(db, idea.id))
        return data

    @app.put("/api/innovation/ideas/{idea_id}")
    def update_idea(idea_id: int, data: IdeaUpdateIn, cu=Depends(me_dep),
                    db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if idea.owner_id != cu.id:
            raise HTTPException(status_code=403, detail="Only the owner can edit")
        _apply_idea_fields(db, idea, _idea_payload(data))
        db.commit()
        db.refresh(idea)
        return {"idea": s8.serialize_idea(db, idea, cu.id)}

    @app.delete("/api/innovation/ideas/{idea_id}")
    def delete_idea(idea_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if idea.owner_id != cu.id and getattr(cu, "role", "") != "admin":
            raise HTTPException(status_code=403, detail="Only the owner can delete")
        db.delete(idea)
        db.commit()
        return {"message": "Idea deleted"}

    @app.post("/api/innovation/ideas/{idea_id}/join")
    def join_idea(idea_id: int, data: dict | None = None, cu=Depends(me_dep),
                  db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if idea.owner_id == cu.id or s8.is_member(db, idea.id, cu.id):
            return {"message": "Already in team", "idea": s8.serialize_idea(db, idea, cu.id)}
        team = db.query(_T).filter(_T.idea_id == idea.id).order_by(_T.id).first()
        if not team:
            team = _T(idea_id=idea.id, name=(idea.title[:40] + " Team"),
                      description="Auto-created innovation team.", created_by=idea.owner_id)
            db.add(team)
            db.flush()
            db.add(_M(team_id=team.id, user_id=idea.owner_id, role="founder", status="active"))
            db.flush()
        if db.query(_M).filter(_M.team_id == team.id, _M.user_id == cu.id).first():
            raise HTTPException(status_code=409, detail="Already requested/joined")
        role = str((data or {}).get("role") or "member").strip().lower()[:30]
        db.add(_M(team_id=team.id, user_id=cu.id, role=role, status="active"))
        db.commit()
        s8.notify(db, idea.owner_id, "innovation",
                  f"{cu.name} joined '{idea.title}'",
                  f"{cu.name} joined your innovation team as {role}.",
                  "innovation-lab.html")
        db.commit()
        return {"message": "Joined team", "team": s8.serialize_team(db, team)}

    @app.post("/api/innovation/ideas/{idea_id}/teams")
    def create_team(idea_id: int, data: dict, cu=Depends(me_dep),
                    db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if idea.owner_id != cu.id and not s8.is_member(db, idea.id, cu.id):
            raise HTTPException(status_code=403, detail="Only owner/members can create teams")
        name = str(data.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Team name required")
        team = _T(idea_id=idea.id, name=name[:120],
                  description=str(data.get("description") or "").strip()[:2000] or None,
                  created_by=cu.id)
        db.add(team)
        db.flush()
        db.add(_M(team_id=team.id, user_id=cu.id, role="lead", status="active"))
        db.commit()
        db.refresh(team)
        return {"team": s8.serialize_team(db, team)}

    @app.get("/api/innovation/ideas/{idea_id}/team")
    def idea_team(idea_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        teams = db.query(_T).filter(_T.idea_id == idea.id).all()
        return {"teams": [s8.serialize_team(db, t) for t in teams],
                "coverage": s8.team_skill_coverage(db, idea.id, s8.idea_skill_names(db, idea.id)),
                "collaborators": s8.find_collaborators(db, idea.id)}

    @app.post("/api/innovation/teams/{team_id}/invite")
    def invite_member(team_id: int, data: dict, cu=Depends(me_dep),
                      db: Session = Depends(get_db)):
        team = _team_of(db, team_id)
        _require_team_role(db, team, cu.id)
        uid = data.get("user_id") or data.get("invitee_id")
        if not uid:
            raise HTTPException(status_code=400, detail="user_id required")
        target = db.get(_U, int(uid))
        if not target:
            raise HTTPException(status_code=404, detail="User not found")
        if target.id == cu.id:
            raise HTTPException(status_code=400, detail="Cannot invite yourself")
        if db.query(_M).filter(_M.team_id == team.id, _M.user_id == target.id,
                               _M.status == "active").first():
            raise HTTPException(status_code=409, detail="Already a member")
        dupe = db.query(_V).filter(_V.team_id == team.id, _V.invitee_id == target.id,
                                   _V.status == "pending").first()
        if dupe:
            raise HTTPException(status_code=409, detail="Invite already pending")
        inv = _V(team_id=team.id, idea_id=team.idea_id, inviter_id=cu.id,
                 invitee_id=target.id,
                 role=str(data.get("role") or "member").strip().lower()[:30],
                 message=str(data.get("message") or "").strip()[:1000] or None,
                 status="pending")
        db.add(inv)
        db.flush()
        s8.notify(db, target.id, "innovation_invite",
                  f"Innovation invite: {team.name}",
                  f"{cu.name} invited you to join '{team.idea.title if team.idea else 'an idea'}' as {inv.role}.",
                  "innovation-lab.html")
        db.commit()
        return {"invite": {"id": inv.id, "team_id": team.id, "invitee_id": target.id,
                           "status": inv.status}}

    @app.post("/api/innovation/invites/{invite_id}/accept")
    def accept_invite(invite_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        inv = db.get(_V, int(invite_id))
        if not inv or inv.status != "pending":
            raise HTTPException(status_code=404, detail="Invite not found")
        if inv.invitee_id != cu.id:
            raise HTTPException(status_code=403, detail="Not your invite")
        inv.status = "accepted"
        inv.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
        ex = db.query(_M).filter(_M.team_id == inv.team_id, _M.user_id == cu.id).first()
        if ex:
            ex.status = "active"
            ex.role = inv.role or ex.role
        else:
            db.add(_M(team_id=inv.team_id, user_id=cu.id, role=inv.role or "member",
                       status="active"))
        db.commit()
        if inv.inviter_id:
            s8.notify(db, inv.inviter_id, "innovation",
                      f"{cu.name} accepted your invite", "innovation-lab.html")
            db.commit()
        return {"message": "Invite accepted"}

    @app.post("/api/innovation/invites/{invite_id}/reject")
    def reject_invite(invite_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        inv = db.get(_V, int(invite_id))
        if not inv or inv.status != "pending":
            raise HTTPException(status_code=404, detail="Invite not found")
        if inv.invitee_id != cu.id:
            raise HTTPException(status_code=403, detail="Not your invite")
        inv.status = "rejected"
        inv.decided_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        return {"message": "Invite rejected"}

    @app.post("/api/innovation/teams/{team_id}/leave")
    def leave_team(team_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        team = _team_of(db, team_id)
        m = db.query(_M).filter(_M.team_id == team.id, _M.user_id == cu.id,
                                _M.status == "active").first()
        if not m:
            raise HTTPException(status_code=404, detail="Not a member")
        m.status = "left"
        db.commit()
        return {"message": "Left team"}

    @app.post("/api/innovation/ideas/{idea_id}/milestones")
    def create_milestone(idea_id: int, data: dict, cu=Depends(me_dep),
                         db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if not s8.can_collaborate(db, idea, cu.id):
            raise HTTPException(status_code=403, detail="Only team can add milestones")
        title = str(data.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title required")
        ms = _MS(idea_id=idea.id, title=title[:200],
                 description=str(data.get("description") or "").strip()[:2000] or None,
                 status="todo", created_by=cu.id)
        dd = data.get("due_date")
        if dd:
            try:
                ms.due_date = datetime.fromisoformat(str(dd).replace("Z", ""))
            except Exception:
                pass
        if data.get("assignee_id"):
            ms.assignee_id = int(data["assignee_id"])
        db.add(ms)
        db.commit()
        db.refresh(ms)
        return {"milestone": s8.serialize_milestone(ms)}

    @app.put("/api/innovation/milestones/{ms_id}")
    def update_milestone(ms_id: int, data: dict, cu=Depends(me_dep),
                         db: Session = Depends(get_db)):
        ms = db.get(_MS, int(ms_id))
        if not ms:
            raise HTTPException(status_code=404, detail="Not found")
        idea = _get_idea(db, ms.idea_id)
        if not s8.can_collaborate(db, idea, cu.id):
            raise HTTPException(status_code=403, detail="Only team can update")
        if data.get("title") is not None:
            ms.title = str(data["title"]).strip()[:200] or ms.title
        if data.get("description") is not None:
            ms.description = str(data["description"]).strip()[:2000] or None
        if data.get("status") is not None:
            st = str(data["status"]).strip().lower()
            if st not in ("todo", "in_progress", "completed"):
                raise HTTPException(status_code=400, detail="Invalid status")
            ms.status = st
            ms.completed_at = (datetime.now(timezone.utc).replace(tzinfo=None)
                               if st == "completed" else None)
        if data.get("assignee_id") is not None:
            ms.assignee_id = int(data["assignee_id"]) if data["assignee_id"] else None
        ms.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.commit()
        out = s8.serialize_milestone(ms)
        done = db.query(_MS).filter(_MS.idea_id == idea.id,
                                    _MS.status == "completed").count()
        total = db.query(_MS).filter(_MS.idea_id == idea.id).count()
        out["progress"] = {"done": done, "total": total,
                           "pct": round(done / total * 100, 1) if total else 0.0}
        if ms.status == "completed":
            try:
                for uid in {idea.owner_id} | {r[0] for r in db.query(
                        _M.user_id).filter(
                        _M.team_id.in_([t.id for t in db.query(_T).filter(
                            _T.idea_id == idea.id).all()]),
                        _M.status == "active").all()}:
                    s8.upsert_innovation_evidence(
                        db, user_id=uid, skill_names=s8.idea_skill_names(db, idea.id),
                        source_id=idea.id, kind="milestone_completed",
                        idea_title=idea.title)
                db.commit()
            except Exception:
                db.rollback()
        return {"milestone": out}

    @app.get("/api/innovation/ideas/{idea_id}/feedback")
    def list_feedback(idea_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        rows = db.query(_F).filter(_F.idea_id == idea.id).order_by(
            _F.created_at.desc()).all()
        reqs = db.query(_FR).filter(_FR.idea_id == idea.id).order_by(
            _FR.created_at.desc()).all()
        return {"feedback": [s8.serialize_feedback(f) for f in rows],
                "requests": [{"id": r.id, "requester_id": r.requester_id,
                              "reviewer_id": r.reviewer_id,
                              "reviewer_role": r.reviewer_role,
                              "message": r.message, "status": r.status} for r in reqs]}

    @app.post("/api/innovation/ideas/{idea_id}/feedback")
    def give_feedback(idea_id: int, data: dict, cu=Depends(me_dep),
                      db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        msg = str(data.get("message") or data.get("feedback") or "").strip()
        if not msg:
            raise HTTPException(status_code=400, detail="Feedback required")
        atype = str(data.get("author_type") or "").strip().lower()
        role = str(getattr(cu, "role", "") or "").lower()
        allowed = {"peer", "mentor", "faculty", "industry", "community"}
        if atype not in allowed:
            atype = "mentor" if role == "mentor" else (
                "industry" if role == "recruiter" else "peer")
        if atype in ("mentor", "industry", "faculty") and role not in (
                "mentor", "recruiter", "admin", "faculty", "tpo", "college"):
            atype = "peer"
        score = data.get("score")
        if score is not None:
            try:
                score = float(score)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid score")
            if score < 0 or score > 100:
                raise HTTPException(status_code=400, detail="Score 0-100")
        fb = _F(idea_id=idea.id, author_id=cu.id, author_type=atype,
                message=msg[:5000], score=score,
                category=str(data.get("category") or "").strip()[:80] or None)
        db.add(fb)
        db.commit()
        try:
            tids = [t.id for t in db.query(_T).filter(_T.idea_id == idea.id).all()]
            uids = {idea.owner_id}
            if tids:
                for r in db.query(_M.user_id).filter(
                        _M.team_id.in_(tids), _M.status == "active").all():
                    uids.add(r[0])
            for uid in uids:
                s8.upsert_innovation_evidence(
                    db, user_id=uid, skill_names=s8.idea_skill_names(db, idea.id),
                    source_id=idea.id, kind="feedback_received", idea_title=idea.title)
            s8.notify(db, idea.owner_id, "innovation_feedback",
                      f"New {atype} feedback on '{idea.title}'",
                      f"{cu.name}: {msg[:200]}", "innovation-lab.html")
            db.commit()
        except Exception:
            db.rollback()
        return {"feedback": s8.serialize_feedback(fb)}

    @app.post("/api/innovation/ideas/{idea_id}/feedback-request")
    def request_feedback(idea_id: int, data: dict, cu=Depends(me_dep),
                         db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if not s8.can_collaborate(db, idea, cu.id):
            raise HTTPException(status_code=403, detail="Only team can request")
        rid = data.get("reviewer_id")
        reviewer = db.get(_U, int(rid)) if rid else None
        req = _FR(idea_id=idea.id, requester_id=cu.id,
                  reviewer_id=reviewer.id if reviewer else None,
                  reviewer_role=str(data.get("reviewer_role") or "").strip()[:30] or None,
                  message=str(data.get("message") or "").strip()[:1000] or None,
                  status="pending")
        db.add(req)
        db.commit()
        if reviewer:
            s8.notify(db, reviewer.id, "innovation_feedback",
                      f"Feedback requested: '{idea.title}'",
                      f"{cu.name} requested your feedback.", "innovation-lab.html")
            db.commit()
        return {"request": {"id": req.id, "status": req.status}}

    @app.post("/api/innovation/ideas/{idea_id}/link-project")
    def link_project(idea_id: int, data: dict, cu=Depends(me_dep),
                     db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if not s8.can_collaborate(db, idea, cu.id):
            raise HTTPException(status_code=403, detail="Only team can link")
        pid = data.get("project_id")
        if not pid:
            raise HTTPException(status_code=400, detail="project_id required")
        proj = db.get(_PJ, int(pid))
        if not proj:
            raise HTTPException(status_code=404, detail="Project not found")
        if proj.owner_id != cu.id and idea.owner_id != cu.id:
            raise HTTPException(status_code=403, detail="Only project owner can link")
        ex = db.query(_PL).filter(_PL.idea_id == idea.id,
                                  _PL.project_id == proj.id).first()
        if not ex:
            db.add(_PL(idea_id=idea.id, project_id=proj.id, linked_by=cu.id))
        idea.project_id = proj.id
        db.commit()
        try:
            for uid in {idea.owner_id, proj.owner_id}:
                s8.upsert_innovation_evidence(
                    db, user_id=uid, skill_names=s8.idea_skill_names(db, idea.id),
                    source_id=idea.id, kind="prototype_linked", idea_title=idea.title)
            db.commit()
        except Exception:
            db.rollback()
        return {"message": "Project linked", "project_id": proj.id}

    @app.post("/api/innovation/ideas/{idea_id}/pitch")
    def save_pitch(idea_id: int, data: dict, cu=Depends(me_dep),
                   db: Session = Depends(get_db)):
        idea = _get_idea(db, idea_id)
        if idea.owner_id != cu.id:
            raise HTTPException(status_code=403, detail="Only owner can manage pitch")
        pt = db.query(_PT).filter(_PT.idea_id == idea.id).order_by(
            _PT.id.desc()).first()
        if not pt:
            pt = _PT(idea_id=idea.id, title=str(data.get("title") or idea.title)[:200],
                     status="draft")
            db.add(pt)
            db.flush()
        for f in ("title", "description", "problem", "solution", "target_users",
                  "impact", "technology", "demo_url", "github_url",
                  "presentation_url", "video_url"):
            if data.get(f) is not None:
                pt.__setattr__(f, str(data[f]).strip()[:5000] or None)
        st = str(data.get("status") or pt.status or "draft").strip().lower()
        if st not in ("draft", "ready", "submitted", "reviewed"):
            raise HTTPException(status_code=400, detail="Invalid pitch status")
        # Only forward transitions via actions; direct jump to reviewed forbidden.
        if st == "reviewed" and pt.status != "submitted":
            raise HTTPException(status_code=400, detail="Pitch must be submitted first")
        if st == "submitted" and pt.status not in ("draft", "ready", "submitted"):
            raise HTTPException(status_code=400, detail="Invalid transition")
        pt.status = st
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if st == "submitted":
            pt.submitted_at = pt.submitted_at or now
            idea.status = "review"
        pt.updated_at = now
        db.commit()
        try:
            if st == "submitted":
                for uid in {idea.owner_id}:
                    s8.upsert_innovation_evidence(
                        db, user_id=uid, skill_names=s8.idea_skill_names(db, idea.id),
                        source_id=idea.id, kind="pitch_submitted", idea_title=idea.title)
                s8.notify(db, idea.owner_id, "innovation",
                          f"Pitch submitted: '{idea.title}'", "innovation-lab.html")
                db.commit()
        except Exception:
            db.rollback()
        return {"pitch": s8.serialize_pitch(pt)}

    @app.post("/api/innovation/pitches/{pitch_id}/review")
    def review_pitch(pitch_id: int, data: dict, cu=Depends(me_dep),
                     db: Session = Depends(get_db)):
        pt = db.get(_PT, int(pitch_id))
        if not pt:
            raise HTTPException(status_code=404, detail="Not found")
        if getattr(cu, "role", "") not in ("admin", "mentor", "recruiter", "faculty"):
            raise HTTPException(status_code=403, detail="Reviewer role required")
        if pt.status != "submitted":
            raise HTTPException(status_code=400, detail="Pitch is not submitted")
        pt.status = "reviewed"
        pt.review_note = str(data.get("review_note") or data.get("note") or "")[:2000] or None
        pt.reviewer_id = cu.id
        pt.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        idea = _get_idea(db, pt.idea_id)
        idea.status = "published"
        db.commit()
        try:
            s8.upsert_innovation_evidence(
                db, user_id=idea.owner_id, skill_names=s8.idea_skill_names(db, idea.id),
                source_id=idea.id, kind="pitch_reviewed", idea_title=idea.title)
            s8.notify(db, idea.owner_id, "innovation",
                      f"Pitch reviewed: '{idea.title}'",
                      f"{cu.name} reviewed your pitch.", "innovation-lab.html")
            db.commit()
        except Exception:
            db.rollback()
        return {"pitch": s8.serialize_pitch(pt)}

    @app.get("/api/innovation/my")
    def my_lab(cu=Depends(me_dep), db: Session = Depends(get_db)):
        return s8.my_summary(db, cu.id)

    @app.get("/api/innovation/discover")
    def discover(cu=Depends(me_dep), db: Session = Depends(get_db)):
        try:
            s8.seed_demo_problems(db)
            db.commit()
        except Exception:
            db.rollback()
        from models import InnovationProblem as _DP
        problems = db.query(_DP).filter(_DP.status == "open").order_by(
            _DP.created_at.desc()).limit(6).all()
        ideas = db.query(_I).order_by(_I.updated_at.desc()).limit(6).all()
        return {"featured_problems": [s8.serialize_problem(p) for p in problems],
                "trending_ideas": [s8.serialize_idea(db, i, cu.id) for i in ideas],
                "mine": s8.my_summary(db, cu.id)}

    @app.post("/api/innovation/ideas/{idea_id}/discuss")
    def idea_discuss(idea_id: int, cu=Depends(me_dep), db: Session = Depends(get_db)):
        from models import Conversation as _C, ConversationParticipant as _CP
        idea = _get_idea(db, idea_id)
        if not s8.can_collaborate(db, idea, cu.id):
            raise HTTPException(status_code=403, detail="Only team can discuss")
        if idea.discussion_id:
            conv = db.get(_C, idea.discussion_id)
            if conv:
                return {"conversation_id": conv.id}
        conv = _C()
        db.add(conv)
        db.flush()
        tids = [t.id for t in db.query(_T).filter(_T.idea_id == idea.id).all()]
        uids = {idea.owner_id, cu.id}
        if tids:
            for r in db.query(_M.user_id).filter(
                    _M.team_id.in_(tids), _M.status == "active").all():
                uids.add(r[0])
        for uid in uids:
            if not db.query(_CP).filter(_CP.conversation_id == conv.id,
                                        _CP.user_id == uid).first():
                db.add(_CP(conversation_id=conv.id, user_id=uid))
        idea.discussion_id = conv.id
        db.commit()
        return {"conversation_id": conv.id}

    @app.get("/api/innovation/evidence")
    def innovation_evidence(cu=Depends(me_dep), db: Session = Depends(get_db)):
        from models import SkillEvidence as _E
        rows = db.query(_E).filter(_E.user_id == cu.id,
                                   _E.source_type == "innovation").order_by(
            _E.id.desc()).all()
        out = []
        for e in rows:
            out.append({"id": e.id, "skill_id": e.skill_id,
                        "skill_name": e.skill.name if e.skill else "Unknown",
                        "source_type": e.source_type, "source_id": e.source_id,
                        "score": float(e.score or 0), "confidence": e.confidence,
                        "evidence_text": e.evidence_text,
                        "created_at": e.created_at.isoformat() if e.created_at else None})
        return {"evidence": out, "total": len(out)}












