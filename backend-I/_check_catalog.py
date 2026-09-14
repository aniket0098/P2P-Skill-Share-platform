from database import SessionLocal
from models import LearningResource

db = SessionLocal()
rows = db.query(LearningResource).order_by(LearningResource.id).all()
print(f"Total resources: {len(rows)}")
for r in rows:
    ck = r.course_key or "standalone"
    print(f"{r.id:3d} | {r.skill:30s} | {ck:25s} | {r.title[:50]}")
db.close()
