"""Stage 5 — Skill Mapping + Industry Insights intelligence engine.

Deterministic, explainable, repeatable. The frontend visualises results;
all readiness / gap / priority maths lives here on the backend.

Level scale:
    beginner=1, intermediate=2, advanced=3, expert=4

Importance weights:
    critical=4, high=3, medium=2, low=1

Readiness for a role:
    sum(weight * min(student_level, required_level) / required_level)
    / sum(weight) * 100, over REQUIRED role skills only.
    Verified/evidence-backed skills add a bounded +5% confidence bonus
    per skill (capped at +10 total) — never arbitrary inflation.

Demand scale (0-100, platform sample data):
    90-100 Very High · 75-89 High · 50-74 Moderate · 25-49 Emerging/Low ·
    0-24 Low.

Readiness bands:
    0-39 Needs Foundation · 40-59 Developing · 60-74 Progressing ·
    75-89 Industry Ready · 90-100 Highly Competitive.
"""

from __future__ import annotations


LEVEL_TO_NUM = {
    "beginner": 1,
    "intermediate": 2,
    "advanced": 3,
    "expert": 4,
}

NUM_TO_LEVEL = {v: k for k, v in LEVEL_TO_NUM.items()}

IMPORTANCE_WEIGHTS = {
    "critical": 4.0,
    "high": 3.0,
    "medium": 2.0,
    "low": 1.0,
}

READINESS_BANDS = [
    (90, "Highly Competitive"),
    (75, "Industry Ready"),
    (60, "Progressing"),
    (40, "Developing"),
    (0, "Needs Foundation"),
]

EFFORT_BY_GAP = {0: None, 1: "2-4 weeks", 2: "1-2 months", 3: "2-4 months"}


def normalize_level(level) -> str:
    text = str(level or "beginner").strip().lower()
    return text if text in LEVEL_TO_NUM else "beginner"


def level_to_num(level) -> int:
    return LEVEL_TO_NUM[normalize_level(level)]


def normalize_importance(importance) -> str:
    text = str(importance or "medium").strip().lower()
    return text if text in IMPORTANCE_WEIGHTS else "medium"


def importance_weight(importance) -> float:
    return IMPORTANCE_WEIGHTS[normalize_importance(importance)]


def demand_band(score) -> str:
    try:
        value = float(score)
    except (TypeError, ValueError):
        return "Moderate"
    if value >= 90:
        return "Very High"
    if value >= 75:
        return "High"
    if value >= 50:
        return "Moderate"
    if value >= 25:
        return "Emerging/Low"
    return "Low"


def readiness_band(score) -> str:
    try:
        value = float(score)
    except (TypeError, ValueError):
        return "Needs Foundation"
    for threshold, label in READINESS_BANDS:
        if value >= threshold:
            return label
    return "Needs Foundation"


def readiness_reason(top_strengths, top_gaps, role_title: str) -> str:
    strengths = ", ".join(top_strengths[:2]) if top_strengths else "no matched skills yet"
    gaps = ", ".join(top_gaps[:2]) if top_gaps else "no major gaps"
    return (
        f"For {role_title}, your strongest areas are {strengths}. "
        f"The largest gaps are {gaps}."
    )


def score_role(requirements, student_levels, verified_skill_ids=None):
    """Score one role against a student's levels.

    requirements: iterable of dicts with skill_id, required_level,
        importance, skill_type.
    student_levels: {skill_id: level_num}.
    Returns (readiness_float, verified_bonus_float).
    """
    verified_skill_ids = verified_skill_ids or set()
    total_weight = 0.0
    earned = 0.0
    verified_bonus = 0.0
    for req in requirements:
        if str(req.get("skill_type") or "required").lower() != "required":
            continue
        weight = importance_weight(req.get("importance"))
        required = max(level_to_num(req.get("required_level")), 1)
        student = int(student_levels.get(req.get("skill_id"), 0) or 0)
        total_weight += weight
        earned += weight * (min(student, required) / required)
        if student >= required and req.get("skill_id") in verified_skill_ids:
            verified_bonus += 1.0
    if total_weight <= 0:
        return 0.0, 0.0
    readiness = round(earned / total_weight * 100, 1)
    bonus = min(verified_bonus * 1.0, 10.0)
    readiness = min(round(readiness + bonus, 1), 100.0)
    return readiness, bonus
