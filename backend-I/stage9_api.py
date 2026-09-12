"""Stage 9 API: AI Career Coach endpoints (additive, under /api/career-coach/*)."""
from __future__ import annotations
import json
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import stage9_service as s9


class ChatIn(BaseModel):
    message: str
    conversation_id: int | None = None
    mode: str | None = None


class ConversationIn(BaseModel):
    mode: str | None = "general"
    title: str | None = None


def register_stage9(app, get_db, me_dep):

    @app.get("/api/career-coach/context")
    def get_career_context(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            return s9.build_career_context(db, user.id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to build career context: {str(e)[:200]}")

    @app.get("/api/career-coach/recommendations")
    def get_recommendations(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            return s9.generate_recommendations(db, user.id)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {str(e)[:200]}")

    @app.get("/api/career-coach/next-mission")
    def get_next_mission(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            ctx = s9.build_career_context(db, user.id)
            return s9._compute_next_mission(ctx)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to compute next mission: {str(e)[:200]}")

    @app.get("/api/career-coach/weekly-plan")
    def get_weekly_plan(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            ctx = s9.build_career_context(db, user.id)
            return s9.build_weekly_plan(ctx)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to build weekly plan: {str(e)[:200]}")

    @app.get("/api/career-coach/roadmap")
    def get_roadmap(db: Session = Depends(get_db), user=Depends(me_dep)):
        try:
            ctx = s9.build_career_context(db, user.id)
            return s9._build_roadmap(ctx)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to build roadmap: {str(e)[:200]}")

    @app.post("/api/career-coach/chat")
    def career_chat(payload: ChatIn, db: Session = Depends(get_db), user=Depends(me_dep)):
        if not payload.message or not payload.message.strip():
            raise HTTPException(status_code=400, detail="Message required")
        try:
            ctx = s9.build_career_context(db, user.id)
            history = None
            conv_id = payload.conversation_id
            if conv_id:
                conv = s9.get_conversation(db, user.id, conv_id)
                if not conv:
                    raise HTTPException(status_code=404, detail="Conversation not found")
                history = conv.get("messages", [])
            result = s9.coach_chat(payload.message.strip(), ctx, history)
            if conv_id:
                s9.add_message(db, conv_id, user.id, "user", payload.message.strip())
                s9.add_message(db, conv_id, user.id, "assistant", result.get("content", ""))
            return {
                "content": result.get("content", ""),
                "provider": result.get("provider_name", "rule"),
                "ai_used": result.get("ai_used", False),
                "ai_available": result.get("ai_available", False),
                "error": result.get("error"),
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Chat failed: {str(e)[:200]}")

    @app.get("/api/career-coach/conversations")
    def list_conversations(db: Session = Depends(get_db), user=Depends(me_dep)):
        return s9.get_conversations(db, user.id)

    @app.get("/api/career-coach/conversations/{conv_id}")
    def get_conversation(conv_id: int, db: Session = Depends(get_db), user=Depends(me_dep)):
        conv = s9.get_conversation(db, user.id, conv_id)
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return conv

    @app.post("/api/career-coach/conversations")
    def new_conversation(payload: ConversationIn, db: Session = Depends(get_db), user=Depends(me_dep)):
        return s9.create_conversation(db, user.id, payload.mode or "general", payload.title)

    @app.delete("/api/career-coach/conversations/{conv_id}")
    def delete_conversation(conv_id: int, db: Session = Depends(get_db), user=Depends(me_dep)):
        ok = s9.delete_conversation(db, user.id, conv_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"deleted": True}

    @app.get("/api/career-coach/status")
    def coach_status():
        return {
            "provider": s9.provider_name(),
            "ai_available": s9.any_ai_available(),
        }
