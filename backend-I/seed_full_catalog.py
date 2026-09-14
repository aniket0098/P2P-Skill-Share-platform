"""Part 1: Imports, constants, helpers."""
from __future__ import annotations
import logging, sys, json
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import func, or_
load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("seed_full")
from database import SessionLocal
from models import LearningResource

CATS = {
    "python": "Technology", "javascript": "Technology", "html and css": "Technology",
    "sql": "Technology", "git and github": "Technology", "fastapi": "Technology",
    "docker": "Technology", "data structures and algorithms": "Technology",
    "ai fundamentals": "AI/Data", "generative ai fundamentals": "AI/Data",
    "machine learning fundamentals": "AI/Data", "neural networks introduction": "AI/Data",
    "data analysis fundamentals": "AI/Data", "pandas fundamentals": "AI/Data",
    "numpy fundamentals": "AI/Data", "data visualization": "AI/Data",
    "introduction to llms": "AI/Data", "prompt engineering fundamentals": "AI/Data",
    "english speaking": "Communication", "everyday english conversation": "Communication",
    "english grammar for speaking": "Communication", "vocabulary building": "Communication",
    "pronunciation practice": "Communication", "listening practice": "Communication",
    "fluency building": "Communication", "professional english": "Communication",
    "workplace communication": "Communication", "email communication": "Communication",
    "business writing": "Communication", "presentation skills": "Communication",
    "public speaking": "Communication", "group discussion": "Communication",
    "interview communication": "Communication",
    "resume building": "Career", "linkedin profile building": "Career",
    "interview preparation": "Career", "aptitude fundamentals": "Career",
    "logical reasoning": "Career", "quantitative aptitude": "Career",
    "problem solving": "Career", "team collaboration": "Career",
    "time management": "Career", "professional networking": "Career",
    "excel fundamentals": "Business", "data analysis with excel": "Business",
    "project management fundamentals": "Business", "design thinking": "Business",
    "entrepreneurship fundamentals": "Business", "product management basics": "Business",
}

def _find(db, title, skill, url=None):
    q = db.query(LearningResource).filter(
        func.lower(LearningResource.title) == title.strip().lower(),
        func.lower(LearningResource.skill) == skill.strip().lower())
    if url:
        q = q.filter(or_(LearningResource.url == url,
                         func.lower(LearningResource.title) == title.strip().lower()))
    return q.first()

def upsert(db, title, skill, topic, provider, url, difficulty, rtype, source,
           course_key=None, course_title=None, lecture_order=0, is_lecture=True,
           description=None, media_url=None, duration_seconds=0):
    existing = _find(db, title, skill, url)
    cat = CATS.get(skill.lower(), "Technology")
    if existing:
        changed = False
        for field, val in [("url", url), ("provider", provider), ("topic", topic),
                           ("source_platform", source), ("category", cat),
                           ("difficulty", difficulty), ("resource_type", rtype),
                           ("course_key", course_key), ("course_title", course_title),
                           ("lecture_order", lecture_order or 0),
                           ("is_lecture", is_lecture),
                           ("media_url", media_url),
                           ("duration_seconds", duration_seconds)]:
            cur = getattr(existing, field, None)
            if val is not None and cur != val and not (val == 0 and cur is None):
                setattr(existing, field, val)
                changed = True
        if description and existing.description != description:
            existing.description = description
            changed = True
        if changed:
            log.info("UPDATED %s", existing.title)
        return existing
    row = LearningResource(
        title=title,
        description=description or ("%s - %s. Open the source page to learn." % (title, topic or skill)),
        provider=provider, resource_type=rtype, skill=skill, topic=topic,
        url=url, thumbnail_url=None, difficulty=difficulty,
        estimated_duration="Self-paced",
        duration_seconds=duration_seconds if duration_seconds else None,
        media_url=media_url,
        course_key=course_key or None,
        course_title=course_title or None,
        lecture_order=lecture_order or 0,
        is_lecture=is_lecture,
        category=cat,
        source_platform=source,
        published_date=None)
    db.add(row)
    db.flush()
    log.info("ADDED   %s (id=%s)", title, row.id)
    return row
