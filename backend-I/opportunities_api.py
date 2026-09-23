"""Stage 2.2B API: Academia <-> Industry Opportunities (foundation).

Stage 2.3 adds the publish/close lifecycle (draft -> published -> closed).

Stage 2.4 adds student discovery + server-side eligibility:
  * GET /api/opportunities gains an optional `location` filter
    (additive; published-only visibility and pagination are unchanged).
  * GET /api/opportunities/me/recommended returns a personalized,
    deterministic ordering for the JWT student with per-opportunity
    eligibility, skill match, missing skills and reasons.

Stage 2.5A adds the STUDENT-SIDE application workflow:
  * POST /api/opportunities/{id}/apply      (student-only, 201/409/404/422)
  * GET  /api/applications/me               (JWT student's own applications)
  * POST /api/applications/{id}/withdraw    (owner only, applied -> withdrawn)
  Eligibility is recalculated from current database state at apply time;
  UNIQUE(opportunity_id, student_user_id) is the authoritative duplicate
  guard (IntegrityError -> rollback -> 409, so concurrent applies are safe).
  The apply-time snapshot is written once and never regenerated.
  Recruiter applicant management lived in a later stage; Stage 2.5B
  implements it here:
   * GET   /api/opportunities/{id}/applications  (owner recruiter only)
   * PATCH /api/applications/{id}/status          (owner recruiter only)
   Ownership is always opportunity.owner_user_id == current_user.id;
   company_name / email domain are never consulted. Recruiter moves
   follow one central transition map (applied -> reviewing ->
   shortlisted -> interview -> selected, plus * -> rejected;
   applied -> withdrawn stays student-only via Stage 2.5A withdraw).
   Status vocabulary is enforced in application code (the
   applications.status column is a plain string with no enum);
   "under_review" survives only as a legacy read-filter alias.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from models import (
    Application,
    Opportunity,
    OpportunitySkill,
    RecruiterProfile,
    Skill,
    StudentProfile,
    User,
    UserSkill,
)
from skill_engine import importance_weight, level_to_num, normalize_level

OPPORTUNITY_TYPES = (
    "internship",
    "job",
    "placement",
    "apprenticeship",
    "mini_project",
    "part_time",
)
WORK_MODES = ("remote", "hybrid", "onsite")
LISTABLE_STATUS = "published"
# Opportunity lifecycle vocabulary (Stage 9.2 archival hardening).
# draft | published | closed | archived - only "published" is publicly
# listable. "archived" is the terminal retention state: the opportunity
# leaves circulation (and can no longer receive applications) while its
# application history stays intact - hard DELETE remains draft-only
# because deleting a published/closed row would CASCADE away applications.
OPPORTUNITY_STATUSES = ("draft", "published", "closed", "archived")
ARCHIVED_STATUS = "archived"
ARCHIVABLE_STATUSES = ("published", "closed")
REQUIRED_LEVELS = ("beginner", "intermediate", "advanced", "expert")
IMPORTANCE_LEVELS = ("critical", "high", "medium", "low")
SKILL_TYPES = ("required", "preferred")

# ================================================================
# STAGE 2.5A/2.5B - APPLICATION STATUS VOCABULARY + TRANSITIONS.
# ================================================================
# Canonical application statuses. The Stage 2.5B recruiter workflow
# moves applied -> reviewing -> shortlisted -> interview ->
# selected, with applied/reviewing/shortlisted/interview -> rejected
# and applied -> withdrawn (student-only Stage 2.5A endpoint).
APPLIED_STATUS = "applied"
WITHDRAWN_STATUS = "withdrawn"
APPLICATION_STATUSES = (
    "applied",
    "reviewing",
    "shortlisted",
    "interview",
    "selected",
    "rejected",
    "withdrawn",
)
# Legacy label from the original model comment. NOT writable and NOT
# reachable by any transition (fail-closed); kept ONLY in the read
# vocabulary of GET /api/applications/me so that Stage 2.5A filter
# contract is preserved exactly (200 + empty list).
LEGACY_APPLICATION_STATUSES = ("under_review",)
APPLICATION_FILTER_STATUSES = APPLICATION_STATUSES + LEGACY_APPLICATION_STATUSES
# ONE central recruiter transition map (Stage 2.5B). Terminal states
# (selected / rejected / withdrawn) have no outgoing edges; any move
# not listed here - including out of a legacy "under_review" row -
# is rejected with 409. The student-only applied -> withdrawn move is
# owned by POST /api/applications/{id}/withdraw and is deliberately
# absent here (a recruiter PATCH to withdrawn is invalid).
APPLICATION_STATUS_TRANSITIONS = {
    "applied": ("reviewing", "rejected"),
    "reviewing": ("shortlisted", "rejected"),
    "shortlisted": ("interview", "rejected"),
    "interview": ("selected", "rejected"),
    "selected": (),
    "rejected": (),
    "withdrawn": (),
}
# Server-side caps for free-text recruiter input (oversized payloads
# are rejected with 422 by the request model).
RECRUITER_NOTE_MAX = 2000
REJECTION_REASON_MAX = 1000
# Student-settable application fields are ONLY these. The server
# controls status / reviewed_by_user_id / status_changed_at /
# recruiter_note / rejection_reason; the request model forbids extras.
COVER_NOTE_MAX = 2000


# ================================================================
# STAGE 9.4 - APPLICATION STATUS NOTIFICATION COPY (central, once).
# ================================================================
# Concise professional student-facing copy for the server-side
# application-status notifications created after a successful recruiter
# status change. The type stays "application_status" and the link always
# points at the student's own applications page - never a recruiter-only
# route, never private recruiter data.
APPLICATION_STATUS_NOTIFICATIONS = {
    "reviewing": (
        "Application update",
        "Your application for {title} is now under review.",
    ),
    "shortlisted": (
        "Application update",
        "Your application for {title} has been shortlisted.",
    ),
    "interview": (
        "Application update",
        "Your application for {title} has moved to interview.",
    ),
    "selected": (
        "Application update",
        "Your application for {title} was selected.",
    ),
    "rejected": (
        "Application update",
        "Your application for {title} was not selected.",
    ),
}
APPLICATION_STATUS_LINK = "applications.html"


def _clean_optional_str(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


class OpportunityCreateIn(BaseModel):
    title: str
    description: str
    opportunity_type: str | None = "internship"
    responsibilities: str | None = None
    eligibility_text: str | None = None
    work_mode: str | None = None
    location: str | None = None
    duration: str | None = None
    compensation: str | None = None
    openings: int | None = None
    deadline: datetime | None = None
    start_date: datetime | None = None
    min_cgpa: float | None = None
    allowed_graduation_years: str | None = None
    min_graduation_year: int | None = None
    max_graduation_year: int | None = None
    eligible_degree: str | None = None
    eligible_branch: str | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        text = str(v or "").strip()
        if not text:
            raise ValueError("Title is required")
        if len(text) > 200:
            raise ValueError("Title must be at most 200 characters")
        return text

    @field_validator("description")
    @classmethod
    def _description(cls, v):
        text = str(v or "").strip()
        if not text:
            raise ValueError("Description is required")
        if len(text) > 5000:
            raise ValueError("Description must be at most 5000 characters")
        return text

    @field_validator("opportunity_type")
    @classmethod
    def _otype(cls, v):
        if v is None:
            return "internship"
        text = str(v).strip().lower()
        if not text:
            return "internship"
        if text not in OPPORTUNITY_TYPES:
            raise ValueError("Invalid opportunity_type")
        return text

    @field_validator("work_mode")
    @classmethod
    def _wmode(cls, v):
        if v is None:
            return None
        text = str(v).strip().lower()
        if not text:
            return None
        if text not in WORK_MODES:
            raise ValueError("Invalid work_mode")
        return text

    @field_validator(
        "responsibilities", "eligibility_text", "location",
        "duration", "compensation", "allowed_graduation_years",
        "eligible_degree", "eligible_branch", mode="before",
    )
    @classmethod
    def _optional_text(cls, v):
        return _clean_optional_str(v)

    @field_validator("openings")
    @classmethod
    def _openings(cls, v):
        if v is None:
            return None
        if v <= 0:
            raise ValueError("Openings must be positive")
        if v > 1000:
            raise ValueError("Openings must be at most 1000")
        return v

    @field_validator("min_cgpa")
    @classmethod
    def _cgpa(cls, v):
        if v is None:
            return None
        if v < 0 or v > 10:
            raise ValueError("min_cgpa must be between 0 and 10")
        return v

    @field_validator("min_graduation_year", "max_graduation_year")
    @classmethod
    def _grad_year(cls, v):
        if v is None:
            return None
        if v < 1990 or v > 2100:
            raise ValueError("Graduation year must be between 1990 and 2100")
        return v

    @model_validator(mode="after")
    def _grad_window(self):
        if (
            self.min_graduation_year is not None
            and self.max_graduation_year is not None
            and self.min_graduation_year > self.max_graduation_year
        ):
            raise ValueError(
                "min_graduation_year cannot exceed max_graduation_year"
            )
        return self


class OpportunityUpdateIn(BaseModel):
    title: str | None = None
    description: str | None = None
    opportunity_type: str | None = None
    responsibilities: str | None = None
    eligibility_text: str | None = None
    work_mode: str | None = None
    location: str | None = None
    duration: str | None = None
    compensation: str | None = None
    openings: int | None = None
    deadline: datetime | None = None
    start_date: datetime | None = None
    min_cgpa: float | None = None
    allowed_graduation_years: str | None = None
    min_graduation_year: int | None = None
    max_graduation_year: int | None = None
    eligible_degree: str | None = None
    eligible_branch: str | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v):
        if v is None:
            return None
        text = str(v).strip()
        if not text:
            raise ValueError("Title cannot be empty")
        if len(text) > 200:
            raise ValueError("Title must be at most 200 characters")
        return text

    @field_validator("description")
    @classmethod
    def _description(cls, v):
        if v is None:
            return None
        text = str(v).strip()
        if not text:
            raise ValueError("Description cannot be empty")
        if len(text) > 5000:
            raise ValueError("Description must be at most 5000 characters")
        return text

    @field_validator("opportunity_type")
    @classmethod
    def _otype(cls, v):
        if v is None:
            return None
        text = str(v).strip().lower()
        if text not in OPPORTUNITY_TYPES:
            raise ValueError("Invalid opportunity_type")
        return text

    @field_validator("work_mode")
    @classmethod
    def _wmode(cls, v):
        if v is None:
            return None
        text = str(v).strip().lower()
        if not text:
            return None
        if text not in WORK_MODES:
            raise ValueError("Invalid work_mode")
        return text

    @field_validator(
        "responsibilities", "eligibility_text", "location",
        "duration", "compensation", "allowed_graduation_years",
        "eligible_degree", "eligible_branch", mode="before",
    )
    @classmethod
    def _optional_text(cls, v):
        return _clean_optional_str(v)

    @field_validator("openings")
    @classmethod
    def _openings(cls, v):
        if v is None:
            return None
        if v <= 0:
            raise ValueError("Openings must be positive")
        if v > 1000:
            raise ValueError("Openings must be at most 1000")
        return v

    @field_validator("min_cgpa")
    @classmethod
    def _cgpa(cls, v):
        if v is None:
            return None
        if v < 0 or v > 10:
            raise ValueError("min_cgpa must be between 0 and 10")
        return v

    @field_validator("min_graduation_year", "max_graduation_year")
    @classmethod
    def _grad_year(cls, v):
        if v is None:
            return None
        if v < 1990 or v > 2100:
            raise ValueError("Graduation year must be between 1990 and 2100")
        return v

    @model_validator(mode="after")
    def _grad_window(self):
        if (
            self.min_graduation_year is not None
            and self.max_graduation_year is not None
            and self.min_graduation_year > self.max_graduation_year
        ):
            raise ValueError(
                "min_graduation_year cannot exceed max_graduation_year"
            )
        return self


class OpportunitySkillIn(BaseModel):
    skill_id: int
    required_level: str | None = "intermediate"
    importance: str | None = "medium"
    skill_type: str | None = "required"

    @field_validator("required_level")
    @classmethod
    def _level(cls, v):
        text = str(v or "intermediate").strip().lower()
        if text not in REQUIRED_LEVELS:
            raise ValueError("Invalid required_level")
        return text

    @field_validator("importance")
    @classmethod
    def _importance(cls, v):
        text = str(v or "medium").strip().lower()
        if text not in IMPORTANCE_LEVELS:
            raise ValueError("Invalid importance")
        return text

    @field_validator("skill_type")
    @classmethod
    def _stype(cls, v):
        text = str(v or "required").strip().lower()
        if text not in SKILL_TYPES:
            raise ValueError("Invalid skill_type")
        return text


class OpportunitySkillsIn(BaseModel):
    skills: list[OpportunitySkillIn] = []


def _require_recruiter(cu):
    if (getattr(cu, "role", None) or "").strip().lower() != "recruiter":
        raise HTTPException(
            status_code=403,
            detail="Only recruiter accounts can manage opportunities",
        )
    return cu


def _get_owned_opportunity(db: Session, opportunity_id: int, cu):
    opp = db.get(Opportunity, opportunity_id)
    if opp is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if opp.owner_user_id != cu.id:
        raise HTTPException(
            status_code=403,
            detail="Only the owner can manage this opportunity",
        )
    return opp


def _slugify(title: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", str(title or "").strip().lower())
    base = base.strip("-")[:60].strip("-")
    return base or "opportunity"


def _unique_slug(db: Session, title: str) -> str:
    base = _slugify(title)
    slug = base
    suffix = 2
    while db.query(Opportunity.id).filter(Opportunity.slug == slug).first():
        slug = f"{base}-{suffix}"
        suffix += 1
    return slug


def _company_snapshot(profile: RecruiterProfile | None) -> str | None:
    if profile is None:
        return None
    payload = {
        "company_name": (profile.company_name or "").strip() or None,
        "company_website": (profile.company_website or "").strip() or None,
        "industry": (profile.industry or "").strip() or None,
        "company_size": (profile.company_size or "").strip() or None,
        "company_location": (profile.company_location or "").strip() or None,
    }
    if not any(payload.values()):
        return None
    return json.dumps(payload)


# ================================================================
# STAGE 2.4 - STUDENT DISCOVERY + SERVER-SIDE ELIGIBILITY.
#
# Additive only; there is intentionally no second skill system:
# student levels come from canonical user_skills rows compared with
# the canonical skill_engine LEVEL scale via level_to_num /
# importance_weight / normalize_level. Eligibility and
# match_percentage stay distinct concepts (eligible=false with a
# high match is valid, as is eligible=true with a low match).
# ================================================================
RECOMMENDATION_SCAN_LIMIT = 500
MATCH_DISCLAIMER = (
    "Platform skill/profile match indicator (not a hiring probability)."
)


def _norm_token(value) -> str:
    """Normalize a degree/branch token for harmless formatting diffs.

    Lowercases and collapses separators so "B.Tech", "BTech",
    "b tech" and "b-tech" compare equal. Returns "" when empty.
    """
    text = str(value or "").strip().lower()
    if not text:
        return ""
    for sep in (".", "-", "/", "_", "&", ",", ";"):
        text = text.replace(sep, " ")
    return re.sub(r"\s+", " ", text).strip()


def _norm_token_set(csv_value) -> set:
    """Split a CSV eligibility column into normalized tokens."""
    tokens: set[str] = set()
    for raw in str(csv_value or "").split(","):
        token = _norm_token(raw)
        if token:
            tokens.add(token)
    return tokens


# Narrow, explicit same-subject aliases seen in platform data.
# Only true abbreviations/formatting variants of the SAME subject
# are grouped - unrelated branches are never treated as equal.
DEGREE_ALIAS_GROUPS = (
    {"btech", "b tech", "bachelor of technology"},
    {"mtech", "m tech", "master of technology"},
    {"be", "b e", "bachelor of engineering"},
    {"me", "m e", "master of engineering"},
    {"bca", "bachelor of computer applications"},
    {"mca", "master of computer applications"},
    {"bsc", "b sc", "bachelor of science"},
    {"msc", "m sc", "master of science"},
    {"bba", "bachelor of business administration"},
    {"mba", "master of business administration"},
    {"bcom", "b com", "bachelor of commerce"},
    {"mcom", "m com", "master of commerce"},
    {"phd", "ph d", "doctor of philosophy"},
    {"diploma"},
)
BRANCH_ALIAS_GROUPS = (
    {"cse", "cs", "computer science", "computer science engineering"},
    {"it", "information technology"},
    {"ece", "electronics and communication", "electronics communication"},
    {"eee", "electrical and electronics", "electrical electronics"},
    {"ee", "electrical", "electrical engineering"},
    {"mech", "me", "mechanical", "mechanical engineering"},
    {"civil", "ce", "civil engineering"},
    {"ai", "artificial intelligence"},
    {"ds", "data science"},
    {"aids", "ai ds", "artificial intelligence and data science"},
    {"aiml", "ai ml", "artificial intelligence and machine learning"},
    {"cyber", "cyber security", "cybersecurity"},
)


def _token_matches(actual: str, required: set, alias_groups) -> bool:
    """True when a normalized student token satisfies a requirement set.

    Exact normalized equality first, then the narrow explicit alias
    groups. No substring/partial matching, so unrelated values can
    never compare equal on whole-token comparison.
    """
    if actual in required:
        return True
    for group in alias_groups:
        if actual in group and required.intersection(group):
            return True
    return False


def _graduation_year_set(opp: Opportunity) -> set[int] | None:
    """Years allowed by allowed_graduation_years CSV (ints only).

    Used only as a fallback when BOTH min_graduation_year and
    max_graduation_year are absent. Unparseable tokens are ignored.
    """
    years: set[int] = set()
    for raw in str(getattr(opp, "allowed_graduation_years", None) or "").split(","):
        text = raw.strip()
        if text.isdigit():
            year = int(text)
            if 1990 <= year <= 2100:
                years.add(year)
    return years or None


def _check_cgpa(opp: Opportunity, profile) -> tuple[dict, str]:
    """CGPA check. Passes when no minimum is set on the opportunity."""
    min_cgpa = getattr(opp, "min_cgpa", None)
    actual = getattr(profile, "cgpa", None) if profile is not None else None
    try:
        actual_num = float(actual) if actual is not None else None
    except (TypeError, ValueError):
        actual_num = None
    if min_cgpa is None:
        return {"required": None, "actual": actual_num, "passed": True}, "CGPA: no minimum required"
    if actual_num is None:
        return (
            {"required": min_cgpa, "actual": None, "passed": False},
            f"CGPA: required minimum {min_cgpa}, but your profile has no CGPA",
        )
    passed = actual_num + 1e-9 >= float(min_cgpa)
    verb = "meets" if passed else "is below"
    return (
        {"required": min_cgpa, "actual": actual_num, "passed": passed},
        f"CGPA {actual_num} {verb} the minimum {min_cgpa}",
    )


def _check_csv_field(opp: Opportunity, profile, column: str, alias_groups, label: str) -> tuple[dict, str]:
    """Degree/branch check against a CSV eligibility column.

    Passes when the column is empty. Fails with an explicit reason when
    the requirement exists but the student value is missing or unequal
    (after harmless-format normalization + the narrow alias map).
    """
    required_tokens = _norm_token_set(getattr(opp, column, None))
    required_list = sorted(required_tokens)
    actual_raw = getattr(profile, label, None) if profile is not None else None
    actual = _norm_token(actual_raw)
    actual_clean = actual_raw.strip() if isinstance(actual_raw, str) else actual_raw
    name = label.replace("_", " ").title()
    if not required_tokens:
        return {"required": [], "actual": actual_clean, "passed": True}, f"{name}: no {label} restriction"
    if not actual:
        return (
            {"required": required_list, "actual": None, "passed": False},
            f"{name}: restricted to {required_list}, but your profile has no {label}",
        )
    passed = _token_matches(actual, required_tokens, alias_groups)
    verb = "satisfies" if passed else "does not satisfy"
    return (
        {"required": required_list, "actual": actual_clean, "passed": passed},
        f"{name} '{actual_clean}' {verb} the requirement {required_list}",
    )


def _check_graduation_year(opp: Opportunity, profile) -> tuple[dict, str]:
    """Graduation-year window check (min/max, each side optional).

    When both are absent, the allowed_graduation_years CSV is used as
    the allowed set. Absent entirely -> passes. A present rule with a
    missing student year -> fails with an explicit reason.
    """
    min_year = getattr(opp, "min_graduation_year", None)
    max_year = getattr(opp, "max_graduation_year", None)
    actual = getattr(profile, "graduation_year", None) if profile is not None else None
    try:
        actual_num = int(actual) if actual is not None else None
    except (TypeError, ValueError):
        actual_num = None
    allowed: list[int] | None = None
    if min_year is None and max_year is None:
        parsed = _graduation_year_set(opp)
        if parsed:
            allowed = sorted(parsed)
    if min_year is None and max_year is None and allowed is None:
        return (
            {"required": None, "actual": actual_num, "passed": True},
            "Graduation year: no graduation-year restriction",
        )
    if actual_num is None:
        if allowed is not None:
            return (
                {"required": allowed, "actual": None, "passed": False},
                "Graduation year: allowed "
                f"{allowed}, but your profile has no graduation year",
            )
        window = f"{min_year if min_year is not None else 'any'}..{max_year if max_year is not None else 'any'}"
        return (
            {"required": {"min": min_year, "max": max_year}, "actual": None, "passed": False},
            f"Graduation year: must be in {window}, but your profile has no graduation year",
        )
    if allowed is not None:
        passed = actual_num in allowed
        verb = "is allowed" if passed else "is not in the allowed list"
        return (
            {"required": allowed, "actual": actual_num, "passed": passed},
            f"Graduation year {actual_num} {verb} {allowed}",
        )
    low = f"{min_year}" if min_year is not None else "any"
    high = f"{max_year}" if max_year is not None else "any"
    passed = True
    if min_year is not None and actual_num < min_year:
        passed = False
    if max_year is not None and actual_num > max_year:
        passed = False
    verb = "is within" if passed else "is outside"
    return (
        {"required": {"min": min_year, "max": max_year}, "actual": actual_num, "passed": passed},
        f"Graduation year {actual_num} {verb} the required window {low}..{high}",
    )


def _skill_status(student_num: int, required_num: int) -> str:
    """Skill-level status vocabulary shared with Stage 5: matched/partial/missing."""
    if student_num <= 0:
        return "missing"
    if student_num >= required_num:
        return "matched"
    return "partial"


def _evaluate_skill_links(links, student_levels: dict, student_detail: dict) -> dict:
    """Skill match over opportunity links.

    A missing-or-partial REQUIRED link makes the student ineligible;
    PREFERRED links only move match_percentage. Evidence labels are
    display-only and never inflate the score.
    """
    matched_skills: list[dict] = []
    partial_skills: list[dict] = []
    missing_skills: list[dict] = []
    required_total = 0
    preferred_total = 0
    required_satisfied = 0
    total_weight = 0.0
    earned = 0.0
    reasons: list[str] = []
    for link in links or []:
        skill = getattr(link, "skill", None)
        skill_name = skill.name if skill is not None else None
        skill_type = str(getattr(link, "skill_type", None) or "required").strip().lower()
        if skill_type not in SKILL_TYPES:
            skill_type = "required"
        required_level = normalize_level(getattr(link, "required_level", None))
        importance = str(getattr(link, "importance", None) or "medium").strip().lower()
        if importance not in IMPORTANCE_LEVELS:
            importance = "medium"
        required_num = max(level_to_num(required_level), 1)
        student_num = int(student_levels.get(link.skill_id, 0) or 0)
        status = _skill_status(student_num, required_num)
        # Match formula: importance-weighted fractional credit over ALL
        # (required + preferred) links. Missing/partial preferred links
        # therefore lower the percentage without touching eligibility.
        # Deterministic: same inputs always give the same value to
        # 1 decimal place.
        weight = importance_weight(importance)
        total_weight += weight
        if student_num > 0:
            earned += weight * (min(student_num, required_num) / required_num)
        ev = student_detail.get(link.skill_id) or {}
        display = skill_name if skill_name is not None else f"skill {link.skill_id}"
        if skill_type == "required":
            required_total += 1
        else:
            preferred_total += 1
        if status == "matched":
            if skill_type == "required":
                required_satisfied += 1
            matched_skills.append(
                {
                    "skill_id": link.skill_id,
                    "skill_name": skill_name,
                    "required_level": required_level,
                    "student_level": ev.get("level"),
                    "importance": importance,
                    "skill_type": skill_type,
                    "is_verified": bool(ev.get("is_verified", False)),
                    "evidence_label": ev.get("evidence_label", "Self-reported"),
                }
            )
            have = ev.get("level") or "level"
            reasons.append(f"Skill '{display}' matched (your {have} >= required {required_level})")
        elif status == "partial":
            partial_skills.append(
                {
                    "skill_id": link.skill_id,
                    "skill_name": skill_name,
                    "required_level": required_level,
                    "student_level": ev.get("level"),
                    "gap_levels": max(required_num - student_num, 1),
                    "importance": importance,
                    "skill_type": skill_type,
                }
            )
            have = ev.get("level") or "level"
            if skill_type == "required":
                reasons.append(
                    f"Required skill '{display}' is below the required level "
                    f"(your {have} < {required_level})"
                )
            else:
                reasons.append(
                    f"Preferred skill '{display}' is below the preferred level "
                    f"(your {have} < {required_level})"
                )
        else:
            missing_skills.append(
                {
                    "skill_id": link.skill_id,
                    "skill_name": skill_name,
                    "required_level": required_level,
                    "importance": importance,
                    "skill_type": skill_type,
                    "status": status,
                }
            )
            if skill_type == "required":
                reasons.append(f"Missing required skill '{display}'")
            else:
                reasons.append(f"Missing preferred skill '{display}'")
    if total_weight > 0:
        match_percentage = round(earned / total_weight * 100, 1)
    else:
        match_percentage = 0.0
    return {
        "matched_skills": matched_skills,
        "partial_skills": partial_skills,
        "missing_skills": missing_skills,
        "skill_reasons": reasons,
        "counts": {
            "required": required_total,
            "preferred": preferred_total,
            "total": required_total + preferred_total,
            "matched": len(matched_skills),
            "partial": len(partial_skills),
            "missing": len(missing_skills),
            "required_satisfied": required_satisfied,
        },
        "match_percentage": match_percentage,
    }


def evaluate_opportunity_eligibility(
    student,
    student_profile,
    student_levels: dict,
    opportunity: Opportunity,
    opportunity_skills: list,
    student_skill_detail: dict | None = None,
) -> dict:
    """Server-side eligibility + skill match for one opportunity.

    Pure function (no DB access): the caller batch-loads the profile,
    the student's canonical skill levels, and the opportunity's skill
    links. Never raises on incomplete student data - missing profile
    fields make only the corresponding check fail, with an explicit
    reason, while unrelated checks still pass.
    """
    detail = student_skill_detail or {}
    levels = student_levels or {}
    reasons: list[str] = []
    cgpa_block, cgpa_reason = _check_cgpa(opportunity, student_profile)
    reasons.append(cgpa_reason)
    degree_block, degree_reason = _check_csv_field(
        opportunity, student_profile, "eligible_degree", DEGREE_ALIAS_GROUPS, "degree"
    )
    reasons.append(degree_reason)
    branch_block, branch_reason = _check_csv_field(
        opportunity, student_profile, "eligible_branch", BRANCH_ALIAS_GROUPS, "branch"
    )
    reasons.append(branch_reason)
    year_block, year_reason = _check_graduation_year(opportunity, student_profile)
    reasons.append(year_reason)
    skills = _evaluate_skill_links(opportunity_skills, levels, detail)
    reasons.extend(skills["skill_reasons"])
    eligible = bool(
        cgpa_block["passed"]
        and degree_block["passed"]
        and branch_block["passed"]
        and year_block["passed"]
        and skills["counts"]["required_satisfied"] == skills["counts"]["required"]
    )
    return {
        "eligible": eligible,
        "eligibility": {
            "cgpa": cgpa_block,
            "degree": degree_block,
            "branch": branch_block,
            "graduation_year": year_block,
        },
        "eligibility_reasons": reasons,
        "skills": skills["counts"],
        "matched_skills": skills["matched_skills"],
        "partial_skills": skills["partial_skills"],
        "missing_skills": skills["missing_skills"],
        "match_percentage": skills["match_percentage"],
    }


def _require_student(cu):
    if (getattr(cu, "role", None) or "").strip().lower() != "student":
        raise HTTPException(
            status_code=403,
            detail="Only student accounts can use personalized opportunity discovery",
        )
    return cu


def _load_student_skill_context(db: Session, user_id: int) -> tuple[dict, dict]:
    """Batch-load canonical student skill levels + evidence labels.

    Same user_skills / skill_evidence sources Stage 5/6 use; highest
    level wins on duplicates. Evidence labels are display-only.
    """
    levels: dict[int, int] = {}
    detail: dict[int, dict] = {}
    rows = db.query(UserSkill).filter(UserSkill.user_id == user_id).all()
    backed: set[int] = set()
    if rows:
        from models import SkillEvidence as _SkillEvidence

        for ev in db.query(_SkillEvidence).filter(_SkillEvidence.user_id == user_id).all():
            if str(getattr(ev, "confidence", "") or "").lower() == "verified":
                backed.add(ev.skill_id)
            elif getattr(ev, "source_type", None):
                backed.add(ev.skill_id)
    for row in rows:
        num = level_to_num(row.level)
        if row.skill_id not in levels or num > levels[row.skill_id]:
            levels[row.skill_id] = num
            skill = getattr(row, "skill", None)
            if bool(row.is_verified):
                label = "Verified"
            elif bool(row.verified_by) or row.skill_id in backed:
                label = "Evidence-backed"
            else:
                label = "Self-reported"
            detail[row.skill_id] = {
                "skill_name": skill.name if skill is not None else None,
                "level": normalize_level(row.level),
                "level_num": num,
                "is_verified": bool(row.is_verified),
                "evidence_label": label,
            }
    return levels, detail


def _student_profile_snapshot(profile, skill_count: int) -> dict:
    """Safe, non-sensitive snapshot of the fields used for eligibility."""
    if profile is None:
        return {
            "has_student_profile": False,
            "cgpa": None,
            "degree": None,
            "branch": None,
            "graduation_year": None,
            "target_job_role": None,
            "preferred_industry": None,
            "skill_count": int(skill_count or 0),
            "has_skills": bool(skill_count),
        }
    return {
        "has_student_profile": True,
        "cgpa": getattr(profile, "cgpa", None),
        "degree": getattr(profile, "degree", None),
        "branch": getattr(profile, "branch", None),
        "graduation_year": getattr(profile, "graduation_year", None),
        "target_job_role": getattr(profile, "target_job_role", None),
        "preferred_industry": getattr(profile, "preferred_industry", None),
        "skill_count": int(skill_count or 0),
        "has_skills": bool(skill_count),
    }


def _serialize_recommended(opp: Opportunity, evaluation: dict) -> dict:
    """Public summary fields + personalization (no recruiter-private data)."""
    payload = _serialize_summary(opp)
    payload.update(
        {
            "match_percentage": evaluation["match_percentage"],
            "eligible": evaluation["eligible"],
            "eligibility": evaluation["eligibility"],
            "eligibility_reasons": evaluation["eligibility_reasons"],
            "matched_skills": evaluation["matched_skills"],
            "partial_skills": evaluation["partial_skills"],
            "missing_skills": evaluation["missing_skills"],
            "skill_match": evaluation["skills"],
        }
    )
    return payload


def _recommendation_sort_key(item: tuple) -> tuple:
    """Deterministic ordering: eligible first, then higher match,
    then earlier deadline (NULL deadlines last), then stable id."""
    opp, evaluation = item
    deadline = getattr(opp, "deadline", None)
    if deadline is not None and getattr(deadline, "tzinfo", None) is None:
        deadline = deadline.replace(tzinfo=timezone.utc)
    return (
        0 if evaluation["eligible"] else 1,
        -(evaluation["match_percentage"] or 0.0),
        0 if deadline is not None else 1,
        _as_utc(deadline) if deadline is not None else _utcnow().replace(year=9999),
        opp.id,
    )


def _apply_discovery_filters(
    q,
    opportunity_type: str = "",
    work_mode: str = "",
    search: str = "",
    company: str = "",
    location: str = "",
):
    """Shared published-discovery filters.

    Keeps /api/opportunities and /me/recommended consistent. Type and
    work_mode validation errors behave exactly like the existing list.
    """
    otype = str(opportunity_type or "").strip().lower()
    if otype and otype not in OPPORTUNITY_TYPES:
        raise HTTPException(status_code=422, detail="Invalid opportunity_type")
    wmode = str(work_mode or "").strip().lower()
    if wmode and wmode not in WORK_MODES:
        raise HTTPException(status_code=422, detail="Invalid work_mode")
    if otype:
        q = q.filter(Opportunity.opportunity_type == otype)
    if wmode:
        q = q.filter(Opportunity.work_mode == wmode)
    if company and company.strip():
        q = q.filter(Opportunity.company_name.ilike(f"%{company.strip()}%"))
    if location and location.strip():
        q = q.filter(Opportunity.location.ilike(f"%{location.strip()}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Opportunity.title.ilike(term),
                Opportunity.description.ilike(term),
                Opportunity.location.ilike(term),
            )
        )
    return q


def _iso(value) -> str | None:
    return value.isoformat() if value is not None else None


# ================================================================
# STAGE 2.5A - STUDENT APPLICATION BACKEND.
#
# The Application model (Stage 2.2A) is authoritative and is not
# duplicated here. UNIQUE(opportunity_id, student_user_id) is the
# duplicate guard: a pre-check gives a friendly 409, and a concurrent
# INSERT race falls through to IntegrityError -> rollback -> 409, so
# two rapid requests can never create two rows. The eligibility
# result is ALWAYS recalculated from current database state inside
# the apply transaction (a recommended-list result is never trusted).
# ================================================================


class ApplicationCreateIn(BaseModel):
    """Student apply payload. cover_note is the ONLY student-settable
    field; anything else (status, student_user_id, reviewed_by_user_id,
    recruiter_note, rejection_reason, ...) is rejected with 422."""

    model_config = ConfigDict(extra="forbid")

    cover_note: str | None = None

    @field_validator("cover_note")
    @classmethod
    def _cover_note(cls, v):
        if v is None:
            return None
        text = str(v).strip()
        if not text:
            return None
        if len(text) > COVER_NOTE_MAX:
            raise ValueError(
                f"cover_note must be at most {COVER_NOTE_MAX} characters"
            )
        return text


def _require_applicable_opportunity(db: Session, opportunity_id: int) -> Opportunity:
    """Load one opportunity and enforce the student apply preconditions.

    404 unknown · 409 draft/closed/archived · 409 deadline passed.
    The deadline uses the server clock only; a client timestamp is
    never consulted.
    """
    opp = db.get(Opportunity, opportunity_id)
    if opp is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if opp.status != LISTABLE_STATUS:
        if opp.status == "draft":
            raise HTTPException(
                status_code=409,
                detail="Applications are only accepted on published opportunities",
            )
        raise HTTPException(
            status_code=409,
            detail="This opportunity is closed and no longer accepts applications",
        )
    if opp.deadline is not None and _as_utc(opp.deadline) < _utcnow():
        raise HTTPException(
            status_code=409, detail="Application deadline has passed"
        )
    return opp


def _application_snapshot(
    student,
    profile,
    evaluation: dict,
    opp: Opportunity,
    now: datetime,
) -> str:
    """Frozen JSON record of what the student applied to, and with what
    profile/skills/eligibility, at apply time. Historical data only -
    never regenerated on profile/opportunity changes and never used as
    the source of current eligibility. Contains no secrets."""
    return json.dumps(
        {
            "snapshot_version": 1,
            "captured_at": _iso(now),
            "opportunity": {
                "opportunity_id": opp.id,
                "title": opp.title,
                "slug": opp.slug,
                "company_name": opp.company_name,
                "opportunity_type": opp.opportunity_type,
                "work_mode": opp.work_mode,
                "location": opp.location,
                "deadline": _iso(opp.deadline),
                "openings": opp.openings,
                "min_cgpa": opp.min_cgpa,
                "eligible_degree": opp.eligible_degree,
                "eligible_branch": opp.eligible_branch,
                "min_graduation_year": opp.min_graduation_year,
                "max_graduation_year": opp.max_graduation_year,
            },
            "student": {
                "student_user_id": student.id,
                "name": getattr(student, "name", None),
                "degree": getattr(profile, "degree", None) if profile else None,
                "branch": getattr(profile, "branch", None) if profile else None,
                "graduation_year": (
                    getattr(profile, "graduation_year", None) if profile else None
                ),
                "cgpa": getattr(profile, "cgpa", None) if profile else None,
                "target_job_role": (
                    getattr(profile, "target_job_role", None) if profile else None
                ),
                "preferred_industry": (
                    getattr(profile, "preferred_industry", None) if profile else None
                ),
                "skill_count": (
                    len(evaluation.get("matched_skills") or [])
                    + len(evaluation.get("partial_skills") or [])
                ),
            },
            "eligibility": {
                "eligible": evaluation.get("eligible"),
                "checks": evaluation.get("eligibility"),
                "match_percentage": evaluation.get("match_percentage"),
                "matched_skills": evaluation.get("matched_skills"),
                "partial_skills": evaluation.get("partial_skills"),
                "missing_skills": evaluation.get("missing_skills"),
                "eligibility_reasons": evaluation.get("eligibility_reasons"),
            },
            "disclaimer": MATCH_DISCLAIMER,
        }
    )


def _serialize_application(app_row: Application, opp: Opportunity | None = None) -> dict:
    """Clean public serialization of one application. Never exposes
    password_hash, tokens, other users' data or database internals."""
    if opp is None:
        opp = getattr(app_row, "opportunity", None)
    snapshot_raw = app_row.snapshot_json
    snapshot = None
    if snapshot_raw:
        try:
            snapshot = json.loads(snapshot_raw)
        except (TypeError, ValueError):
            snapshot = None
    return {
        "id": app_row.id,
        "opportunity_id": app_row.opportunity_id,
        "opportunity_title": opp.title if opp is not None else None,
        "company_name": opp.company_name if opp is not None else None,
        "status": app_row.status,
        "cover_note": app_row.cover_note,
        "snapshot": snapshot,
        "applied_at": _iso(app_row.applied_at),
        "updated_at": _iso(app_row.updated_at),
        "status_changed_at": _iso(app_row.status_changed_at),
    }


class ApplicationStatusIn(BaseModel):
    """Stage 2.5B recruiter status-update payload.

    Only `status` (+ optional recruiter notes) is accepted. Owner,
    reviewer, student, opportunity and timestamp ids are forbidden as
    extras (-> 422) because they are resolved server-side.
    """

    model_config = ConfigDict(extra="forbid")

    status: str
    recruiter_note: str | None = None
    rejection_reason: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        text = str(v or "").strip().lower()
        if text not in APPLICATION_STATUSES:
            raise ValueError("Invalid application status")
        return text

    @field_validator("recruiter_note")
    @classmethod
    def _note(cls, v):
        if v is None:
            return None
        text = str(v).strip()
        if not text:
            return None
        if len(text) > RECRUITER_NOTE_MAX:
            raise ValueError(
                f"recruiter_note must be at most {RECRUITER_NOTE_MAX} characters"
            )
        return text

    @field_validator("rejection_reason")
    @classmethod
    def _reason(cls, v):
        if v is None:
            return None
        text = str(v).strip()
        if not text:
            return None
        if len(text) > REJECTION_REASON_MAX:
            raise ValueError(
                f"rejection_reason must be at most {REJECTION_REASON_MAX} characters"
            )
        return text

    @model_validator(mode="after")
    def _rejection_requires_reason(self):
        # A rejection must always carry an explicit reason; the reason
        # is contractually required (not just stored when supplied).
        if self.status == "rejected" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when moving to rejected")
        return self


def _csv_list(value) -> list:
    """Split a CSV text column into a clean list (mirrors main._split_csv)."""
    if not value:
        return []
    return [part.strip() for part in str(value).split(",") if part.strip()]


def _allowed_targets(current_status) -> tuple:
    """Central Stage 2.5B transition lookup (fail-closed).

    Anything outside APPLICATION_STATUS_TRANSITIONS - including the
    legacy "under_review" label, which no code path can produce -
    resolves to no legal targets (terminal), so an unexpected stored
    value can never be revived into the workflow.
    """
    return APPLICATION_STATUS_TRANSITIONS.get(current_status or "", ())


def _notify_application_status(db: Session, app_row: Application, opp) -> None:
    """Create the student notification for a committed status change.

    Called ONLY after the guarded status UPDATE committed successfully, so
    a failed (401/403/404/409/422/500) transition can never produce a
    false notification. The recipient is the application owner resolved
    server-side (``app_row.student_user_id``) - never the recruiter, never
    a client-supplied id. A retried request hits the 409 same-status guard
    before reaching here, so no duplicate notification is created.

    The write reuses the existing stage8_service.notify() writer on the
    single shared ``notifications`` table. A notification failure is
    isolated (its own rollback) and can never fail - or rewrite - the
    already-committed status change.
    """
    copy = APPLICATION_STATUS_NOTIFICATIONS.get(app_row.status)
    if copy is None:
        return
    title_tpl, message_tpl = copy
    opp_title = (
        (getattr(opp, "title", None) or "").strip()
        or "an opportunity"
    )
    try:
        from stage8_service import notify as _notify

        _notify(
            db,
            int(app_row.student_user_id),
            "application_status",
            title_tpl,
            message_tpl.format(title=opp_title),
            APPLICATION_STATUS_LINK,
        )
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass


def _serialize_applicant(app_row: Application, student, profile) -> dict:
    """Explicit recruiter-side view of one application + applicant.

    Served ONLY to the owning recruiter. Never emits password_hash,
    tokens, email, phone, or any private/unrelated account data. The
    frozen apply-time snapshot is parsed for display; it is never
    regenerated here.
    """
    snapshot_raw = app_row.snapshot_json
    snapshot = None
    if snapshot_raw:
        try:
            snapshot = json.loads(snapshot_raw)
        except (TypeError, ValueError):
            snapshot = None
    opp = getattr(app_row, "opportunity", None)
    profile_payload = None
    if profile is not None:
        profile_payload = {
            "college": getattr(profile, "college", None),
            "degree": getattr(profile, "degree", None),
            "branch": getattr(profile, "branch", None),
            "graduation_year": getattr(profile, "graduation_year", None),
            "cgpa": getattr(profile, "cgpa", None),
            "target_job_role": getattr(profile, "target_job_role", None),
            "preferred_industry": getattr(profile, "preferred_industry", None),
            "top_skills": _csv_list(getattr(profile, "top_skills", None)),
        }
    return {
        "application": {
            "id": app_row.id,
            "opportunity_id": app_row.opportunity_id,
            "status": app_row.status,
            "cover_note": app_row.cover_note,
            "applied_at": _iso(app_row.applied_at),
            "updated_at": _iso(app_row.updated_at),
            "status_changed_at": _iso(app_row.status_changed_at),
            "reviewed_by_user_id": app_row.reviewed_by_user_id,
            "recruiter_note": app_row.recruiter_note,
            "rejection_reason": app_row.rejection_reason,
            "snapshot": snapshot,
        },
        "opportunity": (
            {
                "id": opp.id,
                "title": opp.title,
                "slug": opp.slug,
                "company_name": opp.company_name,
                "opportunity_type": opp.opportunity_type,
                "work_mode": opp.work_mode,
                "location": opp.location,
                "status": opp.status,
                "deadline": _iso(opp.deadline),
            }
            if opp is not None
            else None
        ),
        "student": (
            {
                "user_id": student.id,
                "name": student.name,
                "public_id": getattr(student, "public_id", None),
                "avatar_url": getattr(student, "avatar_url", None),
                "profile": profile_payload,
            }
            if student is not None
            else None
        ),
    }

def _serialize_skill_link(link: OpportunitySkill) -> dict:
    skill = getattr(link, "skill", None)
    return {
        "skill_id": link.skill_id,
        "skill_name": skill.name if skill is not None else None,
        "category": skill.category if skill is not None else None,
        "required_level": link.required_level,
        "importance": link.importance,
        "skill_type": link.skill_type,
    }


def _summary_skill(link: OpportunitySkill) -> dict:
    skill = getattr(link, "skill", None)
    return {
        "skill_id": link.skill_id,
        "skill_name": skill.name if skill is not None else None,
    }


def _serialize_summary(opp: Opportunity) -> dict:
    links = list(getattr(opp, "skills", None) or [])
    return {
        "id": opp.id,
        "title": opp.title,
        "slug": opp.slug,
        "company_name": opp.company_name,
        "opportunity_type": opp.opportunity_type,
        "description": opp.description,
        "work_mode": opp.work_mode,
        "location": opp.location,
        "duration": opp.duration,
        "compensation": opp.compensation,
        "openings": opp.openings,
        "deadline": _iso(opp.deadline),
        "status": opp.status,
        "is_demo": bool(opp.is_demo),
        "created_at": _iso(opp.created_at),
        "updated_at": _iso(opp.updated_at),
        "published_at": _iso(opp.published_at),
        "closed_at": _iso(opp.closed_at),
        "skill_count": len(links),
        "skills": [_summary_skill(link) for link in links],
    }


def _serialize_detail(opp: Opportunity) -> dict:
    links = list(getattr(opp, "skills", None) or [])
    return {
        "id": opp.id,
        "title": opp.title,
        "slug": opp.slug,
        "company_name": opp.company_name,
        "opportunity_type": opp.opportunity_type,
        "description": opp.description,
        "responsibilities": opp.responsibilities,
        "eligibility_text": opp.eligibility_text,
        "work_mode": opp.work_mode,
        "location": opp.location,
        "duration": opp.duration,
        "compensation": opp.compensation,
        "openings": opp.openings,
        "deadline": _iso(opp.deadline),
        "start_date": _iso(opp.start_date),
        "status": opp.status,
        "min_cgpa": opp.min_cgpa,
        "allowed_graduation_years": opp.allowed_graduation_years,
        "min_graduation_year": opp.min_graduation_year,
        "max_graduation_year": opp.max_graduation_year,
        "eligible_degree": opp.eligible_degree,
        "eligible_branch": opp.eligible_branch,
        "is_demo": bool(opp.is_demo),
        "created_at": _iso(opp.created_at),
        "updated_at": _iso(opp.updated_at),
        "published_at": _iso(opp.published_at),
        "closed_at": _iso(opp.closed_at),
        "skills": [_serialize_skill_link(link) for link in links],
    }


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _validate_publishable(db: Session, opp: Opportunity) -> None:
    if not (opp.title or "").strip():
        raise HTTPException(status_code=409, detail="Title is required before publishing")
    if not (opp.description or "").strip():
        raise HTTPException(status_code=409, detail="Description is required before publishing")
    if (opp.opportunity_type or "") not in OPPORTUNITY_TYPES:
        raise HTTPException(status_code=409, detail="A valid opportunity_type is required")
    if opp.work_mode and opp.work_mode not in WORK_MODES:
        raise HTTPException(status_code=409, detail="A valid work_mode is required")
    if opp.openings is not None and opp.openings <= 0:
        raise HTTPException(status_code=409, detail="Openings must be positive")
    owner = db.get(User, opp.owner_user_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Owner account no longer exists")
    profile = (
        db.query(RecruiterProfile)
        .filter(RecruiterProfile.user_id == opp.owner_user_id)
        .first()
    )
    if profile is None or not (profile.company_name or "").strip():
        raise HTTPException(
            status_code=409,
            detail="Recruiter company profile is required before publishing",
        )
    skill_count = (
        db.query(OpportunitySkill.id)
        .filter(OpportunitySkill.opportunity_id == opp.id)
        .count()
    )
    if skill_count < 1:
        raise HTTPException(
            status_code=409,
            detail="Add at least one required skill before publishing",
        )
    now = _utcnow()
    if opp.deadline is not None and _as_utc(opp.deadline) < now:
        raise HTTPException(
            status_code=409, detail="Deadline is already in the past"
        )
    if opp.start_date is not None and opp.created_at is not None:
        if _as_utc(opp.start_date) < _as_utc(opp.created_at):
            raise HTTPException(
                status_code=409,
                detail="start_date cannot be before created_at",
            )
    if opp.deadline is not None and opp.start_date is not None:
        if _as_utc(opp.deadline) < _as_utc(opp.start_date):
            raise HTTPException(
                status_code=409,
                detail="deadline cannot be before start_date",
            )


def register_opportunities(app, get_db, me_dep):

    @app.get("/api/opportunities")
    def list_opportunities(
        opportunity_type: str = "",
        work_mode: str = "",
        status: str = "",
        search: str = "",
        company: str = "",
        location: str = "",
        limit: int = 20,
        offset: int = 0,
        db: Session = Depends(get_db),
    ):
        wanted = str(status or "").strip().lower()
        if wanted and wanted != LISTABLE_STATUS:
            raise HTTPException(
                status_code=422,
                detail="Only published opportunities are listed publicly",
            )
        q = db.query(Opportunity).filter(Opportunity.status == LISTABLE_STATUS)
        q = _apply_discovery_filters(
            q,
            opportunity_type=opportunity_type,
            work_mode=work_mode,
            search=search,
            company=company,
            location=location,
        )
        total = q.count()
        limit = min(max(int(limit or 20), 1), 100)
        offset = max(int(offset or 0), 0)
        rows = (
            q.order_by(Opportunity.created_at.desc(), Opportunity.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return {
            "opportunities": [_serialize_summary(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(rows)) < total,
            "filters": {
                "opportunity_types": list(OPPORTUNITY_TYPES),
                "work_modes": list(WORK_MODES),
                "statuses": [LISTABLE_STATUS],
            },
        }

    @app.get("/api/opportunities/me/recommended")
    def recommended_opportunities(
        opportunity_type: str = "",
        work_mode: str = "",
        search: str = "",
        company: str = "",
        location: str = "",
        limit: int = 20,
        offset: int = 0,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Stage 2.4: personalized discovery for the JWT student.

        Never an eligibility-filtered blocklist: every published
        opportunity matching the discovery filters is scored and
        explained; general discovery stays broad.
        """
        _require_student(cu)
        profile = (
            db.query(StudentProfile)
            .filter(StudentProfile.user_id == cu.id)
            .first()
        )
        levels, skill_detail = _load_student_skill_context(db, cu.id)
        q = db.query(Opportunity).filter(Opportunity.status == LISTABLE_STATUS)
        q = _apply_discovery_filters(
            q,
            opportunity_type=opportunity_type,
            work_mode=work_mode,
            search=search,
            company=company,
            location=location,
        )
        total = q.count()
        limit = min(max(int(limit or 20), 1), 100)
        offset = max(int(offset or 0), 0)
        rows = (
            q.options(selectinload(Opportunity.skills))
            .order_by(Opportunity.deadline.asc(), Opportunity.id.asc())
            .offset(0)
            .limit(RECOMMENDATION_SCAN_LIMIT)
            .all()
        )
        scored = [
            (
                opp,
                evaluate_opportunity_eligibility(
                    cu,
                    profile,
                    levels,
                    opp,
                    list(getattr(opp, "skills", None) or []),
                    skill_detail,
                ),
            )
            for opp in rows
        ]
        scored.sort(key=_recommendation_sort_key)
        page = scored[offset : offset + limit]
        return {
            "opportunities": [_serialize_recommended(opp, ev) for opp, ev in page],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(page)) < total,
            "profile": _student_profile_snapshot(profile, len(levels)),
            "sorting": ["eligible", "match_percentage", "deadline", "id"],
            "disclaimer": MATCH_DISCLAIMER,
            "filters": {
                "opportunity_types": list(OPPORTUNITY_TYPES),
                "work_modes": list(WORK_MODES),
                "statuses": [LISTABLE_STATUS],
            },
        }

    @app.get("/api/opportunities/mine")
    def my_opportunities(
        limit: int = 20,
        offset: int = 0,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        q = db.query(Opportunity).filter(Opportunity.owner_user_id == cu.id)
        total = q.count()
        limit = min(max(int(limit or 20), 1), 100)
        offset = max(int(offset or 0), 0)
        rows = (
            q.order_by(Opportunity.updated_at.desc(), Opportunity.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return {
            "opportunities": [_serialize_summary(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(rows)) < total,
        }

    @app.get("/api/opportunities/{opportunity_id}")
    def get_opportunity(
        opportunity_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        opp = db.get(Opportunity, opportunity_id)
        if opp is None:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        if opp.status != LISTABLE_STATUS and opp.owner_user_id != cu.id:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        payload = {"opportunity": _serialize_detail(opp)}
        # Stage 2.4 (additive): authenticated students also see their own
        # fit for a published opportunity. Never exposed to recruiters
        # or admins, and never changes the existing contract otherwise.
        if (
            (getattr(cu, "role", None) or "").strip().lower() == "student"
            and opp.status == LISTABLE_STATUS
        ):
            profile = (
                db.query(StudentProfile)
                .filter(StudentProfile.user_id == cu.id)
                .first()
            )
            levels, skill_detail = _load_student_skill_context(db, cu.id)
            evaluation = evaluate_opportunity_eligibility(
                cu,
                profile,
                levels,
                opp,
                list(getattr(opp, "skills", None) or []),
                skill_detail,
            )
            payload["my_eligibility"] = evaluation["eligibility"]
            payload["my_eligible"] = evaluation["eligible"]
            payload["my_match"] = {
                "match_percentage": evaluation["match_percentage"],
                "skills": evaluation["skills"],
            }
            payload["my_matched_skills"] = evaluation["matched_skills"]
            payload["my_missing_skills"] = evaluation["missing_skills"]
            payload["my_partial_skills"] = evaluation["partial_skills"]
            payload["my_eligibility_reasons"] = evaluation["eligibility_reasons"]
        return payload


    @app.post("/api/opportunities", status_code=201)
    def create_opportunity(
        data: OpportunityCreateIn,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        profile = (
            db.query(RecruiterProfile)
            .filter(RecruiterProfile.user_id == cu.id)
            .first()
        )
        if profile is None:
            raise HTTPException(
                status_code=403,
                detail="Complete your company/recruiter profile before posting",
            )
        company_name = (profile.company_name or "").strip() or None
        try:
            opp = Opportunity(
                owner_user_id=cu.id,
                company_name=company_name,
                company_profile_snapshot=_company_snapshot(profile),
                title=data.title,
                slug=_unique_slug(db, data.title),
                opportunity_type=data.opportunity_type or "internship",
                description=data.description,
                responsibilities=data.responsibilities,
                eligibility_text=data.eligibility_text,
                work_mode=data.work_mode,
                location=data.location,
                duration=data.duration,
                compensation=data.compensation,
                openings=data.openings,
                deadline=data.deadline,
                start_date=data.start_date,
                status="draft",
                min_cgpa=data.min_cgpa,
                allowed_graduation_years=data.allowed_graduation_years,
                min_graduation_year=data.min_graduation_year,
                max_graduation_year=data.max_graduation_year,
                eligible_degree=data.eligible_degree,
                eligible_branch=data.eligible_branch,
                is_demo=False,
            )
            db.add(opp)
            db.flush()
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="Could not allocate a unique slug, please retry",
            )
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not create opportunity"
            )
        db.refresh(opp)
        return {"opportunity": _serialize_detail(opp)}

    @app.patch("/api/opportunities/{opportunity_id}")
    def update_opportunity(
        opportunity_id: int,
        data: OpportunityUpdateIn,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        opp = _get_owned_opportunity(db, opportunity_id, cu)
        patch = data.model_dump(exclude_unset=True)
        try:
            for field, value in patch.items():
                setattr(opp, field, value)
            db.flush()
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not update opportunity"
            )
        db.refresh(opp)
        return {"opportunity": _serialize_detail(opp)}

    @app.delete("/api/opportunities/{opportunity_id}")
    def delete_opportunity(
        opportunity_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        opp = _get_owned_opportunity(db, opportunity_id, cu)
        if opp.status != "draft":
            raise HTTPException(
                status_code=409,
                detail="Only draft opportunities can be deleted",
            )
        try:
            db.delete(opp)
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not delete opportunity"
            )
        return {"message": "Opportunity deleted"}


    @app.put("/api/opportunities/{opportunity_id}/skills")
    def replace_opportunity_skills(
        opportunity_id: int,
        data: OpportunitySkillsIn,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        opp = _get_owned_opportunity(db, opportunity_id, cu)
        items = list(data.skills or [])
        seen: set[int] = set()
        for item in items:
            if item.skill_id in seen:
                raise HTTPException(
                    status_code=409,
                    detail=f"Duplicate skill_id in request: {item.skill_id}",
                )
            seen.add(item.skill_id)
        # Validate every skill BEFORE mutating anything, so an invalid id
        # leaves the existing links untouched (spec: 404 + no partial write).
        resolved: dict[int, Skill] = {}
        for item in items:
            skill = db.get(Skill, item.skill_id)
            if skill is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Skill not found: {item.skill_id}",
                )
            resolved[item.skill_id] = skill
        try:
            db.query(OpportunitySkill).filter(
                OpportunitySkill.opportunity_id == opp.id
            ).delete(synchronize_session=False)
            for item in items:
                db.add(
                    OpportunitySkill(
                        opportunity_id=opp.id,
                        skill_id=item.skill_id,
                        required_level=item.required_level or "intermediate",
                        importance=item.importance or "medium",
                        skill_type=item.skill_type or "required",
                    )
                )
            db.flush()
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409, detail="Duplicate skill for this opportunity"
            )
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not update opportunity skills"
            )
        db.refresh(opp)
        links = (
            db.query(OpportunitySkill)
            .filter(OpportunitySkill.opportunity_id == opp.id)
            .order_by(OpportunitySkill.id)
            .all()
        )
        return {
            "opportunity_id": opp.id,
            "skills": [_serialize_skill_link(link) for link in links],
        }

    @app.post("/api/opportunities/{opportunity_id}/publish")
    def publish_opportunity(
        opportunity_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        opp = _get_owned_opportunity(db, opportunity_id, cu)
        if opp.status == "published":
            raise HTTPException(
                status_code=409, detail="Opportunity is already published"
            )
        if opp.status != "draft":
            raise HTTPException(
                status_code=409,
                detail="Only draft opportunities can be published",
            )
        _validate_publishable(db, opp)
        try:
            opp.status = "published"
            opp.published_at = _utcnow()
            opp.closed_at = None
            db.flush()
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not publish opportunity"
            )
        db.refresh(opp)
        return {"opportunity": _serialize_detail(opp)}

    @app.post("/api/opportunities/{opportunity_id}/close")
    def close_opportunity(
        opportunity_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        _require_recruiter(cu)
        opp = _get_owned_opportunity(db, opportunity_id, cu)
        if opp.status == "closed":
            raise HTTPException(
                status_code=409, detail="Opportunity is already closed"
            )
        if opp.status != "published":
            raise HTTPException(
                status_code=409,
                detail="Only published opportunities can be closed",
            )
        try:
            opp.status = "closed"
            opp.closed_at = _utcnow()
            db.flush()
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not close opportunity"
            )
        db.refresh(opp)
        return {"opportunity": _serialize_detail(opp)}

    @app.post("/api/opportunities/{opportunity_id}/archive")
    def archive_opportunity(
        opportunity_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Owner-scoped archival - the terminal lifecycle state (Stage 9.2).

        DRAFT -> PUBLISHED -> CLOSED is the hiring flow; hard DELETE stays
        draft-only because deleting a published/closed row would CASCADE
        away its applications. Archiving takes a PUBLISHED or CLOSED
        opportunity out of circulation (it can no longer receive
        applications) while every application row stays intact and
        readable by its owner. Archived is terminal: no un-archive, no
        delete, no re-publish.
        """
        _require_recruiter(cu)
        opp = _get_owned_opportunity(db, opportunity_id, cu)
        if opp.status == ARCHIVED_STATUS:
            raise HTTPException(
                status_code=409, detail="Opportunity is already archived"
            )
        if opp.status not in ARCHIVABLE_STATUSES:
            raise HTTPException(
                status_code=409,
                detail="Only published or closed opportunities can be archived",
            )
        try:
            opp.status = ARCHIVED_STATUS
            db.flush()
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not archive opportunity"
            )
        db.refresh(opp)
        return {"opportunity": _serialize_detail(opp)}

    # ==============================================================
    # STAGE 2.5A - STUDENT APPLICATION WORKFLOW.
    # ==============================================================

    @app.post("/api/opportunities/{opportunity_id}/apply", status_code=201)
    def apply_to_opportunity(
        opportunity_id: int,
        data: ApplicationCreateIn | None = None,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Student applies to one published opportunity.

        Identity is the JWT user only; eligibility is recalculated from
        current database state inside this transaction; the DB unique
        constraint is the duplicate/race authority (IntegrityError ->
        rollback -> 409).
        """
        _require_student(cu)
        # 1) opportunity existence + status + deadline (server clock)
        opp = _require_applicable_opportunity(db, opportunity_id)
        # 2) current student context, batch-loaded (no N+1)
        profile = (
            db.query(StudentProfile)
            .filter(StudentProfile.user_id == cu.id)
            .first()
        )
        levels, skill_detail = _load_student_skill_context(db, cu.id)
        links = (
            db.query(OpportunitySkill)
            .filter(OpportunitySkill.opportunity_id == opp.id)
            .all()
        )
        # 3) eligibility RE-CALCULATED at application time
        evaluation = evaluate_opportunity_eligibility(
            cu, profile, levels, opp, links, skill_detail
        )
        if not evaluation["eligible"]:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "not_eligible",
                    "message": "You are not eligible for this opportunity",
                    "eligible": False,
                    "match_percentage": evaluation["match_percentage"],
                    "missing_skills": evaluation["missing_skills"],
                    "eligibility": evaluation["eligibility"],
                    "eligibility_reasons": evaluation["eligibility_reasons"],
                    "disclaimer": MATCH_DISCLAIMER,
                },
            )
        # 4) friendly duplicate pre-check (withdrawn cannot be reused)
        existing = (
            db.query(Application)
            .filter(
                Application.opportunity_id == opp.id,
                Application.student_user_id == cu.id,
            )
            .first()
        )
        if existing is not None:
            if existing.status == WITHDRAWN_STATUS:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "You already applied to this opportunity and later "
                        "withdrew; reapplying is not supported"
                    ),
                )
            raise HTTPException(
                status_code=409,
                detail="You have already applied to this opportunity",
            )
        # 5) create the application atomically
        now = _utcnow()
        cover_note = data.cover_note if data is not None else None
        app_row = Application(
            opportunity_id=opp.id,
            student_user_id=cu.id,
            status=APPLIED_STATUS,
            cover_note=cover_note,
            snapshot_json=_application_snapshot(cu, profile, evaluation, opp, now),
            applied_at=now,
            updated_at=now,
            status_changed_at=now,
            reviewed_by_user_id=None,
            recruiter_note=None,
            rejection_reason=None,
        )
        try:
            db.add(app_row)
            db.flush()
            # 6) the DB constraint is the race authority
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="You have already applied to this opportunity",
            )
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not submit application"
            )
        db.commit()
        db.refresh(app_row)
        return {"application": _serialize_application(app_row, opp)}

    @app.get("/api/applications/me")
    def my_applications(
        status: str = "",
        limit: int = 20,
        offset: int = 0,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """The JWT student's own applications. Identity is never taken
        from query/body parameters, so another student's applications
        can never be listed through this endpoint."""
        _require_student(cu)
        wanted = str(status or "").strip().lower()
        if wanted and wanted not in APPLICATION_FILTER_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid status filter")
        q = db.query(Application).filter(Application.student_user_id == cu.id)
        if wanted:
            q = q.filter(Application.status == wanted)
        total = q.count()
        limit = min(max(int(limit or 20), 1), 100)
        offset = max(int(offset or 0), 0)
        rows = (
            q.options(selectinload(Application.opportunity))
            .order_by(Application.applied_at.desc(), Application.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        return {
            "applications": [_serialize_application(r) for r in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(rows)) < total,
        }

    @app.post("/api/applications/{application_id}/withdraw")
    def withdraw_application(
        application_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Withdraw one of the JWT student's own applications.

        Ownership follows this module's convention (403 "Only the owner
        can..."); only status == applied can be withdrawn; the row and
        its snapshot/cover_note/applied_at are never deleted.
        """
        _require_student(cu)
        app_row = db.get(Application, application_id)
        if app_row is None:
            raise HTTPException(status_code=404, detail="Application not found")
        if app_row.student_user_id != cu.id:
            raise HTTPException(
                status_code=403,
                detail="You can only withdraw your own application",
            )
        if app_row.status != APPLIED_STATUS:
            raise HTTPException(
                status_code=409,
                detail="Only applications in status 'applied' can be withdrawn",
            )
        now = _utcnow()
        try:
            app_row.status = WITHDRAWN_STATUS
            app_row.status_changed_at = now
            app_row.updated_at = now
            db.flush()
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not withdraw application"
            )
        db.refresh(app_row)
        return {"application": _serialize_application(app_row)}

    # ==============================================================
    # STAGE 2.5B - RECRUITER APPLICANT MANAGEMENT.
    # ==============================================================

    @app.get("/api/opportunities/{opportunity_id}/applications")
    def list_applicants(
        opportunity_id: int,
        status: str = "",
        search: str = "",
        limit: int = 20,
        offset: int = 0,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """The owning recruiter applicant list for one opportunity.

        Authorization is (1) recruiter role, (2) opportunity existence,
        (3) ``opportunity.owner_user_id == current_user.id``. Company
        names, email domains and client-supplied owner ids are never
        consulted, so a recruiter from the same company cannot manage
        another recruiter opportunity. The query is scoped to this
        opportunity only, so unrelated applications can never leak.
        """
        _require_recruiter(cu)
        opp = db.get(Opportunity, opportunity_id)
        if opp is None:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        if opp.owner_user_id != cu.id:
            raise HTTPException(
                status_code=403,
                detail="Only the owner can manage this opportunity",
            )
        wanted = str(status or "").strip().lower()
        if wanted and wanted not in APPLICATION_FILTER_STATUSES:
            raise HTTPException(status_code=422, detail="Invalid status filter")
        q = db.query(Application).filter(Application.opportunity_id == opp.id)
        if wanted:
            q = q.filter(Application.status == wanted)
        term = str(search or "").strip()
        if term:
            # Name / public-id search only: student email is neither
            # searchable nor returned, per existing API conventions.
            like = f"%{term}%"
            q = q.filter(
                or_(
                    Application.student.has(User.name.ilike(like)),
                    Application.student.has(User.public_id.ilike(like)),
                )
            )
        total = q.count()
        limit = min(max(int(limit or 20), 1), 100)
        offset = max(int(offset or 0), 0)
        rows = (
            q.options(selectinload(Application.opportunity))
            .order_by(Application.applied_at.desc(), Application.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        profiles = {}
        student_ids = [r.student_user_id for r in rows]
        if student_ids:
            for prof in (
                db.query(StudentProfile)
                .filter(StudentProfile.user_id.in_(student_ids))
                .all()
            ):
                profiles[prof.user_id] = prof
        return {
            "items": [
                _serialize_applicant(r, r.student, profiles.get(r.student_user_id))
                for r in rows
            ],
            "total": total,
            "limit": limit,
            "offset": offset,
            "has_more": (offset + len(rows)) < total,
        }

    @app.patch("/api/applications/{application_id}/status")
    def update_application_status(
        application_id: int,
        data: ApplicationStatusIn,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Move one application through the recruiter hiring workflow.

        The application is loaded first and its opportunity is resolved
        server-side (never from the client). The write is allowed only
        when ``opportunity.owner_user_id == current_user.id``. The
        target status must be in the central
        APPLICATION_STATUS_TRANSITIONS map for the current status;
        anything else (including moves out of terminal
        selected/rejected/withdrawn states) is 409. The status flip is
        executed as one guarded UPDATE scoped to (id, opportunity_id,
        current status) so two concurrent updates cannot produce a
        wrong write - the loser gets a 409 to reload and retry.
        """
        _require_recruiter(cu)
        app_row = db.get(Application, application_id)
        if app_row is None:
            raise HTTPException(status_code=404, detail="Application not found")
        opp = db.get(Opportunity, app_row.opportunity_id)
        if opp is None:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        if opp.owner_user_id != cu.id:
            raise HTTPException(
                status_code=403,
                detail="Only the owner can manage this opportunity",
            )
        target = data.status
        if target not in _allowed_targets(app_row.status):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot move application from {app_row.status!r} "
                    f"to {target!r}"
                ),
            )
        now = _utcnow()
        values = {
            "status": target,
            "reviewed_by_user_id": cu.id,
            "status_changed_at": now,
            "updated_at": now,
            # Rejection reasons are only ever persisted for the terminal
            # "rejected" state, so a stale reason can never survive on a
            # live application.
            "rejection_reason": (
                data.rejection_reason if target == "rejected" else None
            ),
        }
        if data.recruiter_note is not None:
            # A supplied note overwrites; an omitted/blank note leaves
            # the previous recruiter note untouched (never silently
            # cleared).
            values["recruiter_note"] = data.recruiter_note
        try:
            matched = (
                db.query(Application)
                .filter(
                    Application.id == app_row.id,
                    Application.opportunity_id == app_row.opportunity_id,
                    Application.status == app_row.status,
                )
                .update(values, synchronize_session=False)
            )
            if matched != 1:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail="Application status changed; reload and retry",
                )
            db.commit()
        except HTTPException:
            db.rollback()
            raise
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not update application status"
            )
        db.refresh(app_row)
        # STAGE 9.4 - server-side student notification. Created ONLY after
        # the guarded status UPDATE committed above, so failed (401/403/
        # 404/409/422/500) transitions can never produce a false claim.
        try:
            _notify_application_status(db, app_row, opp)
        except Exception:
            pass
        db.refresh(app_row)
        student = db.get(User, app_row.student_user_id)
        profile = (
            db.query(StudentProfile)
            .filter(StudentProfile.user_id == app_row.student_user_id)
            .first()
        )
        return _serialize_applicant(app_row, student, profile)

    # ==============================================================
    # STAGE 9.4 - RECRUITER PIPELINE AGGREGATES (additive).
    # ==============================================================
    @app.get("/api/opportunities/{opportunity_id}/pipeline")
    def opportunity_pipeline(
        opportunity_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Owner-only per-status application totals for one opportunity.

        Authorization mirrors the applicant list: (1) recruiter role,
        (2) opportunity existence, (3) ``owner_user_id == current_user.id``.
        A 403 never reveals whether another recruiter's opportunity has
        applicants. Archived/closed opportunities stay owner-readable so
        recruiter history is preserved (Stage 9.2). Counts come from ONE
        ``GROUP BY status`` aggregate - the endpoint never loads applicant
        rows and creates no N+1 query.
        """
        _require_recruiter(cu)
        opp = db.get(Opportunity, opportunity_id)
        if opp is None:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        if opp.owner_user_id != cu.id:
            raise HTTPException(
                status_code=403,
                detail="Only the owner can manage this opportunity",
            )
        rows = (
            db.query(Application.status, func.count(Application.id))
            .filter(Application.opportunity_id == opp.id)
            .group_by(Application.status)
            .all()
        )
        counts = {str(status or ""): int(n or 0) for status, n in rows}
        total = sum(counts.values())
        payload = {"opportunity_id": opp.id, "total": total}
        for key in APPLICATION_STATUSES:
            payload[key] = int(counts.get(key, 0))
        # Any unexpected stored label is folded into "other" so total
        # always equals the sum of the reported buckets.
        payload["other"] = total - sum(payload[k] for k in APPLICATION_STATUSES)
        return payload
