"""Seed the 12 career-journey stages idempotently.

Run:  python seed_career_journey.py
Safe to run repeatedly — existing stage rows are matched by slug and left
untouched (so order/icon edits are preserved). Missing slugs are inserted.
"""
import sys
import os

# Allow running from repo root or backend-I directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Ensure DATABASE_URL is set (fallback to local default for dev).
if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = (
        "postgresql://postgres:postgres@localhost:5432/skillshare"
    )

from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, CareerJourneyStage, CAREER_JOURNEY_STAGES

# (slug, name, description, icon)
STAGE_SEED = {
    "profile": (
        "Profile",
        "Complete your student profile — academics, skills, and preferences.",
        "👤",
    ),
    "skills_evidence": (
        "Skills + Evidence",
        "Map your skills and back them with evidence (projects, certs, endorsements).",
        "🏅",
    ),
    "skill_gaps": (
        "Skill Gaps",
        "See where you stand vs your target role and which gaps to close first.",
        "🔍",
    ),
    "target_role": (
        "Target Role",
        "Choose or refine the job role you are aiming for.",
        "🎯",
    ),
    "learning": (
        "Learning",
        "Track courses, resources and learning paths you are following.",
        "📚",
    ),
    "sandbox": (
        "Sandbox",
        "Attempt real-world industry challenges and get evaluated.",
        "🧪",
    ),
    "innovation": (
        "Innovation",
        "Prototype ideas, form teams, and build pitches.",
        "💡",
    ),
    "projects": (
        "Projects",
        "Showcase projects that demonstrate your skills and impact.",
        "💻",
    ),
    "industry_readiness": (
        "Industry Readiness",
        "View your readiness score for your target role across skills and evidence.",
        "📊",
    ),
    "career_simulation": (
        "Career Simulation",
        "Chat with the AI career coach for planning, scenarios and advice.",
        "🤖",
    ),
    "internship_placement_readiness": (
        "Internship / Placement Readiness",
        "Prepare applications, interviews and track internship/placement progress.",
        "💼",
    ),
    "career": (
        "Career",
        "Record your final outcome — placement, internship or higher studies.",
        "🚀",
    ),
}


def seed_career_journey(db: Session) -> dict:
    """Idempotently insert any missing journey stages."""
    counts = {"inserted": 0, "existing": 0}
    for order, slug in enumerate(CAREER_JOURNEY_STAGES, start=1):
        row = db.query(CareerJourneyStage).filter(
            CareerJourneyStage.slug == slug
        ).first()
        if row is None:
            name, description, icon = STAGE_SEED[slug]
            db.add(CareerJourneyStage(
                slug=slug,
                name=name,
                description=description,
                order=order,
                icon=icon,
            ))
            counts["inserted"] += 1
        else:
            counts["existing"] += 1
    db.commit()
    return counts


if __name__ == "__main__":
    # Create the new tables if they don't exist yet (additive create_all).
    Base.metadata.create_all(bind=engine, tables=[
        CareerJourneyStage.__table__,
    ])
    db = SessionLocal()
    try:
        counts = seed_career_journey(db)
        print("=" * 60)
        print("Career-journey stage seed complete.")
        print(f"  Inserted: {counts['inserted']}  |  Existing: {counts['existing']}")
        print("=" * 60)
    finally:
        db.close()
