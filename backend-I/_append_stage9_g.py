import pathlib
p = pathlib.Path('stage9_service.py')
with open(p, 'a', encoding='utf-8') as f:
    f.write('''

def get_conversations(db, user_id):
    rows = db.query(CareerCoachConversation).filter(
        CareerCoachConversation.user_id == user_id
    ).order_by(CareerCoachConversation.updated_at.desc()).all()
    return [{"id": c.id, "title": c.title or "New conversation", "mode": c.mode,
             "created_at": _iso(c.created_at), "updated_at": _iso(c.updated_at),
             "message_count": len(c.messages)} for c in rows]


def get_conversation(db, user_id, conv_id):
    conv = db.query(CareerCoachConversation).filter(
        CareerCoachConversation.id == conv_id,
        CareerCoachConversation.user_id == user_id).first()
    if not conv:
        return None
    return {"id": conv.id, "title": conv.title or "New conversation", "mode": conv.mode,
            "created_at": _iso(conv.created_at), "updated_at": _iso(conv.updated_at),
            "messages": [{"id": m.id, "role": m.role, "content": m.content,
                          "created_at": _iso(m.created_at)} for m in conv.messages]}


def create_conversation(db, user_id, mode="general", title=None):
    if mode not in CAREER_COACH_MODES:
        mode = "general"
    conv = CareerCoachConversation(user_id=user_id, mode=mode,
                                   title=title or "New conversation")
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {"id": conv.id, "title": conv.title, "mode": conv.mode,
            "created_at": _iso(conv.created_at), "updated_at": _iso(conv.updated_at),
            "messages": []}


def delete_conversation(db, user_id, conv_id):
    conv = db.query(CareerCoachConversation).filter(
        CareerCoachConversation.id == conv_id,
        CareerCoachConversation.user_id == user_id).first()
    if not conv:
        return False
    db.delete(conv)
    db.commit()
    return True


def add_message(db, conv_id, user_id, role, content):
    conv = db.query(CareerCoachConversation).filter(
        CareerCoachConversation.id == conv_id,
        CareerCoachConversation.user_id == user_id).first()
    if not conv:
        return None
    msg = CareerCoachMessage(conversation_id=conv_id, role=role, content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return {"id": msg.id, "role": msg.role, "content": msg.content,
            "created_at": _iso(msg.created_at)}
''')
print("Part 7 done")
