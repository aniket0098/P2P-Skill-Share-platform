from database import SessionLocal
from models import SandboxChallenge, SandboxTask, SandboxResource, SandboxChallengeSkill

db = SessionLocal()
print("Challenges:", db.query(SandboxChallenge).count())
print("Tasks:", db.query(SandboxTask).count())
print("Resources:", db.query(SandboxResource).count())
print("ChallengeSkills:", db.query(SandboxChallengeSkill).count())
print()
ch = db.query(SandboxChallenge).first()
if ch:
    print("First challenge:", ch.title)
    print("  tasks:", len(ch.tasks) if ch.tasks else 0)
    print("  resources:", len(ch.resources) if ch.resources else 0)
    print("  skills:", len(ch.skills) if ch.skills else 0)
    if ch.skills:
        for cs in ch.skills[:3]:
            print(f"    skill: {cs.skill.name if cs.skill else 'None'}")
db.close()