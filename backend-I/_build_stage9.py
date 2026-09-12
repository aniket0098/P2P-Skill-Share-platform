"""Build stage9_service.py by writing chunks."""
import os

def w(path, text, mode='w'):
    with open(path, mode, encoding='utf-8') as f:
        f.write(text)

# Block 1: imports + helpers
w('stage9_service.py', '''\
"""Stage 9 AI Career Coach (additive service layer).

Privacy-safe career context builder + AI provider abstraction +
deterministic recommendations engine + conversation CRUD.
"""
from __future__ import annotations
import json
from sqlalchemy.orm import Session
from models import (
    CAREER_COACH_MODES, CareerCoachConversation, CareerCoachMessage,
    Education, InnovationFeedback, InnovationIdea, InnovationIdeaSkill,
    InnovationMilestone, InnovationTeamMember, LearningRecord,
    LearningResource, Project, SandboxChallengeSkill, SandboxParticipant,
    SandboxSubmission, SkillEvidence, StudentProfile, User, UserSkill,
)
from skill_engine import level_to_num, normalize_level
import config


def _tokens(csv_text, limit=16):
    if not csv_text:
        return []
    parts = csv_text if isinstance(csv_text, list) else str(csv_text).split(",")
    out = []
    for p in parts:
        t = str(p or "").strip()
        if t and t not in out:
            out.append(t)
        if len(out) >= limit:
            break
    return out


def _clip(value, limit=220):
    t = str(value or "").strip()
    if not t:
        return ""
    return t[:limit] + ("..." if len(t) > limit else "")


def _first_name(user) -> str:
    name = str(getattr(user, "name", "") or "").strip()
    return name.split()[0] if name else "there"


def _iso(dt):
    return dt.isoformat() if dt else None


def _evidence_by_source(db: Session, user_id: int):
    rows = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id).all()
    by_source = {}

# Block 2a: context builders (skills, learning)
with open('stage9_service.py', 'a', encoding='utf-8') as f:
    f.write('''
def _student_profile_dict(db: Session, user_id: int):
    p = db.query(StudentProfile).filter(StudentProfile.user_id == user_id).first()
    if not p:
        return None
    return {
        "cgpa": p.cgpa,
        "top_skills": _tokens(p.top_skills, 10),
        "programming_languages": _tokens(p.programming_languages, 10),
        "technologies": _tokens(p.technologies, 10),
        "target_job_role": (p.target_job_role or "").strip() or None,
        "preferred_industry": (p.preferred_industry or "").strip() or None,
        "looking_for": (p.looking_for or "").strip() or None,
    }


def _skills_dict(db: Session, user_id: int):
    from stage5_service import insight_map
    imap = insight_map(db)
    rows = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    out = []
    for r in rows:
        ev_count = db.query(SkillEvidence).filter(
            SkillEvidence.user_id == user_id,
            SkillEvidence.skill_id == r.skill_id).count()
        ev_types = list(dict.fromkeys(
            e.source_type for e in db.query(SkillEvidence).filter(
                SkillEvidence.user_id == user_id,
                SkillEvidence.skill_id == r.skill_id).all()
            if e.source_type))
        ins = imap.get(r.skill_id)
        out.append({
            "skill_name": r.skill.name if r.skill else "Unknown",
            "category": r.skill.category if r.skill else None,
            "level": normalize_level(r.level),
            "level_num": level_to_num(r.level),
            "self_rating": r.self_rating,
            "evidence_count": ev_count,
            "evidence_sources": ev_types[:4],
            "is_verified": bool(r.is_verified),
            "demand_score": int(ins.demand_score) if ins and ins.demand_score is not None else None,
        })
    out.sort(key=lambda x: (-x["level_num"], -x["evidence_count"], x["skill_name"].lower()))
    return out


def _learning_dict(db: Session, user_id: int):
    rows = db.query(LearningRecord).filter(LearningRecord.user_id == user_id).order_by(
        LearningRecord.updated_at.desc()).all()
    items = []
    for r in rows[:10]:
        resource_title = r.resource_title
        if not resource_title and getattr(r, "resource", None) is not None:
            resource_title = r.resource.title
        items.append({

# Block 2b-i: projects, sandbox, innovation
with open('stage9_service.py', 'a', encoding='utf-8') as f:
    f.write('''
def _projects_dict(db: Session, user_id: int):
    rows = db.query(Project).filter(Project.owner_id == user_id).order_by(
        Project.updated_at.desc()).all()
    items = []
    tech = []
    for p in rows[:8]:
        pts = _tokens(p.technologies, 12)
        tech.extend(pts)
        items.append({
            "title": p.title, "status": p.status or "draft",
            "technologies": pts,
            "has_github": bool((p.github_url or "").strip()),
            "has_demo": bool((p.demo_url or "").strip()),
            "updated_at": _iso(p.updated_at),
        })
    return {"total": len(rows), "items": items, "tech_set": list(dict.fromkeys(tech))[:20]}


def _sandbox_dict(db: Session, user_id: int):
    from models import SandboxChallenge
    parts = db.query(SandboxParticipant).filter(SandboxParticipant.user_id == user_id).order_by(
        SandboxParticipant.started_at.desc()).all()
    items = []
    for p in parts[:8]:
        ch = db.get(SandboxChallenge, p.challenge_id)
        if not ch:
            continue
        skills = [cs.skill.name for cs in db.query(SandboxChallengeSkill).filter(
            SandboxChallengeSkill.challenge_id == ch.id).all() if cs.skill][:6]
        items.append({
            "id": ch.id, "title": ch.title, "status": p.status,
            "difficulty": ch.difficulty, "skills": skills,
            "is_demo": bool(ch.is_demo), "completed_at": _iso(p.completed_at),
        })
    n_submitted = db.query(SandboxSubmission).filter(SandboxSubmission.user_id == user_id).count()
    by_src, _, _ = _evidence_by_source(db, user_id)
    return {"joined": len(parts), "submitted": n_submitted,
            "evidence": by_src.get("sandbox", 0), "items": items}


def _innovation_dict(db: Session, user_id: int):
    owned_ids = [i.id for i in db.query(InnovationIdea).filter(
        InnovationIdea.owner_id == user_id).all()]
    joined_ids = [r[0] for r in db.query(InnovationTeamMember.idea_id).filter(
        InnovationTeamMember.user_id == user_id,
        InnovationTeamMember.status == "active").all() if r[0]]

# Block 2b-ii: industry, resources, sandbox targets, build_career_context, ai_context
with open('stage9_service.py', 'a', encoding='utf-8') as f:
    f.write('''
def _industry_dict(db: Session, user_id: int):
    from stage5_service import build_gap, resolve_role, DISCLAIMER
    empty = {"target_role": None, "readiness": None, "skill_gaps": [],
             "recommendations": [], "counts": None}
    user = db.get(User, user_id)
    if not user:
        return empty
    from fastapi import HTTPException
    try:
        role, _src = resolve_role(db, user)
    except (HTTPException, Exception):
        return empty
    gap = build_gap(db, user_id, role)
    items = gap.get("matched", []) + gap.get("partial", []) + gap.get("missing", [])
    items.sort(key=lambda x: (-x.get("gap_levels", 0), x["skill_name"].lower()))
    return {
        "target_role": {
            "id": role.id, "title": role.title,
            "description": _clip(role.description, 180),
            "experience_level": role.experience_level,
            "domain": (role.domain.name if getattr(role, "domain", None) else None),
        },
        "readiness": {
            "score": gap.get("readiness_score"),
            "level": gap.get("readiness_level"),
            "reason": gap.get("reason"),
            "disclaimer": DISCLAIMER,
        },
        "skill_gaps": [
            {
                "skill_name": i["skill_name"], "status": i["status"],
                "priority": i["priority"], "required_level": i["required_level"],
                "student_level": i.get("student_level"),
                "gap_levels": i.get("gap_levels"), "reason": i.get("reason"),
                "importance": i.get("importance"),
                "demand_score": i.get("demand_score"),
                "evidence_status": i.get("evidence_status"),
                "estimated_effort": i.get("estimated_effort"),
            }
            for i in items if i["status"] != "matched"
        ][:12],
        "recommendations": gap.get("recommendations", [])[:6],
        "counts": gap.get("counts"),
    }


def _resources_for_gaps(db: Session, gap_names: list) -> list:
    if not gap_names:
        return []
    out, seen = [], set()
    for name in gap_names[:6]:
        rows = db.query(LearningResource).filter(
            LearningResource.skill.ilike(f"%{name}%")).order_by(
            LearningResource.title).limit(2).all()
        for r in rows:
            if r.id in seen:

# Block 3: build_career_context + ai_context
with open('stage9_service.py', 'a', encoding='utf-8') as f:
    f.write('''
def build_career_context(db: Session, user_id: int) -> dict:
    """Privacy-safe compact career context for the authenticated user."""
    user = db.get(User, user_id)
    educ = db.query(Education).filter(Education.user_id == user_id).order_by(
        Education.id.desc()).limit(3).all()
    skills = _skills_dict(db, user_id)
    evidence_by, evidence_total, skills_with_evidence = _evidence_by_source(db, user_id)
    learning = _learning_dict(db, user_id)
    projects = _projects_dict(db, user_id)
    sandbox = _sandbox_dict(db, user_id)
    innovation = _innovation_dict(db, user_id)
    industry = _industry_dict(db, user_id)
    role = industry.get("target_role") or {}
    gaps = industry.get("skill_gaps") or []
    gap_names = [g["skill_name"] for g in gaps]
    resources = _resources_for_gaps(db, gap_names)
    sandbox_targets = []
    if gaps:
        from models import Skill
        sid_rows = []
        for g in gaps:
            sk = db.query(Skill).filter(
                Skill.name.ilike(f"%{g['skill_name']}%")).first()
            if sk:
                sid_rows.append(sk.id)
        sandbox_targets = _sandbox_targets_for_skills(db, sid_rows)
    profile_complete = bool(
        (user and (user.skills or user.interests)) or skills
    )
    has_target = bool(role)
    return {
        "profile": {
            "first_name": _first_name(user) if user else "there",
            "role_label": (user.role if user else None),
            "bio": _clip(user.bio, 200) if user else None,
            "skills": _tokens(user.skills, 10) if user else [],
            "interests": _tokens(user.interests, 10) if user else [],
        },
        "profile_complete": profile_complete,
        "has_target": has_target,
        "education": [
            {
                "institution_name": ed.institution_name,
                "degree": ed.degree,
                "field_of_study": ed.field_of_study,
                "status": getattr(ed, "status", None),
            }
            for ed in educ
        ],
        "student_profile": _student_profile_dict(db, user_id),
        "target_role": role,
        "readiness": industry.get("readiness"),
        "skills": skills[:12],
        "skill_gaps": gaps,
        "skill_recommendations": industry.get("recommendations"),
        "evidence": {
            "total": evidence_total,
            "skills_with_evidence": skills_with_evidence,
            "by_source": evidence_by,
        },
        "learning": learning,
        "projects": projects,
        "sandbox": sandbox,
        "innovation": innovation,
        "learning_resources": resources,
        "sandbox_targets": sandbox_targets,
        "opportunities_available": False,
        "disclaimer": (industry.get("readiness") or {}).get("disclaimer")
        or "Platform industry dataset (sample data, not live market statistics).",
        "provider": {
            "configured": provider_name(),
            "ai_available": any_ai_available(),
        },
    }


def ai_context(context: dict) -> dict:
    """Trim the full context to the compact subset sent to an AI provider."""
    return {
        "profile": {
            "first_name": (context.get("profile") or {}).get("first_name", "there"),
            "skills": (context.get("profile") or {}).get("skills", []),
            "interests": (context.get("profile") or {}).get("interests", []),
        },
        "profile_complete": context.get("profile_complete"),
        "has_target": context.get("has_target"),

# Block 4: AI Provider Abstraction
with open('stage9_service.py', 'a', encoding='utf-8') as f:
    f.write('''
# ---------------------------------------------------------------------------
# AI Provider Abstraction
# ---------------------------------------------------------------------------

class CareerAIProvider:
    """Abstract base for career coach AI providers."""
    def chat(self, system_prompt: str, user_message: str, context: dict,
             history: list[dict] | None = None) -> dict:
        raise NotImplementedError


class ExternalAIProvider(CareerAIProvider):
    """OpenAI-compatible chat API using server-side AI_API_KEY."""
    def chat(self, system_prompt: str, user_message: str, context: dict,
             history: list[dict] | None = None) -> dict:
        if not config.AI_API_KEY:
            return {"content": "", "provider": "external", "ai_used": False,
                    "error": "AI_API_KEY not configured"}
        try:
            import httpx
            messages = [{"role": "system", "content": system_prompt}]
            for h in (history or [])[-6:]:
                role = "user" if h.get("role") == "user" else "assistant"
                content = str(h.get("content", ""))[:1200]
                if content:
                    messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": user_message[:2000]})
            with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS) as client:
                resp = client.post(
                    f"{config.AI_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {config.AI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": config.AI_MODEL,
                        "messages": messages,
                        "max_tokens": config.AI_MAX_TOKENS,
                        "temperature": 0.4,
                    },
                )
            if resp.status_code != 200:
                return {"content": "", "provider": "external", "ai_used": False,
                        "error": f"AI API error {resp.status_code}: {resp.text[:200]}"}
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if not content:
                return {"content": "", "provider": "external", "ai_used": False,
                        "error": "Empty AI response"}
            return {"content": content.strip(), "provider": "external", "ai_used": True, "error": None}
        except Exception as e:
            return {"content": "", "provider": "external", "ai_used": False,
                    "error": f"AI provider error: {str(e)[:200]}"}


class LocalAIProvider(CareerAIProvider):
    """Local/private model server (LM Studio, Ollama with OpenAI compat layer)."""
    def chat(self, system_prompt: str, user_message: str, context: dict,
             history: list[dict] | None = None) -> dict:
        try:
            import httpx
            messages = [{"role": "system", "content": system_prompt}]
            for h in (history or [])[-4:]:
                role = "user" if h.get("role") == "user" else "assistant"
                content = str(h.get("content", ""))[:1000]
                if content:
                    messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": user_message[:1500]})
            with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS) as client:
                resp = client.post(
                    f"{config.AI_LOCAL_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json"},
                    json={
                        "model": config.AI_MODEL,
                        "messages": messages,
                        "max_tokens": config.AI_MAX_TOKENS,
                        "temperature": 0.4,
                    },
                )
            if resp.status_code != 200:
                return {"content": "", "provider": "local", "ai_used": False,
                        "error": f"Local AI error {resp.status_code}"}
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if not content:
                return {"content": "", "provider": "local", "ai_used": False,
                        "error": "Empty local AI response"}
            return {"content": content.strip(), "provider": "local", "ai_used": True, "error": None}
        except Exception as e:
            return {"content": "", "provider": "local", "ai_used": False,
                    "error": f"Local AI unavailable: {str(e)[:200]}"}
''')

print("Block 4a written")

        "education": (context.get("education") or [])[:2],
        "target_role": context.get("target_role"),
        "readiness": context.get("readiness"),
        "skills": (context.get("skills") or [])[:8],
        "skill_gaps": (context.get("skill_gaps") or [])[:6],
        "skill_recommendations": (context.get("skill_recommendations") or [])[:5],
        "evidence": context.get("evidence"),
        "learning": {
            "total": (context.get("learning") or {}).get("total", 0),
            "completed": (context.get("learning") or {}).get("completed", 0),
            "overall_progress": (context.get("learning") or {}).get("overall_progress", 0),
            "recent": ((context.get("learning") or {}).get("recent") or [])[:5],
            "by_skill": ((context.get("learning") or {}).get("by_skill") or [])[:6],
        },
        "projects": {
            "total": (context.get("projects") or {}).get("total", 0),
            "items": ((context.get("projects") or {}).get("items") or [])[:4],
            "tech_set": (context.get("projects") or {}).get("tech_set", [])[:12],
        },
        "sandbox": {
            "joined": (context.get("sandbox") or {}).get("joined", 0),
            "items": ((context.get("sandbox") or {}).get("items") or [])[:3],
        },
        "innovation": {"ideas": ((context.get("innovation") or {}).get("ideas") or [])[:3]},
        "learning_resources": (context.get("learning_resources") or [])[:5],
        "sandbox_targets": (context.get("sandbox_targets") or [])[:4],
        "opportunities_available": context.get("opportunities_available", False),
        "disclaimer": context.get("disclaimer", ""),
    }
''')

print("Block 3 written")

                continue
            seen.add(r.id)
            out.append({"id": r.id, "skill": r.skill, "title": r.title,
                        "provider": r.provider, "difficulty": r.difficulty,
                        "resource_type": r.resource_type, "url": r.url})
            if len(out) >= 8:
                return out
    return out


def _sandbox_targets_for_skills(db: Session, gap_skill_ids: list) -> list:
    if not gap_skill_ids:
        return []
    ids = [r[0] for r in db.query(SandboxChallengeSkill.challenge_id).filter(
        SandboxChallengeSkill.skill_id.in_(gap_skill_ids)).all()]
    if not ids:
        return []
    from models import SandboxChallenge
    rows = db.query(SandboxChallenge).filter(
        SandboxChallenge.id.in_(ids),
        SandboxChallenge.status == "open").order_by(
        SandboxChallenge.created_at.desc()).limit(5).all()
    out = []
    for ch in rows:
        skills = [cs.skill.name for cs in db.query(SandboxChallengeSkill).filter(
            SandboxChallengeSkill.challenge_id == ch.id).all() if cs.skill][:6]
        out.append({
            "id": ch.id, "title": ch.title, "difficulty": ch.difficulty,
            "estimated_time": ch.estimated_time, "industry": ch.industry,
            "skills": skills, "is_demo": bool(ch.is_demo),
        })
    return out
''')

print("Block 2b-ii written")

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
            "id": iid, "title": idea.title, "status": idea.status,
            "skills": skills[:8], "owner": idea.owner_id == user_id,
            "milestones_completed": ms_done, "feedback_count": fb,
            "updated_at": _iso(idea.updated_at),
        })
    return {"ideas": items}
''')

print("Block 2b-i written")

            "skill_name": (r.skill_name or "General").strip(),
            "resource_title": resource_title,
            "resource_type": r.resource_type,
            "progress": r.progress_percentage or 0,
            "status": r.status,
            "updated_at": _iso(r.updated_at),
        })
    total = len(rows)
    done = sum(1 for r in rows if (r.status or "").lower() in ("completed", "done") or (r.progress_percentage or 0) >= 100)
    avg = round(sum((r.progress_percentage or 0) for r in rows) / total, 1) if total else 0.0
    by_skill = {}
    for r in rows:
        key = (r.skill_name or "General").strip() or "General"
        e = by_skill.setdefault(key, {"skill": key, "count": 0, "psum": 0.0, "completed": 0})
        e["count"] += 1
        e["psum"] += float(r.progress_percentage or 0)
        if (r.status or "").lower() == "completed" or (r.progress_percentage or 0) >= 100:
            e["completed"] += 1
    sp = [{"skill": k, "count": v["count"], "completed": v["completed"],
           "avg_progress": round(v["psum"] / v["count"], 1)} for k, v in by_skill.items()]
    sp.sort(key=lambda x: (-x["count"], -x["avg_progress"]))
    return {"total": total, "completed": done, "overall_progress": round(avg, 1),
            "recent": items, "by_skill": sp[:8]}
''')

print("Block 2a written")

    skills_with_evidence = set()
    for r in rows:
        src = (r.source_type or "other").lower()
        by_source[src] = by_source.get(src, 0) + 1
        if r.skill_id:
            skills_with_evidence.add(r.skill_id)
    return by_source, len(rows), len(skills_with_evidence)

''')

print("Block 1 written")
