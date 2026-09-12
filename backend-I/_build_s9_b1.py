"""Build block 1 of stage9_service.py"""
content = '''"""Stage 9 — AI Career Coach (additive service layer)."""
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

with open('stage9_block01.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Block 1 done")
