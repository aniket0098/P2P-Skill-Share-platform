
"""Stage 7 seed: DEMO industry challenges (clearly identified)."""
import json
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import Base, engine, SessionLocal
from models import SandboxChallenge, SandboxChallengeSkill, SandboxTask, SandboxResource, Skill

DEMO_CHALLENGES = [
    {"title": "Build a REST API for Inventory Management", "slug": "inventory-rest-api",
     "description": "Design and implement a RESTful API for a product inventory system.",
     "business_context": "An e-commerce company needs to replace legacy inventory tracking.",
     "expected_outcome": "A working REST API with CRUD endpoints and stock tracking.",
     "industry": "E-Commerce", "domain": "Web Development", "difficulty": "intermediate",
     "estimated_time": "4-6 hours", "status": "open", "company_name": "DemoShop (DEMO)",
     "skills": [{"name": "Python"}, {"name": "FastAPI"}, {"name": "REST APIs"}, {"name": "PostgreSQL"}],
     "tasks": [{"title": "Design the data model"}, {"title": "Implement CRUD endpoints"},
               {"title": "Add stock tracking"}, {"title": "Write API documentation"}],
     "resources": [{"title": "FastAPI Docs", "resource_type": "documentation", "url": "https://fastapi.tiangolo.com/"}],
     "evaluation_criteria": [{"name": "Technical Correctness", "weight": 30}, {"name": "API Design", "weight": 25},
                              {"name": "Code Quality", "weight": 20}, {"name": "Completeness", "weight": 15},
                              {"name": "Documentation", "weight": 10}]},
    {"title": "Customer Churn Prediction Model", "slug": "churn-prediction",
     "description": "Build a machine learning model to predict customer churn.",
     "business_context": "A SaaS company has a 15% annual churn rate.",
     "expected_outcome": "A trained classification model with evaluation metrics.",
     "industry": "SaaS / Technology", "domain": "Data Science", "difficulty": "intermediate",
     "estimated_time": "5-7 hours", "status": "open", "company_name": "CloudMetrics (DEMO)",
     "skills": [{"name": "Python"}, {"name": "Machine Learning"}, {"name": "Data Analysis"}, {"name": "Statistics"}],
     "tasks": [{"title": "Exploratory Data Analysis"}, {"title": "Feature Engineering"},
               {"title": "Model Training"}, {"title": "Business Recommendations"}],
     "resources": [{"title": "Scikit-learn Docs", "resource_type": "documentation", "url": "https://scikit-learn.org/stable/"}],
     "evaluation_criteria": [{"name": "Model Performance", "weight": 30}, {"name": "Feature Engineering", "weight": 25},
                              {"name": "Analysis Quality", "weight": 20}, {"name": "Business Insight", "weight": 15},
                              {"name": "Code Quality", "weight": 10}]},
    {"title": "Responsive Landing Page Redesign", "slug": "landing-page-redesign",
     "description": "Redesign a landing page for a fintech startup with high bounce rate on mobile.",
     "business_context": "A fintech startup sees 70% bounce rate on mobile.",
     "expected_outcome": "A fully responsive landing page across all devices.",
     "industry": "FinTech", "domain": "Web Development", "difficulty": "beginner",
     "estimated_time": "3-4 hours", "status": "open", "company_name": "PayFlow (DEMO)",
     "skills": [{"name": "HTML"}, {"name": "CSS"}, {"name": "JavaScript"}, {"name": "UI/UX"}],
     "tasks": [{"title": "Design the layout"}, {"title": "Build the hero section"},
               {"title": "Add features grid"}, {"title": "Ensure responsiveness"}],
     "resources": [{"title": "CSS Flexbox Guide", "resource_type": "documentation",
                    "url": "https://css-tricks.com/snippets/css/a-guide-to-flexbox/"}],
     "evaluation_criteria": [{"name": "Visual Design", "weight": 25}, {"name": "Responsiveness", "weight": 25},
                              {"name": "Code Quality", "weight": 20}, {"name": "User Experience", "weight": 20},
                              {"name": "Completeness", "weight": 10}]},
    {"title": "Vulnerability Assessment Report", "slug": "vulnerability-assessment",
     "description": "Conduct a vulnerability assessment on a simulated web application.",
     "business_context": "A healthcare startup needs a security audit before compliance review.",
     "expected_outcome": "A vulnerability assessment report with findings and remediation.",
     "industry": "HealthTech", "domain": "Cybersecurity", "difficulty": "advanced",
     "estimated_time": "6-8 hours", "status": "open", "company_name": "MedSecure (DEMO)",
     "skills": [{"name": "Cybersecurity"}, {"name": "Python"}, {"name": "Communication"}],
     "tasks": [{"title": "Reconnaissance"}, {"title": "Vulnerability Identification"},
               {"title": "Risk Assessment"}, {"title": "Remediation Plan"}],
     "resources": [{"title": "OWASP Top 10", "resource_type": "documentation",
                    "url": "https://owasp.org/www-project-top-ten/"}],
     "evaluation_criteria": [{"name": "Vulnerability Coverage", "weight": 30}, {"name": "Risk Assessment", "weight": 25},
                              {"name": "Remediation Feasibility", "weight": 25}, {"name": "Report Clarity", "weight": 20}]},
]


def get_or_create_skill(db: Session, name: str) -> Skill:
    skill = db.query(Skill).filter(func.lower(Skill.name) == name.lower()).first()
    if skill:
        return skill
    skill = Skill(name=name, category=None)
    db.add(skill)
    db.flush()
    return skill


def seed_stage7(db: Session) -> dict:
    """Idempotent seeding of demo challenges."""
    counts = {"created": 0, "skipped": 0}
    for ch_data in DEMO_CHALLENGES:
        existing = db.query(SandboxChallenge).filter(
            SandboxChallenge.slug == ch_data["slug"]).first()
        if existing:
            counts["skipped"] += 1
            continue
        criteria_json = json.dumps(ch_data.get("evaluation_criteria")) if ch_data.get("evaluation_criteria") else None
        ch = SandboxChallenge(
            title=ch_data["title"], slug=ch_data["slug"],
            description=ch_data["description"],
            business_context=ch_data.get("business_context"),
            expected_outcome=ch_data.get("expected_outcome"),
            industry=ch_data.get("industry"), domain=ch_data.get("domain"),
            difficulty=ch_data["difficulty"], estimated_time=ch_data.get("estimated_time"),
            status=ch_data.get("status", "open"), company_name=ch_data.get("company_name"),
            is_demo=True, evaluation_criteria=criteria_json,
        )
        db.add(ch)
        db.flush()
        for sk in ch_data.get("skills", []):
            skill_obj = get_or_create_skill(db, sk["name"])
            db.add(SandboxChallengeSkill(challenge_id=ch.id, skill_id=skill_obj.id))
        for i, t in enumerate(ch_data.get("tasks", [])):
            db.add(SandboxTask(challenge_id=ch.id, title=t["title"], order_index=i))
        for r in ch_data.get("resources", []):
            db.add(SandboxResource(challenge_id=ch.id, title=r["title"],
                                   resource_type=r.get("resource_type", "link"), url=r.get("url")))
        counts["created"] += 1
    db.commit()
    return counts


def main():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    try:
        counts = seed_stage7(db)
        print("=" * 60)
        print("Stage 7 demo seed complete.")
        print("=" * 60)
        print(f"Created: {counts['created']} | Skipped: {counts['skipped']}")
        print("All challenges have is_demo = True")
    finally:
        db.close()


if __name__ == "__main__":
    main()

