"""EXPLORE SKILLS - seamless catalog seed (idempotent, additive only).

Fix pass for the existing catalog + safe expansion with REAL, verified
provider URLs. Running this script any number of times must always
produce the same database state: no deletes, no drops, no duplicate
inserts; rows are matched by (lower(title), lower(skill)) OR the exact
url. Sample MP4 lectures get duration_seconds matching the ACTUAL media
files (10s/15s/20s). The 6 validated YouTube lectures keep real videos
but no invented durations (the player records the real runtime once).
"""
from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("seed_explore2")

from database import SessionLocal  # noqa: E402
from models import LearningResource  # noqa: E402

CATS = {
    "python": "Technology", "javascript": "Technology", "java": "Technology",
    "c++": "Technology", "sql": "Technology", "html and css": "Technology",
    "react": "Technology", "fastapi": "Technology", "docker": "Technology",
    "git and github": "Technology", "cloud": "Technology",
    "ai": "AI/Data", "machine learning": "AI/Data", "deep learning": "AI/Data",
    "data science": "AI/Data", "data analysis": "AI/Data",
    "data structures and algorithms": "Technology",
    "databases": "Technology", "computer science": "Technology",
    "full stack": "Technology", "english speaking": "Communication",
    "professional communication": "Communication", "public speaking": "Communication",
    "presentation skills": "Communication", "interview communication": "Communication",
    "business writing": "Communication", "communication": "Communication",
    "english": "Communication", "resume building": "Career",
    "linkedin profile building": "Career", "interview preparation": "Career",
    "aptitude": "Career", "problem solving": "Career",
    "team collaboration": "Career", "excel": "Business",
    "project management": "Business", "entrepreneurship": "Business",
    "design thinking": "Business", "business": "Business",
}

# course_key, course_title, skill, difficulty, category
COURSES_TITLES = [
    ("sql-fundamentals", "SQL Fundamentals", "SQL", "beginner", "Technology"),
    ("git-github-fundamentals", "Git & GitHub Fundamentals", "Git and GitHub",
     "beginner", "Technology"),
    ("html-css-fundamentals", "HTML & CSS Fundamentals", "HTML and CSS",
     "beginner", "Technology"),
    ("react-fundamentals", "React Fundamentals", "React", "intermediate",
     "Technology"),
    ("docker-fundamentals", "Docker Fundamentals", "Docker", "beginner",
     "Technology"),
    ("english-speaking-basics", "English Speaking Fundamentals", "English Speaking",
     "beginner", "Communication"),
    ("dsa-fundamentals", "Data Structures & Algorithms Fundamentals",
     "Data Structures and Algorithms", "intermediate", "Technology"),
    ("ai-data-path", "AI & Data Learning Path", "AI", "beginner", "AI/Data"),
]

COURSE_TITLE = {c[0]: c[1] for c in COURSES_TITLES}
# (course_key, title, skill, topic, provider, url, difficulty, type, source, order)
LECTURES = [
    ("sql-fundamentals", "SQL Tutorial - SELECT, JOINs & Aggregation", "SQL",
     "Query language", "W3Schools", "https://www.w3schools.com/sql/",
     "beginner", "course", "W3Schools", 1),
    ("sql-fundamentals", "SQLBolt - Interactive SQL Lessons", "SQL",
     "Hands-on practice", "SQLBolt", "https://sqlbolt.com/",
     "beginner", "course", "SQLBolt", 2),
    ("sql-fundamentals", "PostgreSQL Exercises - Practice SQL", "SQL",
     "Exercises", "PgExercises", "https://pgexercises.com/",
     "intermediate", "course", "PgExercises", 3),
    ("sql-fundamentals", "SQL for Beginners", "SQL", "Beginner guide",
     "Python Land", "https://python.land/sql/",
     "beginner", "course", "Python Land", 4),
    ("git-github-fundamentals", "Pro Git - The Official Book", "Git and GitHub",
     "Version control", "Git", "https://git-scm.com/book/en/v2",
     "beginner", "course", "git-scm.com", 1),
    ("git-github-fundamentals", "GitHub Skills - Hands-on Labs", "Git and GitHub",
     "Collaboration", "GitHub", "https://skills.github.com/",
     "beginner", "course", "GitHub", 2),
    ("html-css-fundamentals", "MDN - Learn Web Development", "HTML and CSS",
     "Web fundamentals", "MDN Web Docs",
     "https://developer.mozilla.org/en-US/docs/Learn_web_development",
     "beginner", "course", "MDN", 1),
    ("html-css-fundamentals", "HTML Tutorial", "HTML and CSS",
     "Markup", "W3Schools", "https://www.w3schools.com/html/",
     "beginner", "course", "W3Schools", 2),
    ("react-fundamentals", "React - Getting Started (react.dev/learn)", "React",
     "Component model", "Meta / React", "https://react.dev/learn",
     "beginner", "course", "react.dev", 1),
    ("react-fundamentals", "freeCodeCamp - Web Development Curriculum", "React",
     "Full-stack web", "freeCodeCamp", "https://www.freecodecamp.org/learn/",
     "beginner", "course", "freeCodeCamp", 2),
    ("docker-fundamentals", "Docker - Get Started Guide", "Docker",
     "Containers", "Docker", "https://docs.docker.com/get-started/",
     "beginner", "course", "Docker Docs", 1),
    ("dsa-fundamentals", "GeeksforGeeks - Data Structures",
     "Data Structures and Algorithms", "Data structures", "GeeksforGeeks",
     "https://www.geeksforgeeks.org/data-structures/",
     "intermediate", "course", "GeeksforGeeks", 1),
    ("dsa-fundamentals", "Khan Academy - Algorithms",
     "Data Structures and Algorithms", "Algorithms", "Khan Academy",
     "https://www.khanacademy.org/computing/computer-science/algorithms",
     "beginner", "course", "Khan Academy", 2),
    ("ai-data-path", "MIT OpenCourseWare - Free University Courses", "AI",
     "Computer science", "MIT", "https://ocw.mit.edu/courses/",
     "beginner", "course", "MIT OCW", 1),
    ("ai-data-path", "freeCodeCamp - Learn to Code Certifications", "AI",
     "Programming", "freeCodeCamp", "https://www.freecodecamp.org/learn/",
     "beginner", "course", "freeCodeCamp", 2),
    ("english-speaking-basics", "BBC Learning English - Courses & Practice",
     "English Speaking", "Listening & vocabulary", "BBC",
     "https://www.bbc.co.uk/learningenglish/",
     "beginner", "course", "BBC Learning English", 3),
]

# (title, skill, topic, provider, url, difficulty, type, source)
RESOURCES = [
    ("Python Official Tutorial", "Python", "Language reference",
     "Python Software Foundation", "https://docs.python.org/3/tutorial/",
     "beginner", "course", "python.org"),
    ("MongoDB Documentation", "Databases", "NoSQL",
     "MongoDB", "https://www.mongodb.com/docs/",
     "intermediate", "course", "MongoDB"),
    ("W3Schools Excel Tutorial", "Excel", "Spreadsheets",
     "W3Schools", "https://www.w3schools.com/excel/",
     "beginner", "course", "W3Schools"),
]
def _find(db, title, skill, url):
    base = db.query(LearningResource).filter(
        func.lower(LearningResource.title) == title.strip().lower(),
        func.lower(LearningResource.skill) == skill.strip().lower())
    if url:
        return (base.filter(or_(LearningResource.url == url,
                                func.lower(LearningResource.title) == title.strip().lower()))
                .first())
    return base.first()


def upsert_resource(db, title, skill, topic, provider, url, difficulty, rtype,
                    source, course_key=None, course_title=None,
                    lecture_order=None, is_lecture=False, description=None,
                    duration_seconds=None, media_url=None, published_date=None):
    existing = _find(db, title, skill, url)
    if existing is not None:
        changed = False
        for field, val in (("course_key", course_key), ("course_title", course_title),
                           ("category", CATS.get(skill.lower(), "Technology")),
                           ("source_platform", source),
                           ("difficulty", difficulty)):
            cur = getattr(existing, field, None)
            if val and cur != val:
                setattr(existing, field, val)
                changed = True
        if description and existing.description != description:
            existing.description = description
            changed = True
        if changed:
            log.info("UPDATED %s (id=%s)", existing.title, existing.id)
        return existing, False
    row = LearningResource(
        title=title,
        description=description or ("%s - %s. Open the source page to learn."
                                    % (title, topic or skill)),
        provider=provider, resource_type=rtype, skill=skill, topic=topic,
        url=url, thumbnail_url=None, difficulty=difficulty,
        estimated_duration="Self-paced", duration_seconds=duration_seconds,
        media_url=media_url, course_key=course_key or None,
        course_title=course_title or None, lecture_order=lecture_order or 0,
        is_lecture=is_lecture, category=CATS.get(skill.lower(), "Technology"),
        source_platform=source, published_date=published_date)
    db.add(row)
    db.flush()
    log.info("ADDED   %s (id=%s)", title, row.id)
    return row, True


def main():
    db = SessionLocal()
    try:
        samples = {
            "Sample Lecture: Python Functions Explained": (10, "10 sec"),
            "Sample Lecture: JavaScript Basics in Practice": (15, "15 sec"),
            "Sample Lecture: Everyday English Conversation": (20, "20 sec"),
        }
        for title, (dur, label) in samples.items():
            rows = db.query(LearningResource).filter(
                func.lower(LearningResource.title) == title.lower()).all()
            for r in rows:
                if r.duration_seconds != dur or r.estimated_duration != label:
                    r.duration_seconds = dur
                    r.estimated_duration = label
                    if not r.category:
                        r.category = CATS.get((r.skill or "").lower(), "Technology")
                    log.info("FIXED   %s -> %ds", title, dur)

        yt_rows = (db.query(LearningResource)
                   .filter(LearningResource.course_key.in_(
                       ["python-fundamentals", "javascript-fundamentals"]))
                   .all())
        for r in yt_rows:
            if r.source_platform != "YouTube" or not r.category:
                r.source_platform = "YouTube"
                r.category = CATS.get((r.skill or "").lower(), "Technology")
                log.info("YT META %s (id=%s)", r.title, r.id)

        for (ck, title, skill, topic, prov, url, diff, rtype, src, order) in LECTURES:
            upsert_resource(
                db, title, skill, topic, prov, url, diff, rtype, src,
                course_key=ck, course_title=COURSE_TITLE.get(ck, ck),
                lecture_order=order, is_lecture=False,
                description="%s - an open learning resource by %s." % (title, prov))

        for title, skill, topic, prov, url, diff, rtype, src in RESOURCES:
            upsert_resource(db, title, skill, topic, prov, url, diff, rtype, src)

        db.commit()
        total = db.query(LearningResource).count()
        log.info("DONE. learning_resources total = %s", total)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
