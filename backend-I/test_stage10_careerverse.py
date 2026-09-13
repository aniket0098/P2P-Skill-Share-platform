"""Stage 10 — CareerVerse test suite (part 1: imports + logic)"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

results = {"pass": 0, "fail": 0, "errors": []}


def check(name, condition, detail=""):
    if condition:
        results["pass"] += 1
        print(f"  PASS: {name}")
    else:
        results["fail"] += 1
        results["errors"].append(f"{name}: {detail}")
        print(f"  FAIL: {name} — {detail}")


def test_imports():
    print("\n[1] Imports and model definitions")
    try:
        from models import CareerEvent, CareerGoal, CAREER_EVENT_TYPES, CAREER_GOAL_STATUS
        check("CareerEvent model", True)
        check("CareerGoal model", True)
        check("CAREER_EVENT_TYPES", len(CAREER_EVENT_TYPES) > 0)
        check("CAREER_GOAL_STATUS has active", "active" in CAREER_GOAL_STATUS)
    except Exception as e:
        check("Model imports", False, str(e))
    try:
        from careerverse_service import (record_career_event, backfill_career_events,
            get_career_snapshot, get_career_timeline, get_career_roadmap, get_next_mission,
            get_career_goals, set_career_goal, simulate_what_if, _compute_journey_progress)
        check("careerverse_service imports", True)
    except Exception as e:
        check("careerverse_service imports", False, str(e))
    try:
        from careerverse_api import register_careerverse, GoalIn, SimulateIn
        check("careerverse_api imports", True)
    except Exception as e:
        check("careerverse_api imports", False, str(e))


def test_journey_progress():
    print("\n[2] Journey progress calculation")
    from careerverse_service import _compute_journey_progress
    p = _compute_journey_progress(has_profile=False, skill_count=0, learning_total=0,
        project_total=0, sandbox_joined=0, innovation_ideas=0, readiness_score=None)
    check("Empty user = 0%", p == 0, f"got {p}")
    p = _compute_journey_progress(has_profile=True, skill_count=0, learning_total=0,
        project_total=0, sandbox_joined=0, innovation_ideas=0, readiness_score=None)
    check("Profile only = 15%", p == 15, f"got {p}")
    p = _compute_journey_progress(has_profile=True, skill_count=5, learning_total=4,
        project_total=3, sandbox_joined=2, innovation_ideas=1, readiness_score=80)
    check("Full user high progress", p >= 80, f"got {p}")


def test_event_and_goals():
    print("\n[3] Career events + goals (DB)")
    try:
        from database import Base
        from models import CareerEvent, CareerGoal, User
        Base.metadata.create_all(bind=engine)
        db = TestSession()
        from careerverse_service import record_career_event, set_career_goal, get_career_goals
        user = User(name="T", email="t@e.com", password_hash="x")
        db.add(user); db.flush()
        e1 = record_career_event(db, user_id=user.id, event_type="profile_completed",
            title="P", source_type="profile", source_id=1)
        check("Event recorded", e1 is not None)
        e2 = record_career_event(db, user_id=user.id, event_type="profile_completed",
            title="P", source_type="profile", source_id=1)
        check("Duplicate rejected", e2 is None)
        count = db.query(CareerEvent).filter(CareerEvent.user_id == user.id).count()
        check("1 event only", count == 1, f"got {count}")
        g = set_career_goal(db, user.id, target_role="Dev")
        check("Goal created", g["id"] is not None)
        g2 = set_career_goal(db, user.id, target_role="Senior Dev")
        check("Goal updated same id", g2["id"] == g["id"])
        goals = get_career_goals(db, user.id)
        check("1 goal only", len(goals) == 1)
        db.close()
    except Exception as e:
        check("DB events/goals", False, str(e))


def test_snapshot():
    print("\n[4] Snapshot for new user")
    try:
        from database import Base
        from models import User
        Base.metadata.create_all(bind=engine)
        db = TestSession()
        from careerverse_service import get_career_snapshot
        user = User(name="N", email="n@e.com", password_hash="x")
        db.add(user); db.flush()
        snap = get_career_snapshot(db, user.id)
        check("Snapshot is dict", isinstance(snap, dict))
        check("Skills=0", snap["skills"]["count"] == 0)
        check("Journey < 30", snap["journey_progress"] < 30, f"got {snap['journey_progress']}")
        db.close()
    except Exception as e:
        check("Snapshot", False, str(e))


def test_frontend():
    print("\n[5] Frontend + registration")
    fs = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "peer to peer skill share")
    check("careerverse.js exists", os.path.exists(os.path.join(fs, "careerverse.js")))
    check("careerverse.html exists", os.path.exists(os.path.join(fs, "careerverse.html")))
    html = open(os.path.join(fs, "careerverse.html"), encoding="utf-8").read()
    check("HTML has careerverse.js", "careerverse.js" in html)
    api = open(os.path.join(fs, "api-client.js"), encoding="utf-8").read()
    check("API has getCareerOverview", "getCareerOverview" in api)
    check("API has getCareerTimeline", "getCareerTimeline" in api)
    check("API has getCareerRoadmap", "getCareerRoadmap" in api)
    check("API has setCareerGoal", "setCareerGoal" in api)
    check("API has simulate", "simulate" in api)
    main = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"), encoding="utf-8").read()
    check("main.py registers careerverse", "register_careerverse" in main)


if __name__ == "__main__":
    test_imports()
    test_journey_progress()
    test_event_and_goals()
    test_snapshot()
    test_frontend()
    print("\n" + "=" * 60)
    print(f"RESULTS: {results['pass']} passed, {results['fail']} failed")
    for e in results["errors"]:
        print(f"  FAIL: {e}")
    print("=" * 60)
