"""Expand catalog with YouTube lectures for Python and JavaScript."""
from database import SessionLocal
from models import LearningResource
from sqlalchemy import func

def find(db, title, skill):
    return db.query(LearningResource).filter(
        func.lower(LearningResource.title) == title.strip().lower(),
        func.lower(LearningResource.skill) == skill.strip().lower()).first()

def add(db, title, skill, topic, provider, url, difficulty, rtype, source, order=1,
        course_key=None, course_title=None):
    if find(db, title, skill):
        return None
    cat_map = {"python": "Technology", "javascript": "Technology"}
    cat = cat_map.get(skill.lower(), "Technology")
    row = LearningResource(
        title=title,
        description="%s - %s." % (title, topic or skill),
        provider=provider, resource_type=rtype, skill=skill, topic=topic,
        url=url, thumbnail_url=None, difficulty=difficulty,
        estimated_duration="Self-paced", course_key=course_key,
        course_title=course_title, lecture_order=order, is_lecture=True,
        category=cat, source_platform=source, published_date=None)
    db.add(row)
    db.flush()
    print("ADDED %s" % title)
    return row

def main():
    db = SessionLocal()
    try:
        py = [
            ("Python Introduction & Setup", "Python", "Getting started", "freeCodeCamp", "https://www.youtube.com/watch?v=rfscVS0vtbw", "beginner", "video", "YouTube", 1),
            ("Python Variables & Data Types", "Python", "Variables", "Corey Schafer", "https://www.youtube.com/watch?v=khKv-8q7YmY", "beginner", "video", "YouTube", 2),
            ("Python Control Flow", "Python", "Conditionals", "Corey Schafer", "https://www.youtube.com/watch?v=DZwmZ8Usvnk", "beginner", "video", "YouTube", 3),
            ("Python Functions", "Python", "Functions", "Corey Schafer", "https://www.youtube.com/watch?v=9Os0o3wzS_I", "beginner", "video", "YouTube", 4),
            ("Python OOP", "Python", "Object-oriented", "Corey Schafer", "https://www.youtube.com/watch?v=ZDa-Z5JzLYM", "intermediate", "video", "YouTube", 5),
            ("Python Modules & Packages", "Python", "Modules", "Corey Schafer", "https://www.youtube.com/watch?v=CqvZ3vGoGs0", "beginner", "video", "YouTube", 6),
            ("Python File Handling", "Python", "Files", "Corey Schafer", "https://www.youtube.com/watch?v=Uh2ebFW8OYM", "beginner", "video", "YouTube", 7),
            ("Python Exceptions", "Python", "Error handling", "Corey Schafer", "https://www.youtube.com/watch?v=NIWwJbo-9_8", "beginner", "video", "YouTube", 8),
        ]
        for t in py:
            add(db, *t, course_key="python-fundamentals", course_title="Python Fundamentals")
        js = [
            ("JavaScript Introduction", "JavaScript", "Getting started", "freeCodeCamp", "https://www.youtube.com/watch?v=PkZNo7MFNFg", "beginner", "video", "YouTube", 1),
            ("JS Variables & Data Types", "JavaScript", "Variables", "Net Ninja", "https://www.youtube.com/watch?v=qoSksQ4s_hg", "beginner", "video", "YouTube", 2),
            ("JS Functions & Scope", "JavaScript", "Functions", "Net Ninja", "https://www.youtube.com/watch?v=N8ap4k_1QEQ", "beginner", "video", "YouTube", 3),
            ("JS Arrays & Objects", "JavaScript", "Data structures", "Net Ninja", "https://www.youtube.com/watch?v=R8rmfD9Yw_c", "beginner", "video", "YouTube", 4),
            ("DOM Fundamentals", "JavaScript", "DOM", "Net Ninja", "https://www.youtube.com/watch?v=0ik6X4DJKCc", "intermediate", "video", "YouTube", 5),
            ("Async JavaScript", "JavaScript", "Async/await", "Traversy Media", "https://www.youtube.com/watch?v=PoRJizFvM7s", "intermediate", "video", "YouTube", 6),
        ]
        for t in js:
            add(db, *t, course_key="javascript-fundamentals", course_title="JavaScript Fundamentals")
        db.commit()
        print("DONE. Total: %d" % db.query(LearningResource).count())
    except Exception as e:
        db.rollback()
        print("FAILED: %s" % e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
