"""Seed CareerVerse career_events from existing historical data.

Run:  python seed_careerverse.py
Safe to run repeatedly — events are idempotent (unique constraint on
user+event_type+source_type+source_id). Creates the new tables if needed.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if not os.getenv("DATABASE_URL"):
    os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@localhost:5432/skillshare"

from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import Base, CareerEvent, CareerGoal
import careerverse_service as cv


def run():
    # Create additive tables
    Base.metadata.create_all(bind=engine, tables=[CareerEvent.__table__, CareerGoal.__table__])

    db = SessionLocal()
    try:
        from models import User
        users = db.query(User).all()
        total_events = 0
        total_users = 0
        for user in users:
            n = cv.backfill_career_events(db, user.id)
            if n > 0:
                total_events += n
                total_users += 1
        print("=" * 60)
        print(f"CareerVerse seed complete.")
        print(f"  Users processed: {len(users)}")
        print(f"  Users with new events: {total_users}")
        print(f"  Total events created: {total_events}")
        print("=" * 60)
    finally:
        db.close()


if __name__ == "__main__":
    run()
