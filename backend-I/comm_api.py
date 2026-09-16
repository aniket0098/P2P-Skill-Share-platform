"""COMMUNICATION HUB API (additive; existing routes untouched).

Groups + reactions + replies + attachments + preferences + calls +
realtime WebSocket + presence, all on the EXISTING User /
Conversation / ConversationParticipant / Message models.
Every endpoint derives the user from JWT; membership enforced.
"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import and_, func, or_

import auth as authmod
from models import (
    CallParticipant,
    CallRecord,
    Connection,
    ConnectionRequest,
    Conversation,
    ConversationParticipant,
    ConversationPreference,
    Education,
    Message,
    MessageAttachment,
    MessageReaction,
    Project,
    User,
)

UPLOAD_DIR = Path(__file__).resolve().parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_UPLOADS = {
    "image/png": "image", "image/jpeg": "image", "image/gif": "image",
    "image/webp": "image", "image/svg+xml": "image",
    "application/pdf": "pdf",
    "text/plain": "doc",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
    "application/vnd.ms-powerpoint": "doc",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "doc",
    "application/zip": "doc",
}
URL_RE = re.compile(r"https?://[^\s<>\"]+", re.IGNORECASE)
EMOJI_ALLOW = {"👍", "❤️", "😂", "🎯", "🔥", "👏", "😮", "😢"}

# Realtime registry: user_id -> set of websockets. Transient only.
_SOCKETS: dict[int, set] = {}
_PRESENCE: dict[int, float] = {}


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    if not dt:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return None


def _conv_type(conv) -> str:
    return (getattr(conv, "conversation_type", None) or "direct").lower()


def _is_participant(db, conversation_id: int, user_id: int) -> bool:
    return (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
        is not None
    )


def _require_participant(db, conversation_id: int, user_id: int):
    if not _is_participant(db, conversation_id, user_id):
        raise HTTPException(status_code=403, detail="You are not part of this conversation")


def _is_group_admin(db, conversation_id: int, user_id: int) -> bool:
    row = (
        db.query(ConversationParticipant)
        .filter(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
        .first()
    )
    return bool(row and (getattr(row, "role", "member") or "member").lower() == "admin")


def _member_ids(db, conversation_id: int) -> list[int]:
    return [
        r.user_id
        for r in db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conversation_id)
        .all()
    ]


def _get_pref(db, conversation_id: int, user_id: int):
    pref = (
        db.query(ConversationPreference)
        .filter(
            ConversationPreference.conversation_id == conversation_id,
            ConversationPreference.user_id == user_id,
        )
        .first()
    )
    if pref is None:
        pref = ConversationPreference(conversation_id=conversation_id, user_id=user_id)
        db.add(pref)
        db.flush()
    return pref


def _connected(db, a: int, b: int) -> bool:
    lo, hi = sorted((a, b))
    return (
        db.query(Connection)
        .filter(Connection.user_one_id == lo, Connection.user_two_id == hi)
        .first()
        is not None
    )


def _user_summary(u) -> dict | None:
    if u is None:
        return None
    avatar = getattr(u, "avatar_url", None) or None
    return {
        "id": u.id,
        "public_id": getattr(u, "public_id", None),
        "username": getattr(u, "username", None),
        "name": u.name,
        "avatar": avatar,
        "avatar_url": avatar,
        "bio": getattr(u, "bio", None),
        "skills": getattr(u, "skills", None),
        "interests": getattr(u, "interests", None),
        "location": getattr(u, "location", None),
        "website": getattr(u, "website", None),
    }


async def _broadcast(member_ids: list[int], payload: dict, exclude: int | None = None):
    """Push a JSON event to online conversation members (best effort)."""
    text = json.dumps(payload, default=str)
    dead: list[tuple[int, object]] = []
    for uid in member_ids:
        if exclude is not None and uid == exclude:
            continue
        for ws in list(_SOCKETS.get(uid, set())):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append((uid, ws))
    for uid, ws in dead:
        try:
            _SOCKETS.get(uid, set()).discard(ws)
        except Exception:
            pass


def _online(user_id: int) -> bool:
    if _SOCKETS.get(user_id):
        return True
    last = _PRESENCE.get(user_id, 0)
    return (time.time() - last) < 75


def _last_seen(user_id: int):
    if _SOCKETS.get(user_id):
        return None  # online now
    last = _PRESENCE.get(user_id)
    if not last:
        return None
    return datetime.fromtimestamp(last, tz=timezone.utc).isoformat()


def _serialize_message(db, m, viewer_id: int) -> dict:
    sender = db.get(User, m.sender_id)
    reactions = (
        db.query(MessageReaction, User.name)
        .join(User, User.id == MessageReaction.user_id)
        .filter(MessageReaction.message_id == m.id)
        .all()
    )
    grouped: dict[str, dict] = {}
    for react, uname in reactions:
        g = grouped.setdefault(react.emoji, {"emoji": react.emoji, "count": 0, "users": [], "mine": False})
        g["count"] += 1
        if len(g["users"]) < 6:
            g["users"].append(uname)
        if react.user_id == viewer_id:
            g["mine"] = True
    attachments = (
        db.query(MessageAttachment)
        .filter(MessageAttachment.message_id == m.id)
        .order_by(MessageAttachment.id.asc())
        .all()
    )
    reply = None
    if getattr(m, "reply_to_id", None):
        rm = db.get(Message, m.reply_to_id)
        if rm is not None:
            rs = db.get(User, rm.sender_id)
            reply = {
                "id": rm.id,
                "sender_id": rm.sender_id,
                "sender_name": rs.name if rs else "Member",
                "content": "" if getattr(rm, "is_deleted", False) else (rm.content or ""),
            }
    mine_reacted = {r.emoji for r, _u in []}
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "sender": _user_summary(sender),
        "content": "" if getattr(m, "is_deleted", False) else (m.content or ""),
        "is_deleted": bool(getattr(m, "is_deleted", False)),
        "is_read": bool(m.is_read),
        "is_pinned": bool(getattr(m, "is_pinned", False)),
        "reply_to_id": getattr(m, "reply_to_id", None),
        "reply": reply,
        "edited_at": _iso(getattr(m, "edited_at", None)),
        "forward_from_id": getattr(m, "forward_from_id", None),
        "attachment_kind": getattr(m, "attachment_kind", None),
        "created_at": _iso(m.created_at),
        "reactions": list(grouped.values()),
        "attachments": [
            {
                "id": a.id,
                "original_name": a.original_name,
                "mime_type": a.mime_type,
                "size_bytes": a.size_bytes,
                "kind": a.kind,
                "url": f"/api/communication/attachments/{a.id}",
            }
            for a in attachments
        ],
        "links": URL_RE.findall(m.content or "")[:3] if not getattr(m, "is_deleted", False) else [],
    }


def _serialize_conversation(db, conv, viewer_id: int) -> dict:
    members = (
        db.query(ConversationParticipant)
        .filter(ConversationParticipant.conversation_id == conv.id)
        .all()
    )
    users = [db.get(User, p.user_id) for p in members]
    users = [u for u in users if u is not None]
    ctype = _conv_type(conv)
    other = None
    if ctype == "direct":
        for u in users:
            if u.id != viewer_id:
                other = u
                break
    last = (
        db.query(Message)
        .filter(Message.conversation_id == conv.id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .first()
    )
    unread = (
        db.query(Message)
        .filter(
            Message.conversation_id == conv.id,
            Message.sender_id != viewer_id,
            Message.is_read == False,  # noqa: E712
        )
        .count()
    )
    pref = _get_pref(db, conv.id, viewer_id)
    online_count = sum(1 for u in users if _online(u.id)) if ctype == "group" else None
    if ctype == "group":
        name = getattr(conv, "group_name", None) or "Group chat"
        avatar = getattr(conv, "group_avatar_url", None)
        title_user = None
    else:
        name = other.name if other else "SkillShare user"
        avatar = getattr(other, "avatar_url", None) if other else None
        title_user = _user_summary(other)
    out = {
        "id": conv.id,
        "conversation_type": ctype,
        "is_group": ctype == "group",
        "name": name,
        "avatar": avatar,
        "group_name": getattr(conv, "group_name", None),
        "group_avatar_url": getattr(conv, "group_avatar_url", None),
        "other_user": title_user,
        "members": [
            {
                **(_user_summary(u) or {}),
                "role": next(
                    (
                        (getattr(p, "role", "member") or "member")
                        for p in members
                        if p.user_id == u.id
                    ),
                    "member",
                ),
                "online": _online(u.id),
            }
            for u in users
        ],
        "member_count": len(users),
        "online_count": online_count,
        "last_message": _serialize_message(db, last, viewer_id) if last else None,
        "unread_count": unread,
        "is_pinned": bool(pref.is_pinned),
        "is_muted": bool(pref.is_muted),
        "is_archived": bool(pref.is_archived),
        "updated_at": _iso(conv.updated_at),
        "created_at": _iso(conv.created_at),
    }
    return out


class GroupCreateIn(BaseModel):
    name: str
    member_ids: list[int] = []
    avatar_url: str | None = None


class GroupPatchIn(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class MembersAddIn(BaseModel):
    user_ids: list[int] = []


class MessageSendIn(BaseModel):
    content: str = ""
    reply_to_id: int | None = None


class MessageEditIn(BaseModel):
    content: str


class ReactionIn(BaseModel):
    emoji: str


class PrefIn(BaseModel):
    is_pinned: bool | None = None
    is_muted: bool | None = None
    is_archived: bool | None = None


class ForwardIn(BaseModel):
    conversation_id: int


class CallCreateIn(BaseModel):
    call_type: str = "voice"


class CallStatusIn(BaseModel):
    status: str
    duration_seconds: int | None = None


def register_communication(app, get_db, me_dep):
    SessionLocal = None
    try:
        from database import SessionLocal as _SL
        SessionLocal = _SL
    except Exception:
        SessionLocal = None

    def _db_for_ws():
        if SessionLocal is None:
            raise RuntimeError("database not ready")
        return SessionLocal()

    # ---------- conversation list (hub view; legacy routes unchanged) ----------
    @app.get("/api/communication/conversations")
    def comm_list_conversations(db=Depends(get_db), cu=Depends(me_dep)):
        ids = [
            r.conversation_id
            for r in db.query(ConversationParticipant)
            .filter(ConversationParticipant.user_id == cu.id)
            .all()
        ]
        out = []
        for cid in ids:
            conv = db.get(Conversation, cid)
            if conv:
                out.append(_serialize_conversation(db, conv, cu.id))
        db.commit()  # persist auto-created preference rows
        pinned = [c for c in out if c.get("is_pinned")]
        rest = [c for c in out if not c.get("is_pinned")]
        rest.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
        pinned.sort(key=lambda c: c.get("updated_at") or "", reverse=True)
        total_unread = sum(c.get("unread_count", 0) for c in out)
        return {"conversations": pinned + rest, "total_unread": total_unread}

    @app.get("/api/communication/conversations/{conversation_id}")
    def comm_get_conversation(conversation_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        conv = db.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        data = _serialize_conversation(db, conv, cu.id)
        db.commit()
        return {"conversation": data}

    # ---------- direct conversation with a user ----------
    @app.post("/api/communication/direct/{user_id}")
    async def comm_ensure_direct(user_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        if user_id == cu.id:
            raise HTTPException(status_code=400, detail="You cannot message yourself")
        peer = db.get(User, user_id)
        if peer is None:
            raise HTTPException(status_code=404, detail="User not found")
        pairs = (
            db.query(ConversationParticipant.conversation_id)
            .filter(ConversationParticipant.user_id.in_([cu.id, user_id]))
            .group_by(ConversationParticipant.conversation_id)
            .having(func.count(ConversationParticipant.id) == 2)
            .all()
        )
        for (cid,) in pairs:
            conv = db.get(Conversation, cid)
            if conv is None or _conv_type(conv) != "direct":
                continue
            pids = sorted(
                r.user_id
                for r in db.query(ConversationParticipant)
                .filter(ConversationParticipant.conversation_id == cid)
                .all()
            )
            if pids == sorted([cu.id, user_id]):
                return {"conversation": _serialize_conversation(db, conv, cu.id)}
        conv = Conversation(conversation_type="direct", created_by=cu.id)
        db.add(conv)
        db.flush()
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=cu.id, role="member"))
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=user_id, role="member"))
        db.commit()
        db.refresh(conv)
        try:
            await _broadcast(_member_ids(db, conv.id), {
                "type": "conversation_created", "conversation_id": conv.id,
                "conversation": _serialize_conversation(db, conv, user_id),
            }, exclude=cu.id)
        except Exception:
            pass
        return {"conversation": _serialize_conversation(db, conv, cu.id), "created": True}

    # ---------- groups: create ----------
    @app.post("/api/communication/groups")
    async def comm_create_group(data: GroupCreateIn, db=Depends(get_db), cu=Depends(me_dep)):
        name = (data.name or "").strip()[:80]
        if not name:
            raise HTTPException(status_code=400, detail="Group name is required")
        wanted = {int(x) for x in (data.member_ids or []) if int(x) != cu.id}
        if not wanted:
            raise HTTPException(status_code=400, detail="Select at least one other person")
        for uid in wanted:
            if db.get(User, uid) is None:
                raise HTTPException(status_code=404, detail=f"User {uid} not found")
        conv = Conversation(
            conversation_type="group",
            group_name=name,
            group_avatar_url=(data.avatar_url or "").strip() or None,
            created_by=cu.id,
        )
        db.add(conv)
        db.flush()
        db.add(ConversationParticipant(conversation_id=conv.id, user_id=cu.id, role="admin"))
        for uid in sorted(wanted):
            db.add(ConversationParticipant(conversation_id=conv.id, user_id=uid, role="member"))
        db.commit()
        db.refresh(conv)
        try:
            await _broadcast(_member_ids(db, conv.id), {
                "type": "conversation_created", "conversation_id": conv.id,
                "conversation": _serialize_conversation(db, conv, cu.id),
            })
        except Exception:
            pass
        return {"conversation": _serialize_conversation(db, conv, cu.id), "created": True}

    # ---------- groups: rename / avatar (admin only) ----------
    @app.patch("/api/communication/groups/{conversation_id}")
    def comm_patch_group(conversation_id: int, data: GroupPatchIn, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        conv = db.get(Conversation, conversation_id)
        if conv is None or _conv_type(conv) != "group":
            raise HTTPException(status_code=404, detail="Group not found")
        if not _is_group_admin(db, conversation_id, cu.id):
            raise HTTPException(status_code=403, detail="Only group admins can edit this group")
        if data.name is not None:
            name = data.name.strip()[:80]
            if not name:
                raise HTTPException(status_code=400, detail="Group name cannot be empty")
            conv.group_name = name
        if data.avatar_url is not None:
            conv.group_avatar_url = data.avatar_url.strip() or None
        conv.updated_at = _now()
        db.commit()
        return {"conversation": _serialize_conversation(db, conv, cu.id)}

    # ---------- groups: add members (admin only) ----------
    @app.post("/api/communication/groups/{conversation_id}/members")
    def comm_add_members(conversation_id: int, data: MembersAddIn, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        conv = db.get(Conversation, conversation_id)
        if conv is None or _conv_type(conv) != "group":
            raise HTTPException(status_code=404, detail="Group not found")
        if not _is_group_admin(db, conversation_id, cu.id):
            raise HTTPException(status_code=403, detail="Only group admins can add members")
        added = []
        for uid in {int(x) for x in (data.user_ids or [])}:
            if uid == cu.id or _is_participant(db, conversation_id, uid):
                continue
            if db.get(User, uid) is None:
                raise HTTPException(status_code=404, detail=f"User {uid} not found")
            db.add(ConversationParticipant(conversation_id=conversation_id, user_id=uid, role="member"))
            added.append(uid)
        conv.updated_at = _now()
        db.commit()
        return {"added": added, "conversation": _serialize_conversation(db, conv, cu.id)}

    # ---------- groups: remove/leave + promote ----------
    @app.delete("/api/communication/groups/{conversation_id}/members/{user_id}")
    def comm_remove_member(conversation_id: int, user_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        conv = db.get(Conversation, conversation_id)
        if conv is None or _conv_type(conv) != "group":
            raise HTTPException(status_code=404, detail="Group not found")
        target = (
            db.query(ConversationParticipant)
            .filter(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
            .first()
        )
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found")
        if user_id != cu.id and not _is_group_admin(db, conversation_id, cu.id):
            raise HTTPException(status_code=403, detail="Only group admins can remove members")
        if (getattr(target, "role", "member") or "member") == "admin" and user_id != cu.id:
            admins = (
                db.query(ConversationParticipant)
                .filter(
                    ConversationParticipant.conversation_id == conversation_id,
                    ConversationParticipant.role == "admin",
                )
                .count()
            )
            if admins <= 1:
                raise HTTPException(status_code=400, detail="Cannot remove the last admin")
        db.delete(target)
        conv.updated_at = _now()
        db.commit()
        return {"removed": user_id, "conversation": _serialize_conversation(db, conv, cu.id)}

    @app.post("/api/communication/groups/{conversation_id}/admins/{user_id}")
    async def comm_make_admin(conversation_id: int, user_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        if not _is_group_admin(db, conversation_id, cu.id):
            raise HTTPException(status_code=403, detail="Only group admins can promote members")
        target = (
            db.query(ConversationParticipant)
            .filter(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
            .first()
        )
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found")
        target.role = "admin"
        conv = db.get(Conversation, conversation_id)
        db.commit()
        try:
            await _broadcast(_member_ids(db, conversation_id), {
                "type": "group_updated", "conversation_id": conversation_id,
                "conversation": _serialize_conversation(db, conv, cu.id) if conv else None,
            })
        except Exception:
            pass
        return {"success": True}

    @app.delete("/api/communication/groups/{conversation_id}/admins/{user_id}")
    async def comm_remove_admin(conversation_id: int, user_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        if not _is_group_admin(db, conversation_id, cu.id):
            raise HTTPException(status_code=403, detail="Only group admins can demote admins")
        target = (
            db.query(ConversationParticipant)
            .filter(
                ConversationParticipant.conversation_id == conversation_id,
                ConversationParticipant.user_id == user_id,
            )
            .first()
        )
        if target is None:
            raise HTTPException(status_code=404, detail="Member not found")
        conv = db.get(Conversation, conversation_id)
        creator_id = getattr(conv, "created_by", None)
        if user_id == creator_id:
            raise HTTPException(status_code=400, detail="The group creator cannot be demoted")
        if (getattr(target, "role", "member") or "member") == "admin":
            admin_count = (
                db.query(ConversationParticipant)
                .filter(
                    ConversationParticipant.conversation_id == conversation_id,
                    ConversationParticipant.role == "admin",
                )
                .count()
            )
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="A group must keep at least one admin")
        target.role = "member"
        db.commit()
        try:
            await _broadcast(_member_ids(db, conversation_id), {
                "type": "group_updated", "conversation_id": conversation_id,
                "conversation": _serialize_conversation(db, conv, cu.id) if conv else None,
            })
        except Exception:
            pass
        return {"success": True}

    # ---------- messages: list (marks incoming read) ----------
    @app.get("/api/communication/conversations/{conversation_id}/messages")
    async def comm_list_messages(
        conversation_id: int,
        limit: int = 100,
        before_id: int | None = None,
        db=Depends(get_db),
        cu=Depends(me_dep),
    ):
        _require_participant(db, conversation_id, cu.id)
        q = db.query(Message).filter(Message.conversation_id == conversation_id)
        if before_id:
            q = q.filter(Message.id < before_id)
        rows = (
            q.order_by(Message.id.desc())
            .limit(min(max(limit, 1), 200))
            .all()
        )
        rows.reverse()
        unread_before = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation_id,
                Message.sender_id != cu.id,
                Message.is_read == False,  # noqa: E712
            )
            .count()
        )
        db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.sender_id != cu.id,
            Message.is_read == False,  # noqa: E712
        ).update({"is_read": True}, synchronize_session=False)
        pref = _get_pref(db, conversation_id, cu.id)
        if rows:
            pref.last_read_message_id = rows[-1].id
        db.commit()
        data = [_serialize_message(db, m, cu.id) for m in rows]
        if unread_before > 0:
            try:
                await _broadcast(_member_ids(db, conversation_id), {
                    "type": "read", "conversation_id": conversation_id,
                    "reader_id": cu.id,
                    "last_read_message_id": (rows[-1].id if rows else None),
                }, exclude=cu.id)
            except Exception:
                pass
        return {"messages": data, "conversation_id": conversation_id}

    # ---------- messages: send (broadcasts realtime) ----------
    @app.post("/api/communication/conversations/{conversation_id}/messages")
    async def comm_send_message(
        conversation_id: int, data: MessageSendIn, db=Depends(get_db), cu=Depends(me_dep)
    ):
        _require_participant(db, conversation_id, cu.id)
        content = (data.content or "").strip()[:4000]
        if not content:
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        if data.reply_to_id:
            parent = db.get(Message, data.reply_to_id)
            if parent is None or parent.conversation_id != conversation_id:
                raise HTTPException(status_code=400, detail="Replied message not found here")
        conv = db.get(Conversation, conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        msg = Message(
            conversation_id=conversation_id, sender_id=cu.id,
            content=content, is_read=False,
            reply_to_id=data.reply_to_id,
        )
        db.add(msg)
        conv.updated_at = _now()
        db.commit()
        db.refresh(msg)
        payload = _serialize_message(db, msg, cu.id)
        await _broadcast(_member_ids(db, conversation_id), {
            "type": "message", "conversation_id": conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"success": True, "message": payload}

    # ---------- messages: edit / delete (own messages) ----------
    @app.patch("/api/communication/messages/{message_id}")
    async def comm_edit_message(message_id: int, data: MessageEditIn, db=Depends(get_db), cu=Depends(me_dep)):
        msg = db.get(Message, message_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="Message not found")
        _require_participant(db, msg.conversation_id, cu.id)
        if msg.sender_id != cu.id:
            raise HTTPException(status_code=403, detail="You can only edit your own messages")
        if getattr(msg, "is_deleted", False):
            raise HTTPException(status_code=400, detail="Message was deleted")
        content = (data.content or "").strip()[:4000]
        if not content:
            raise HTTPException(status_code=400, detail="Message cannot be empty")
        msg.content = content
        msg.edited_at = _now()
        db.commit()
        payload = _serialize_message(db, msg, cu.id)
        await _broadcast(_member_ids(db, msg.conversation_id), {
            "type": "message_updated", "conversation_id": msg.conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"message": payload}

    @app.delete("/api/communication/messages/{message_id}")
    async def comm_delete_message(message_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        msg = db.get(Message, message_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="Message not found")
        _require_participant(db, msg.conversation_id, cu.id)
        conv = db.get(Conversation, msg.conversation_id)
        admin_override = conv is not None and _conv_type(conv) == "group" and _is_group_admin(db, conv.id, cu.id)
        if msg.sender_id != cu.id and not admin_override:
            raise HTTPException(status_code=403, detail="You can only delete your own messages")
        msg.is_deleted = True
        msg.content = ""
        db.commit()
        payload = _serialize_message(db, msg, cu.id)
        await _broadcast(_member_ids(db, msg.conversation_id), {
            "type": "message_updated", "conversation_id": msg.conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"success": True, "message": payload}

    # ---------- reactions (persisted) ----------
    @app.post("/api/communication/messages/{message_id}/reactions")
    async def comm_toggle_reaction(message_id: int, data: ReactionIn, db=Depends(get_db), cu=Depends(me_dep)):
        msg = db.get(Message, message_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="Message not found")
        _require_participant(db, msg.conversation_id, cu.id)
        emoji = (data.emoji or "").strip()
        if emoji not in EMOJI_ALLOW:
            raise HTTPException(status_code=400, detail="Unsupported reaction")
        existing = (
            db.query(MessageReaction)
            .filter(
                MessageReaction.message_id == message_id,
                MessageReaction.user_id == cu.id,
                MessageReaction.emoji == emoji,
            )
            .first()
        )
        if existing is not None:
            db.delete(existing)
            action = "removed"
        else:
            db.add(MessageReaction(message_id=message_id, user_id=cu.id, emoji=emoji))
            action = "added"
        db.commit()
        payload = _serialize_message(db, msg, cu.id)
        await _broadcast(_member_ids(db, msg.conversation_id), {
            "type": "message_updated", "conversation_id": msg.conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"action": action, "message": payload}

    # ---------- pin / forward ----------
    @app.post("/api/communication/messages/{message_id}/pin")
    async def comm_pin_message(message_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        msg = db.get(Message, message_id)
        if msg is None:
            raise HTTPException(status_code=404, detail="Message not found")
        _require_participant(db, msg.conversation_id, cu.id)
        conv = db.get(Conversation, msg.conversation_id)
        if conv is not None and _conv_type(conv) == "group" and not _is_group_admin(db, conv.id, cu.id) and msg.sender_id != cu.id:
            raise HTTPException(status_code=403, detail="Only admins can pin others' messages")
        msg.is_pinned = not bool(getattr(msg, "is_pinned", False))
        db.commit()
        payload = _serialize_message(db, msg, cu.id)
        await _broadcast(_member_ids(db, msg.conversation_id), {
            "type": "message_updated", "conversation_id": msg.conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"is_pinned": bool(msg.is_pinned), "message": payload}

    @app.post("/api/communication/messages/{message_id}/forward")
    async def comm_forward_message(message_id: int, data: ForwardIn, db=Depends(get_db), cu=Depends(me_dep)):
        src = db.get(Message, message_id)
        if src is None or getattr(src, "is_deleted", False):
            raise HTTPException(status_code=404, detail="Message not found")
        _require_participant(db, src.conversation_id, cu.id)
        _require_participant(db, data.conversation_id, cu.id)
        target = db.get(Conversation, data.conversation_id)
        if target is None:
            raise HTTPException(status_code=404, detail="Target conversation not found")
        label = (src.content or "").strip()[:4000]
        if not label and not db.query(MessageAttachment).filter(MessageAttachment.message_id == src.id).count():
            raise HTTPException(status_code=400, detail="Nothing to forward")
        fwd = Message(
            conversation_id=data.conversation_id, sender_id=cu.id,
            content=label or "(attachment)", is_read=False,
            forward_from_id=src.id,
        )
        db.add(fwd)
        target.updated_at = _now()
        db.commit()
        db.refresh(fwd)
        for att in db.query(MessageAttachment).filter(MessageAttachment.message_id == src.id).all():
            db.add(MessageAttachment(
                message_id=fwd.id, conversation_id=data.conversation_id,
                uploader_id=cu.id, stored_name=att.stored_name,
                original_name=att.original_name, mime_type=att.mime_type,
                size_bytes=att.size_bytes, kind=att.kind,
            ))
        db.commit()
        payload = _serialize_message(db, fwd, cu.id)
        await _broadcast(_member_ids(db, data.conversation_id), {
            "type": "message", "conversation_id": data.conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"success": True, "message": payload}

    # ---------- preferences (pin/mute/archive) ----------
    @app.patch("/api/communication/conversations/{conversation_id}/preferences")
    def comm_preferences(conversation_id: int, data: PrefIn, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        pref = _get_pref(db, conversation_id, cu.id)
        if data.is_pinned is not None:
            pref.is_pinned = bool(data.is_pinned)
        if data.is_muted is not None:
            pref.is_muted = bool(data.is_muted)
        if data.is_archived is not None:
            pref.is_archived = bool(data.is_archived)
        db.commit()
        return {"success": True, "preferences": {
            "is_pinned": pref.is_pinned, "is_muted": pref.is_muted,
            "is_archived": pref.is_archived,
        }}

    @app.post("/api/communication/conversations/{conversation_id}/read")
    async def comm_mark_read(conversation_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        last = (
            db.query(Message.id)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.id.desc())
            .first()
        )
        unread_before = (
            db.query(Message)
            .filter(
                Message.conversation_id == conversation_id,
                Message.sender_id != cu.id,
                Message.is_read == False,  # noqa: E712
            )
            .count()
        )
        db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.sender_id != cu.id,
            Message.is_read == False,  # noqa: E712
        ).update({"is_read": True}, synchronize_session=False)
        pref = _get_pref(db, conversation_id, cu.id)
        if last:
            pref.last_read_message_id = last[0]
        db.commit()
        if unread_before > 0:
            # Real-time read receipts for the other members.
            try:
                await _broadcast(_member_ids(db, conversation_id), {
                    "type": "read", "conversation_id": conversation_id,
                    "reader_id": cu.id, "last_read_message_id": (last[0] if last else None),
                }, exclude=cu.id)
            except Exception:
                pass
        return {"success": True, "marked": int(unread_before or 0)}

    # ---------- message search + shared media ----------
    @app.get("/api/communication/search")
    def comm_search(q: str = Query("", max_length=120), limit: int = 30, db=Depends(get_db), cu=Depends(me_dep)):
        term = (q or "").strip()
        if len(term) < 2:
            return {"results": []}
        ids = [
            r.conversation_id
            for r in db.query(ConversationParticipant)
            .filter(ConversationParticipant.user_id == cu.id)
            .all()
        ]
        if not ids:
            return {"results": []}
        rows = (
            db.query(Message)
            .filter(
                Message.conversation_id.in_(ids),
                Message.content.ilike(f"%{term}%"),
                Message.is_deleted == False,  # noqa: E712
            )
            .order_by(Message.id.desc())
            .limit(min(max(limit, 1), 50))
            .all()
        )
        out = []
        for m in rows:
            conv = db.get(Conversation, m.conversation_id)
            sender = db.get(User, m.sender_id)
            cname = (getattr(conv, "group_name", None) or (sender.name if sender else "")) if conv is not None else ""
            out.append({
                "message_id": m.id, "conversation_id": m.conversation_id,
                "conversation_name": cname,
                "sender_id": m.sender_id, "sender_name": sender.name if sender else "Member",
                "content": (m.content or "")[:220], "created_at": _iso(m.created_at),
            })
        return {"results": out}

    @app.get("/api/communication/conversations/{conversation_id}/media")
    def comm_media(conversation_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        _require_participant(db, conversation_id, cu.id)
        atts = (
            db.query(MessageAttachment)
            .filter(MessageAttachment.conversation_id == conversation_id)
            .order_by(MessageAttachment.id.desc())
            .limit(200)
            .all()
        )
        media, files, links = [], [], []
        for a in atts:
            item = {
                "id": a.id, "message_id": a.message_id,
                "original_name": a.original_name, "mime_type": a.mime_type,
                "size_bytes": a.size_bytes, "kind": a.kind,
                "url": f"/api/communication/attachments/{a.id}",
            }
            (media if a.kind in ("image",) else files).append(item)
        for m in (
            db.query(Message)
            .filter(Message.conversation_id == conversation_id)
            .order_by(Message.id.desc()).limit(300).all()
        ):
            for u in URL_RE.findall(m.content or "")[:2]:
                links.append({"message_id": m.id, "url": u})
                if len(links) >= 60:
                    break
        pins = [
            _serialize_message(db, m, cu.id)
            for m in db.query(Message)
            .filter(Message.conversation_id == conversation_id, Message.is_pinned == True)  # noqa: E712
            .order_by(Message.id.desc()).limit(30).all()
        ]
        return {"media": media, "files": files, "links": links, "pinned": pins}

    # ---------- people (real users + connection state) ----------
    @app.get("/api/communication/people")
    def comm_people(q: str = Query("", max_length=120), limit: int = 25, db=Depends(get_db), cu=Depends(me_dep)):
        term = (q or "").strip()
        query = db.query(User).filter(User.id != cu.id)
        if term:
            like = f"%{term}%"
            query = query.filter(or_(
                User.name.ilike(like), User.username.ilike(like),
                User.public_id.ilike(f"%{term.upper()}%"),
                User.skills.ilike(like), User.interests.ilike(like),
                User.bio.ilike(like),
            ))
        rows = query.order_by(User.name).limit(min(max(limit, 1), 50)).all()
        out = []
        for u in rows:
            lo, hi = sorted((cu.id, u.id))
            connected = (
                db.query(Connection)
                .filter(Connection.user_one_id == lo, Connection.user_two_id == hi)
                .first()
                is not None
            )
            pending = (
                db.query(ConnectionRequest)
                .filter(
                    ConnectionRequest.status == "pending",
                    or_(
                        and_(ConnectionRequest.sender_id == cu.id, ConnectionRequest.receiver_id == u.id),
                        and_(ConnectionRequest.sender_id == u.id, ConnectionRequest.receiver_id == cu.id),
                    ),
                )
                .first()
            )
            rel = "connected" if connected else ("pending" if pending else "none")
            out.append({**(_user_summary(u) or {}), "relationship": rel})
        return {"users": out}

    # ---------- full public profile inside hub ----------
    @app.get("/api/communication/users/{user_id}")
    def comm_user_profile(user_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        user = db.get(User, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        lo, hi = sorted((cu.id, user_id))
        connected = (
            db.query(Connection)
            .filter(Connection.user_one_id == lo, Connection.user_two_id == hi)
            .first()
            is not None
        )
        pending = (
            db.query(ConnectionRequest)
            .filter(
                ConnectionRequest.status == "pending",
                or_(
                    and_(ConnectionRequest.sender_id == cu.id, ConnectionRequest.receiver_id == user_id),
                    and_(ConnectionRequest.sender_id == user_id, ConnectionRequest.receiver_id == cu.id),
                ),
            )
            .first()
        )
        try:
            projects = (
                db.query(Project).filter(Project.owner_id == user_id)
                .order_by(Project.id.desc()).limit(6).all()
            )
            proj = [{"id": p.id, "title": p.title, "description": (p.description or "")[:200]} for p in projects]
        except Exception:
            proj = []
        try:
            edu = (
                db.query(Education).filter(Education.user_id == user_id)
                .order_by(Education.id.desc()).limit(6).all()
            )
            edu_out = [{
                "institution": getattr(e, "institution", None),
                "degree": getattr(e, "degree", None),
                "field_of_study": getattr(e, "field_of_study", None),
            } for e in edu]
        except Exception:
            edu_out = []
        return {
            "user": _user_summary(user),
            "relationship": {
                "connected": connected,
                "pending": pending is not None,
                "pending_direction": (
                    "sent" if pending and pending.sender_id == cu.id
                    else ("received" if pending else None)
                ),
            },
            "projects": proj,
            "education": edu_out,
            "presence": {"online": _online(user_id), "last_seen": _last_seen(user_id)},
        }

    # ---------- attachments: upload + download (validated) ----------
    @app.post("/api/communication/conversations/{conversation_id}/attachments")
    async def comm_upload(
        conversation_id: int, file: UploadFile = File(...),
        db=Depends(get_db), cu=Depends(me_dep),
    ):
        _require_participant(db, conversation_id, cu.id)
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(data) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=400, detail="File is too large (max 10 MB)")
        mime = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
        kind = ALLOWED_UPLOADS.get(mime)
        if kind is None:
            raise HTTPException(status_code=400, detail="File type not allowed (image, PDF or document)")
        safe_base = re.sub(r"[^A-Za-z0-9._-]+", "_", (file.filename or "file"))[-80:] or "file"
        stored = f"{conversation_id}_{uuid.uuid4().hex}_{safe_base}"
        (UPLOAD_DIR / stored).write_bytes(data)
        caption = (f"[{kind}] {safe_base}").strip()[:4000]
        msg = Message(
            conversation_id=conversation_id, sender_id=cu.id,
            content=caption, is_read=False, attachment_kind=kind,
        )
        db.add(msg)
        db.flush()
        db.add(MessageAttachment(
            message_id=msg.id, conversation_id=conversation_id,
            uploader_id=cu.id, stored_name=stored,
            original_name=safe_base, mime_type=mime,
            size_bytes=len(data), kind=kind,
        ))
        conv = db.get(Conversation, conversation_id)
        if conv is not None:
            conv.updated_at = _now()
        db.commit()
        db.refresh(msg)
        payload = _serialize_message(db, msg, cu.id)
        await _broadcast(_member_ids(db, conversation_id), {
            "type": "message", "conversation_id": conversation_id, "message": payload,
        }, exclude=cu.id)
        return {"success": True, "message": payload}

    @app.get("/api/communication/attachments/{attachment_id}")
    def comm_download(attachment_id: int, db=Depends(get_db), cu=Depends(me_dep)):
        att = db.get(MessageAttachment, attachment_id)
        if att is None:
            raise HTTPException(status_code=404, detail="Attachment not found")
        _require_participant(db, att.conversation_id, cu.id)
        path = (UPLOAD_DIR / att.stored_name).resolve()
        if UPLOAD_DIR.resolve() not in path.parents or not path.is_file():
            raise HTTPException(status_code=404, detail="File not available")
        return FileResponse(
            str(path), media_type=att.mime_type,
            filename=att.original_name,
            content_disposition_type="inline" if att.kind == "image" else "attachment",
        )

    # ---------- calls: history + register + finish ----------
    @app.get("/api/communication/calls")
    def comm_call_history(limit: int = 30, db=Depends(get_db), cu=Depends(me_dep)):
        ids = [
            r.conversation_id
            for r in db.query(ConversationParticipant)
            .filter(ConversationParticipant.user_id == cu.id)
            .all()
        ]
        q = db.query(CallRecord)
        if ids:
            q = q.filter(or_(
                CallRecord.conversation_id.in_(ids),
                CallRecord.initiator_id == cu.id,
            ))
        else:
            q = q.filter(CallRecord.initiator_id == cu.id)
        rows = q.order_by(CallRecord.id.desc()).limit(min(max(limit, 1), 60)).all()
        out = []
        for c in rows:
            parts = [
                {"user_id": p.user_id, "joined_at": _iso(p.joined_at), "left_at": _iso(p.left_at)}
                for p in db.query(CallParticipant).filter(CallParticipant.call_id == c.id).all()
            ]
            peer = None
            if c.conversation_id:
                conv = db.get(Conversation, c.conversation_id)
                if conv is not None:
                    peer = _serialize_conversation(db, conv, cu.id)
            out.append({
                "id": c.id, "conversation_id": c.conversation_id,
                "room": c.room, "call_type": c.call_type,
                "initiator_id": c.initiator_id, "status": c.status,
                "started_at": _iso(c.started_at), "ended_at": _iso(c.ended_at),
                "duration_seconds": c.duration_seconds,
                "participants": parts, "peer": peer,
            })
        return {"calls": out}

    @app.post("/api/communication/conversations/{conversation_id}/calls")
    async def comm_start_call(
        conversation_id: int, data: CallCreateIn,
        db=Depends(get_db), cu=Depends(me_dep),
    ):
        _require_participant(db, conversation_id, cu.id)
        ctype = (data.call_type or "voice").lower()
        if ctype not in ("voice", "video"):
            raise HTTPException(status_code=400, detail="call_type must be voice or video")
        room = f"skillshare-{conversation_id}-{uuid.uuid4().hex[:10]}"
        rec = CallRecord(
            conversation_id=conversation_id, room=room,
            call_type=ctype, initiator_id=cu.id, status="ringing",
        )
        db.add(rec)
        db.flush()
        db.add(CallParticipant(call_id=rec.id, user_id=cu.id))
        db.commit()
        me = db.get(User, cu.id)
        await _broadcast(_member_ids(db, conversation_id), {
            "type": "call_invite", "conversation_id": conversation_id,
            "call": {"id": rec.id, "room": room, "call_type": ctype, "status": "ringing"},
            "from": _user_summary(me),
        }, exclude=cu.id)
        return {"call": {"id": rec.id, "room": room, "call_type": ctype, "status": "ringing"}}

    @app.post("/api/communication/calls/{call_id}")
    async def comm_finish_call(call_id: int, data: CallStatusIn, db=Depends(get_db), cu=Depends(me_dep)):
        rec = db.get(CallRecord, call_id)
        if rec is None:
            raise HTTPException(status_code=404, detail="Call not found")
        if rec.conversation_id:
            _require_participant(db, rec.conversation_id, cu.id)
        elif rec.initiator_id != cu.id:
            raise HTTPException(status_code=403, detail="Not your call")
        status = (data.status or "").lower()
        if status not in ("accepted", "declined", "missed", "ended"):
            raise HTTPException(status_code=400, detail="Invalid status")
        rec.status = status
        if status == "ended":
            rec.ended_at = _now()
            try:
                rec.duration_seconds = int(data.duration_seconds or 0) or None
            except Exception:
                rec.duration_seconds = None
        existing = (
            db.query(CallParticipant)
            .filter(CallParticipant.call_id == call_id, CallParticipant.user_id == cu.id)
            .first()
        )
        if existing is None:
            db.add(CallParticipant(call_id=call_id, user_id=cu.id))
        elif status in ("ended", "declined", "missed"):
            existing.left_at = _now()
        db.commit()
        if rec.conversation_id:
            await _broadcast(_member_ids(db, rec.conversation_id), {
                "type": "call_update", "conversation_id": rec.conversation_id,
                "call": {"id": rec.id, "status": status, "room": rec.room},
            }, exclude=cu.id)
        return {"success": True, "status": status}

    # ---------- realtime WebSocket (JWT in query; member-gated) ----------
    @app.websocket("/ws/communication")
    async def comm_socket(ws: WebSocket):
        await ws.accept()
        user_id: int | None = None
        try:
            token = ws.query_params.get("token", "")
            payload = authmod.decode_access_token(token) if token else None
            if not payload or payload.get("sub") is None:
                await ws.send_text(json.dumps({"type": "error", "detail": "Not authenticated"}))
                await ws.close(code=4401)
                return
            user_id = int(payload["sub"])
            db = _db_for_ws()
            try:
                if db.get(User, user_id) is None:
                    await ws.send_text(json.dumps({"type": "error", "detail": "User no longer exists"}))
                    await ws.close(code=4401)
                    return
            finally:
                db.close()
        except Exception:
            try:
                await ws.close(code=4401)
            except Exception:
                pass
            return
        _SOCKETS.setdefault(user_id, set()).add(ws)
        _PRESENCE[user_id] = time.time()
        try:
            await ws.send_text(json.dumps({"type": "hello", "user_id": user_id}))
        except Exception:
            pass
        try:
            while True:
                raw = await ws.receive_text()
                try:
                    evt = json.loads(raw)
                except Exception:
                    continue
                kind = str(evt.get("type", "")).lower()
                _PRESENCE[user_id] = time.time()
                db = _db_for_ws()
                try:
                    if kind == "ping":
                        await ws.send_text(json.dumps({"type": "pong"}))
                    elif kind == "typing":
                        cid = int(evt.get("conversation_id", 0) or 0)
                        if cid and _is_participant(db, cid, user_id):
                            me = db.get(User, user_id)
                            await _broadcast(_member_ids(db, cid), {
                                "type": "typing", "conversation_id": cid,
                                "user_id": user_id, "name": me.name if me else "Someone",
                                "is_typing": bool(evt.get("is_typing", True)),
                            }, exclude=user_id)
                    elif kind in ("offer", "answer", "ice", "call_leave", "call_state", "read", "call_join"):
                        cid = int(evt.get("conversation_id", 0) or 0)
                        if cid and _is_participant(db, cid, user_id):
                            # Targeted delivery when "to" is present (call
                            # signaling within groups); broadcast otherwise.
                            to_raw = evt.get("to")
                            to_uid = int(to_raw) if str(to_raw or "").isdigit() else None
                            targets = [to_uid] if to_uid is not None else _member_ids(db, cid)
                            await _broadcast(targets, {
                                **evt, "from_user": user_id,
                            }, exclude=user_id)
                finally:
                    db.close()
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            try:
                _SOCKETS.get(user_id, set()).discard(ws)
            except Exception:
                pass
            _PRESENCE[user_id] = time.time()

    @app.get("/api/communication/presence")
    def comm_presence(user_ids: str = Query(""), db=Depends(get_db), cu=Depends(me_dep)):
        wanted = [int(x) for x in user_ids.split(",") if x.strip().isdigit()][:50]
        out = {}
        for uid in wanted:
            out[str(uid)] = {"online": _online(uid), "last_seen": _last_seen(uid)}
        return {"presence": out}
