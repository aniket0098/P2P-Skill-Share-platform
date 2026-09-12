"""Build stage9_service.py - full rebuild."""
import pathlib

# Part 1: imports and helpers
p1 = '''"""Stage 9 \\u2014 AI Career Coach (additive service layer)."""
from __future__ import annotations
import json
from sqlalchemy.orm import Session
from models import (
    CAREER_COACH_MODES, CareerCoachConversation, CareerCoachMessage,
    Education, InnovationFeedback, InnovationIdea, InnovationIdeaSkill,
    InnovationMilestone, InnovationTeamMember, LearningRecord, LearningResource,
    Project, SandboxChallenge, SandboxChallengeSkill, SandboxParticipant,
    SandboxSubmission, SkillEvidence, StudentProfile, User, UserSkill,
)
from skill_engine import level_to_num, normalize_level
import config

def _tokens(csv_text, limit=16):
    if not csv_text: return []
    parts = csv_text if isinstance(csv_text, list) else str(csv_text).split(",")
    out = []
    for p in parts:
        t = str(p or "").strip()
        if t and t not in out:
            out.append(t)
        if len(out) >= limit: break
    return out

def _clip(value, limit=220):
    t = str(value or "").strip()
    if not t: return ""
    return t[:limit] + ("\\u2026" if len(t) > limit else "")

def _first_name(user):
    name = str(getattr(user, "name", "") or "").strip()
    return name.split()[0] if name else "there"

def _iso(dt):
    return dt.isoformat() if dt else None

def _evidence_by_source(db, user_id):
    rows = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id).all()
    by_source = {}
    skills_with_evidence = set()
    for r in rows:
        src = (r.source_type or "other").lower()
        by_source[src] = by_source.get(src, 0) + 1
        if r.skill_id: skills_with_evidence.add(r.skill_id)
    return by_source, len(rows), len(skills_with_evidence)
'''

pathlib.Path('stage9_service.py').write_text(p1, encoding='utf-8')
print('Part 1 written')

"""Build stage9_service.py - append context builders."""
import pathlib

part2a = '''

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
        ev, ev_src = 0, []
        for e in db.query(SkillEvidence).filter(
                SkillEvidence.user_id == user_id,
                SkillEvidence.skill_id == r.skill_id).all():
            ev += 1
            if e.source_type not in ev_src:
                ev_src.append(e.source_type)
        ins = imap.get(r.skill_id)
        out.append({
            "skill_name": r.skill.name if r.skill else "Unknown",
            "category": r.skill.category if r.skill else None,
            "level": normalize_level(r.level),
            "level_num": level_to_num(r.level),
            "self_rating": r.self_rating,
            "evidence_count": ev,
            "evidence_sources": ev_src[:4],
            "is_verified": bool(r.is_verified),
            "demand_score": int(ins.demand_score) if ins and ins.demand_score is not None else None,
        })
    out.sort(key=lambda x: (-x["level_num"], -x["evidence_count"], x["skill_name"].lower()))
    return out
'''

existing = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')
pathlib.Path('stage9_service.py').write_text(existing + part2a, encoding='utf-8')
print('Part 2a done')

"""Build stage9_service.py from scratch."""
import pathlib

part1 = '''"""Stage 9 — AI Career Coach (additive service layer).

Builds a privacy-safe, compact career context from existing platform tables
and produces deterministic career intelligence plus optional AI explanation.
"""
from __future__ import annotations

import json
import time
import uuid

from sqlalchemy.orm import Session

from models import (
    CAREER_COACH_MODES,
    CareerCoachConversation,
    CareerCoachMessage,
    Education,
    InnovationFeedback,
    InnovationIdea,
    InnovationIdeaSkill,
    InnovationMilestone,
    InnovationTeamMember,
    LearningRecord,
    LearningResource,
    Project,
    SandboxChallenge,
    SandboxChallengeSkill,
    SandboxParticipant,
    SandboxSubmission,
    SkillEvidence,
    StudentProfile,
    User,
    UserSkill,
)
from skill_engine import level_to_num, normalize_level
import config


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

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
    return t[:limit] + ("\\u2026" if len(t) > limit else "")


def _first_name(user) -> str:
    name = str(getattr(user, "name", "") or "").strip()
    return name.split()[0] if name else "there"


def _iso(dt):
    return dt.isoformat() if dt else None


def _evidence_by_source(db: Session, user_id: int):
    rows = db.query(SkillEvidence).filter(SkillEvidence.user_id == user_id).all()
    by_source = {}
    skills_with_evidence = set()
    for r in rows:
        src = (r.source_type or "other").lower()
        by_source[src] = by_source.get(src, 0) + 1
        if r.skill_id:
            skills_with_evidence.add(r.skill_id)
    return by_source, len(rows), len(skills_with_evidence)
'''

pathlib.Path('stage9_service.py').write_text(part1, encoding='utf-8')
print('Part 1 written')
