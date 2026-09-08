from database import SessionLocal
from models import LearningResource

db = SessionLocal()
count = db.query(LearningResource).count()
skills = [r[0] for r in db.query(LearningResource.skill).distinct().all()]
providers = [r[0] for r in db.query(LearningResource.provider).distinct().all()]

with open("_lr_count.txt", "w") as f:
    f.write(f"COUNT={count}\n")
    f.write(f"SKILLS={skills}\n")
    f.write(f"PROVIDERS={providers}\n")

rows = db.query(LearningResource).limit(5).all()
with open("_lr_sample.txt", "w") as f:
    for r in rows:
        f.write(f"id={r.id} skill={r.skill} type={r.resource_type} provider={r.provider} title={r.title[:60]}\n")

db.close()
print("done")
