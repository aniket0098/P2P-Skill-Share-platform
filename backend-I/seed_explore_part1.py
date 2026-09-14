"""Explore Skills catalog enrichment (part 1: updates). Idempotent."""
from sqlalchemy import func
from database import SessionLocal
from models import LearningResource

UPDATES_BY_URL = {
    "https://www.youtube.com/watch?v=rfscVS0vtbw": {
        "course_key": "python-fundamentals", "course_title": "Python Fundamentals",
        "lecture_order": 1, "is_lecture": True, "category": "Technology",
        "topic": "Setup and First Programs", "resource_type": "video"},
    "https://www.youtube.com/watch?v=eWRfhZUzrAc": {
        "course_key": "python-fundamentals", "course_title": "Python Fundamentals",
        "lecture_order": 2, "is_lecture": True, "category": "Technology",
        "topic": "Beginner Full Course", "resource_type": "video"},
    "https://www.youtube.com/watch?v=8DvywoWv6fI": {
        "course_key": "python-fundamentals", "course_title": "Python Fundamentals",
        "lecture_order": 3, "is_lecture": True, "category": "Technology",
        "topic": "Full University Curriculum", "resource_type": "video"},
    "https://www.youtube.com/watch?v=_uQrJ0TkZlc": {
        "course_key": "python-fundamentals", "course_title": "Python Fundamentals",
        "lecture_order": 4, "is_lecture": True, "category": "Technology",
        "topic": "Beginner Full Course", "resource_type": "video"},
    "https://www.youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU": {
        "category": "Technology", "is_lecture": False},
    "https://developers.google.com/edu/python": {"category": "Technology"},
    "https://www.py4e.com/": {"category": "Technology"},
    "https://realpython.com/": {"category": "Technology"},
    "https://cognitiveclass.ai/courses/python-for-data-science": {"category": "Technology"},
    "https://cs50.harvard.edu/python/2022/": {"category": "Technology"},
    "https://www.youtube.com/watch?v=PkZNo7MFNFg": {
        "course_key": "javascript-fundamentals", "course_title": "JavaScript Fundamentals",
        "lecture_order": 1, "is_lecture": True, "category": "Technology",
        "topic": "Beginner Full Course", "resource_type": "video"},
    "https://www.youtube.com/watch?v=hdI2bqOjy3c": {
        "course_key": "javascript-fundamentals", "course_title": "JavaScript Fundamentals",
        "lecture_order": 2, "is_lecture": True, "category": "Technology",
        "topic": "Crash Course", "resource_type": "video"},
    "https://www.youtube.com/playlist?list=PL4cUxeGkcC9i9Ae2D9Ee1RvylH38dKuET": {
        "course_key": "javascript-fundamentals", "course_title": "JavaScript Fundamentals",
        "lecture_order": 3, "is_lecture": False, "category": "Technology"},
    "https://www.codecademy.com/learn/introduction-to-javascript": {"category": "Technology"},
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript": {"category": "Technology"},
    "https://javascript.info/": {"category": "Technology"},
}
