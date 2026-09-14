"""Runner: idempotent explore catalog enrichment."""
from sqlalchemy import func
from database import SessionLocal
from models import LearningResource, Skill
from seed_explore_part1 import UPDATES_BY_URL
from seed_explore_part2a import NEW_A
from seed_explore_part2b import NEW_B

CATS = {"Python": "Technology", "JavaScript": "Technology",
        "English Speaking": "Communication",
        "Professional Communication": "Communication",
        "Public Speaking": "Communication", "Business Writing": "Communication",
        "Interview Communication": "Communication",
        "Resume Building": "Career", "Interview Preparation": "Career",
        "Team Collaboration": "Career", "Problem Solving": "Career",
        "Aptitude": "Career", "LinkedIn Profile Building": "Career",
        "Excel": "Business", "Data Analysis": "Business",
        "Project Management": "Business", "Design Thinking": "Business",
        "Entrepreneurship": "Business"}


def _full_rows():
    rows = []
    for s in NEW_A:
        rows.append({
            "title": s["t"], "description": "Project-hosted sample lecture for real watch-time tracking.",
            "provider": "SkillShare Samples", "resource_type": "video",
            "skill": s["skill"], "topic": s["topic"],
            "category": CATS.get(s["skill"], "Technology"),
            "url": s["u"], "media_url": s["m"], "thumbnail_url": None,
            "difficulty": "beginner", "estimated_duration": ("%d min" % (s["dur"] // 60)),
            "duration_seconds": s["dur"], "course_key": s["ck"],
            "course_title": s["ct"], "lecture_order": s["ord"],
            "is_lecture": True, "source_platform": "SkillShare Samples",
            "published_date": None})
    for (t, skill, topic, prov, url, diff, est, ck, ct, order) in NEW_B:
        rows.append({
            "title": t, "description": ("%s course: %s." % (prov, t)),
            "provider": prov, "resource_type": "course",
            "skill": skill, "topic": topic,
            "category": CATS.get(skill, "Technology"),
            "url": url, "media_url": None, "thumbnail_url": None,
            "difficulty": diff, "estimated_duration": est,
            "duration_seconds": None, "course_key": ck,
            "course_title": ct, "lecture_order": order,
            "is_lecture": False, "source_platform": prov,
            "published_date": None})
    return rows


def main():
    db = SessionLocal()
    try:
        print("before:", db.query(func.count(LearningResource.id)).scalar())
        upd = 0
        for url, fields in UPDATES_BY_URL.items():
            row = db.query(LearningResource).filter(
                LearningResource.url == url).first()
            if row is None:
                continue
            for k, v in fields.items():
                if getattr(row, k) != v:
                    setattr(row, k, v)
                    upd += 1
        db.commit()
        ins, ref = 0, 0
        for res in _full_rows():
            row = db.query(LearningResource).filter(
                LearningResource.url == res["url"]).first()
            if row is None:
                db.add(LearningResource(**res))
                ins += 1
                continue
            ch = False
            for k, v in res.items():
                if getattr(row, k) != v:
                    setattr(row, k, v)
                    ch = True
            if ch:
                ref += 1
        db.commit()
        for row in db.query(LearningResource).filter(
                LearningResource.category.is_(None)).all():
            row.category = CATS.get((row.skill or "").strip(), "Technology")
        db.commit()
        for name in set(CATS.values()):
            pass
        for skill in sorted({r["skill"] for r in _full_rows()}):
            ex = db.query(Skill).filter(
                func.lower(Skill.name) == skill.lower()).first()
            if ex is None:
                db.add(Skill(name=skill, category=CATS.get(skill, "Technology")))
        db.commit()
        print(f"updated_fields={upd} inserted={ins} refreshed={ref}")
        print("after:", db.query(func.count(LearningResource.id)).scalar())
        for skill, n in sorted(db.query(
                LearningResource.skill, func.count(LearningResource.id)
                ).group_by(LearningResource.skill).all()):
            print(f"  {skill}: {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
