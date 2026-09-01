"""SkillShare - DEVELOPMENT / DEMO seed data.

Creates demo users, pending connection requests, one accepted
connection and a conversation with a few starter messages so the
Requests <-> Messages flow can be tested immediately.

This is deliberately separated from production data and is safe to
run repeatedly (it never creates duplicates).

Run from the backend-I folder:

    python seed_demo.py

Demo logins (password is "123456" for all):
    demo@skillshare.com   (Aniket Deshmukh - has incoming requests)
    alex@skillshare.com
    priya@skillshare.com
    rahul@skillshare.com
    neha@skillshare.com
    rohit@skillshare.com
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from database import Base, engine, SessionLocal
from models import (
    User,
    ConnectionRequest,
    Connection,
    Conversation,
    ConversationParticipant,
    Message,
)
import auth

DEMO_USERS = [
    {"email": "demo@skillshare.com", "password": "123456", "name": "Aniket Deshmukh"},
    {"email": "alex@skillshare.com", "password": "123456", "name": "Alex Johnson"},
    {"email": "priya@skillshare.com", "password": "123456", "name": "Priya Sharma"},
    {"email": "rahul@skillshare.com", "password": "123456", "name": "Rahul Patil"},
    {"email": "neha@skillshare.com", "password": "123456", "name": "Neha Kapoor"},
    {"email": "rohit@skillshare.com", "password": "123456", "name": "Rohit Mehta"},
]

# Incoming pending requests: (sender_email, message, skill, rating)
INCOMING_REQUESTS = [
    (
        "alex@skillshare.com",
        "Interested in practicing English conversation.",
        "English Speaking",
        4.8,
    ),
    (
        "priya@skillshare.com",
        "Would love to exchange Python knowledge.",
        "Python Programming",
        4.9,
    ),
    (
        "rahul@skillshare.com",
        "Let's exchange frontend development skills.",
        "Web Development",
        4.7,
    ),
    (
        "neha@skillshare.com",
        "Could you review my portfolio? Happy to share UI/UX tips too.",
        "UI/UX Design",
        4.6,
    ),
]

# Outgoing pending request: demo user -> Rohit
OUTGOING_REQUEST = (
    "rohit@skillshare.com",
    "Would you like to practice English conversation together?",
    "English Speaking",
    4.8,
)


def find_pair_conversation(db, a, b):
    """Return the single conversation shared by exactly users a and b."""
    pairs = (
        db.query(ConversationParticipant.conversation_id)
        .filter(ConversationParticipant.user_id.in_([a, b]))
        .group_by(ConversationParticipant.conversation_id)
        .having(func.count(ConversationParticipant.id) == 2)
        .all()
    )
    for (cid,) in pairs:
        pids = [
            row.user_id
            for row in db.query(ConversationParticipant.user_id)
            .filter(ConversationParticipant.conversation_id == cid)
            .all()
        ]
        if sorted(pids) == sorted((a, b)):
            return db.get(Conversation, cid)
    

# ----------------------------------------------------------
# Main seeding logic
# ----------------------------------------------------------

def main():
    Base.metadata.create_all(bind=engine)
    db: Session = SessionLocal()
    created_users = []
    try:
        users = {}
        for info in DEMO_USERS:
            user = db.query(User).filter(User.email == info["email"]).first()
            if user is None:
                user = User(
                    name=info["name"],
                    email=info["email"],
                    password_hash=auth.hash_password(info["password"]),
                )
                db.add(user)
                db.flush()
                created_users.append(info["email"])
            users[info["email"]] = user

        demo = users["demo@skillshare.com"]

        # --- Incoming pending requests (sent to the demo user) ---
        for sender_email, message, skill, rating in INCOMING_REQUESTS:
            sender = users[sender_email]
            exists = (
                db.query(ConnectionRequest)
                .filter(
                    ConnectionRequest.sender_id == sender.id,
                    ConnectionRequest.receiver_id == demo.id,
                    ConnectionRequest.status == "pending",
                )
                .first()
            )
            if exists is None:
                db.add(
                    ConnectionRequest(
                        sender_id=sender.id,
                        receiver_id=demo.id,
                        status="pending",
                        message=message,
                        skill=skill,
                        rating=rating,
                    )
                )

        # --- Outgoing pending request (demo user -> Rohit) ---
        rohit = users["rohit@skillshare.com"]
        out_email, out_message, out_skill, out_rating = OUTGOING_REQUEST
        exists = (
            db.query(ConnectionRequest)
            .filter(
                ConnectionRequest.sender_id == demo.id,
                ConnectionRequest.receiver_id == rohit.id,
                ConnectionRequest.status == "pending",
            )
            .first()
        )
        if exists is None:
            db.add(
                ConnectionRequest(
                    sender_id=demo.id,
                    receiver_id=rohit.id,
                    status="pending",
                    message=out_message,
                    skill=out_skill,
                    rating=out_rating,
                )
            )

        # --- Accepted connection: demo <-> Alex, with a live conversation ---
        alex = users["alex@skillshare.com"]
        lo, hi = sorted((demo.id, alex.id))
        connection = (
            db.query(Connection)
            .filter(Connection.user_one_id == lo, Connection.user_two_id == hi)
            .first()
        )
        if connection is None:
            connection = Connection(user_one_id=lo, user_two_id=hi, status="active")
            db.add(connection)
            db.flush()

        conversation = find_pair_conversation(db, lo, hi)
        if conversation is None:
            conversation = Conversation()
            db.add(conversation)
            db.flush()
            db.add(ConversationParticipant(conversation_id=conversation.id, user_id=lo))
            db.add(ConversationParticipant(conversation_id=conversation.id, user_id=hi))

        if (
            db.query(Message)
            .filter(Message.conversation_id == conversation.id)
            .first()
            is None
        ):
            db.add(
                Message(
                    conversation_id=conversation.id,
                    sender_id=alex.id,
                    content="Hey! I just accepted your request. Ready to practice English?",
                )
            )
            db.add(
                Message(
                    conversation_id=conversation.id,
                    sender_id=demo.id,
                    content="Awesome! Looking forward to it. What time works best for you?",
                )
            )

        db.commit()

        print("=" * 60)
        print("SkillShare demo seed complete.")
        print("=" * 60)
        if created_users:
            print("Created users:", ", ".join(created_users))
        else:
            print("All demo users already existed (idempotent run - nothing recreated).")
        print()
        print("Login with any of these (password: 123456):")
        for info in DEMO_USERS:
            print(f"  {info['email']}  ({info['name']})")
        print()
        print("The demo user has:")
        print("  - 4 incoming pending requests (Alex, Priya, Rahul, Neha)")
        print("  - 1 outgoing pending request (Rohit)")
        print("  - 1 active connection + conversation with Alex")
        print()
        print("Tip: log in as both demo@skillshare.com and alex@skillshare.com")
        print("     (in two browsers) to test accept -> message flow.")
    finally:
        db.close()

# ----------------------------------------------------------


if __name__ == "__main__":
    main()

