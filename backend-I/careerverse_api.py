"""Stage 10 — CareerVerse API endpoints (additive, under /api/careerverse/*).

Aggregates existing platform data. All personalized endpoints derive
the user from JWT — never trust frontend user_id as authority.
"""
from __future__ import annotations

import json
from datetime import datetime

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import careerverse_service as cv


class GoalIn(BaseModel):
    target_role: str
    target_domain: str | None = None
    target_level: str | None = None
    target_date: str | None = None
    note: str | None = None


class SimulateAction(BaseModel):
    skill_id: int
    new_level: str


class SimulateIn(BaseModel):
    actions: list[SimulateAction] = []


def register_careerverse(app, get_db, me_dep):

    @app.get("/api/careerverse/overview")
    def careerverse_overview(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            return cv.get_career_snapshot(db, user.id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load CareerVerse overview: {str(e)[:200]}")

    @app.get("/api/careerverse/timeline")
    def careerverse_timeline(limit: int = 60, db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            return {"events": cv.get_career_timeline(db, user.id, limit=min(limit, 100))}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load timeline: {str(e)[:200]}")

    @app.get("/api/careerverse/roadmap")
    def careerverse_roadmap(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            return {"stages": cv.get_career_roadmap(db, user.id)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load roadmap: {str(e)[:200]}")

    @app.get("/api/careerverse/next-mission")
    def careerverse_next_mission(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            mission = cv.get_next_mission(db, user.id)
            if not mission:
                return {"mission": None, "message": "Set a target role to begin receiving missions."}
            return {"mission": mission}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to compute next mission: {str(e)[:200]}")

    @app.get("/api/careerverse/goals")
    def careerverse_goals(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            return {"goals": cv.get_career_goals(db, user.id)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load goals: {str(e)[:200]}")

    @app.post("/api/careerverse/goals")
    def careerverse_set_goal(payload: GoalIn, db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            target_date = None
            if payload.target_date:
                try:
                    target_date = datetime.fromisoformat(payload.target_date)
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid target_date format (use ISO format)")
            return cv.set_career_goal(
                db, user.id,
                target_role=payload.target_role.strip(),
                target_domain=payload.target_domain,
                target_level=payload.target_level,
                target_date=target_date,
                note=payload.note,
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save goal: {str(e)[:200]}")

    @app.post("/api/careerverse/simulate")
    def careerverse_simulate(payload: SimulateIn, db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            actions = [{"skill_id": a.skill_id, "new_level": a.new_level} for a in payload.actions]
            return cv.simulate_what_if(db, user.id, actions)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)[:200]}")
