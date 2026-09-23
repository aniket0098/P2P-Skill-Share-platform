"""Stage 9.4 notification read API (additive).

Serves the platform's SINGLE notification store - the portable raw
``notifications`` table that stage8_service.notify() has been writing to
since Stage 8 (id / user_id / type / title / message / link / is_read /
created_at). This module adds no second table, no second writer and no
second unread system: it only lets the JWT owner list their own rows and
mark them read.

Endpoints (JWT only, owner-scoped server-side):
  * GET  /api/notifications            (own rows, newest first, unread_count)
  * POST /api/notifications/{id}/read  (own row only, 404 otherwise)
  * POST /api/notifications/read-all   (marks the caller's unread rows read)

Rows expose id/type/title/message/link/is_read/created_at only - never
emails, passwords, tokens or database internals.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session


def _ensure_notifications_table(db: Session) -> None:
    from sqlalchemy import text as _text

    try:
        db.execute(
            _text(
                "CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, "
                "user_id INTEGER, type VARCHAR DEFAULT 'general', title VARCHAR, "
                "message TEXT, link VARCHAR DEFAULT '', is_read BOOLEAN DEFAULT FALSE, "
                "created_at TIMESTAMPTZ DEFAULT NOW())"
            )
        )
    except Exception:
        try:
            db.execute(
                _text(
                    "CREATE TABLE IF NOT EXISTS notifications "
                    "(id INTEGER PRIMARY KEY AUTOINCREMENT, "
                    "user_id INTEGER, type VARCHAR DEFAULT 'general', title VARCHAR, "
                    "message TEXT, link VARCHAR DEFAULT '', is_read BOOLEAN DEFAULT 0, "
                    "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
                )
            )
        except Exception:
            pass

def _serialize_notification(row) -> dict:
    """Public shape of one notification row (no private data)."""
    if isinstance(row, dict):
        created = row.get("created_at")
        return {
            "id": row.get("id"),
            "type": row.get("type") or "general",
            "title": row.get("title") or "Notification",
            "message": row.get("message") or "",
            "link": row.get("link") or "",
            "is_read": bool(row.get("is_read")),
            "created_at": str(created) if created is not None else None,
        }
    created = getattr(row, "created_at", None)
    iso = created.isoformat() if hasattr(created, "isoformat") else None
    return {
        "id": getattr(row, "id", None),
        "type": getattr(row, "type", None) or "general",
        "title": getattr(row, "title", None) or "Notification",
        "message": getattr(row, "message", None) or "",
        "link": getattr(row, "link", None) or "",
        "is_read": bool(getattr(row, "is_read", False)),
        "created_at": iso if iso is not None else (
            str(created) if created is not None else None
        ),
    }

def register_notifications(app, get_db, me_dep):
    """Register the additive Stage 9.4 notification read endpoints."""

    @app.get("/api/notifications")
    def list_notifications(
        limit: int = 50,
        offset: int = 0,
        unread_only: bool = False,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """List the caller's own notifications, newest first (JWT user only)."""
        from models import Notification

        _ensure_notifications_table(db)
        lim = min(max(int(limit or 50), 1), 100)
        off = max(int(offset or 0), 0)
        q = db.query(Notification).filter(Notification.user_id == cu.id)
        if unread_only:
            q = q.filter(Notification.is_read == False)  # noqa: E712
        total = q.count()
        unread_count = (
            db.query(Notification)
            .filter(
                Notification.user_id == cu.id,
                Notification.is_read == False,  # noqa: E712
            )
            .count()
        )
        rows = (
            q.order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset(off)
            .limit(lim)
            .all()
        )
        return {
            "items": [_serialize_notification(r) for r in rows],
            "total": total,
            "limit": lim,
            "offset": off,
            "has_more": (off + len(rows)) < total,
            "unread_count": unread_count,
        }

    @app.post("/api/notifications/{notification_id}/read")
    def mark_notification_read(
        notification_id: int,
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Mark one of the caller's own rows read (other users' ids -> 404)."""
        from models import Notification

        _ensure_notifications_table(db)
        row = (
            db.query(Notification)
            .filter(
                Notification.id == notification_id,
                Notification.user_id == cu.id,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status_code=404, detail="Notification not found")
        try:
            if not row.is_read:
                row.is_read = True
                db.flush()
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not update notification"
            )
        db.refresh(row)
        return {"notification": _serialize_notification(row)}

    @app.post("/api/notifications/read-all")
    def mark_all_notifications_read(
        cu=Depends(me_dep),
        db: Session = Depends(get_db),
    ):
        """Mark all of the caller's unread rows read."""
        from models import Notification

        _ensure_notifications_table(db)
        try:
            marked = (
                db.query(Notification)
                .filter(
                    Notification.user_id == cu.id,
                    Notification.is_read == False,  # noqa: E712
                )
                .update({"is_read": True}, synchronize_session=False)
            )
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500, detail="Could not update notifications"
            )
        return {"marked": int(marked or 0)}


