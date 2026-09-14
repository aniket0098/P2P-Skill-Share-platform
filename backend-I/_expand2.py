"""Part A: AI/ML/DSA courses."""
from database import SessionLocal
from models import LearningResource
from sqlalchemy import func

CATS = {"ai fundamentals": "AI/Data", "machine learning fundamentals": "AI/Data",
        "data structures and algorithms": "Technology", "english speaking": "Communication"}

def find(db, title, skill):
    return db.query(LearningResource).filter(
        func.lower(LearningResource.title) == title.strip().lower(),
        func.lower(LearningResource.skill) == skill.strip().lower()).first()

def add(db, title, skill, topic, provider, url, difficulty, rtype, source, order=1,
        course_key=None, course_title=None):
    if find(db, title, skill):
        return None
    cat = CATS.get(skill.lower(), "Technology")
    row = LearningResource(
        title=title, description="%s - %s." % (title, topic or skill),
        provider=provider, resource_type=rtype, skill=skill, topic=topic,
        url=url, difficulty=difficulty, estimated_duration="Self-paced",
        course_key=course_key, course_title=course_title, lecture_order=order,
        is_lecture=True, category=cat, source_platform=source)
    db.add(row)
    db.flush()
    print("ADDED %s" % title)
    return row

def main():
    db = SessionLocal()
    try:
        ai = [
            ("What is AI?", "AI Fundamentals", "Overview", "Google", "https://cloud.google.com/learn/what-is-artificial-intelligence", "beginner", "reading", "Google Cloud", 1),
            ("AI vs Machine Learning", "AI Fundamentals", "Concepts", "IBM", "https://www.ibm.com/cloud/learn/artificial-intelligence", "beginner", "reading", "IBM", 2),
            ("Generative AI Fundamentals", "AI Fundamentals", "GenAI", "Google", "https://cloud.google.com/learn/generative-ai", "beginner", "reading", "Google Cloud", 3),
            ("Introduction to LLMs", "AI Fundamentals", "LLMs", "Google", "https://cloud.google.com/learn/large-language-models", "beginner", "reading", "Google Cloud", 4),
        ]
        for t in ai:
            add(db, *t, course_key="ai-fundamentals", course_title="AI Fundamentals")
        ml = [
            ("ML Introduction", "Machine Learning Fundamentals", "Overview", "Google", "https://developers.google.com/machine-learning", "beginner", "reading", "Google ML", 1),
            ("Supervised Learning", "Machine Learning Fundamentals", "Supervised", "Google", "https://developers.google.com/machine-learning/intro-to-ml", "beginner", "reading", "Google ML", 2),
            ("Neural Networks Introduction", "Machine Learning Fundamentals", "Neural nets", "3Blue1Brown", "https://www.youtube.com/watch?v=aircAruvnKk", "intermediate", "video", "YouTube", 3),
        ]
        for t in ml:
            add(db, *t, course_key="ml-fundamentals", course_title="Machine Learning Fundamentals")
        dsa = [
            ("DSA Introduction", "Data Structures and Algorithms", "Overview", "GeeksforGeeks", "https://www.geeksforgeeks.org/data-structures/", "intermediate", "reading", "GeeksforGeeks", 1),
            ("Arrays", "Data Structures and Algorithms", "Arrays", "GeeksforGeeks", "https://www.geeksforgeeks.org/array-data-structure/", "intermediate", "reading", "GeeksforGeeks", 2),
            ("Strings", "Data Structures and Algorithms", "Strings", "GeeksforGeeks", "https://www.geeksforgeeks.org/string-data-structure/", "intermediate", "reading", "GeeksforGeeks", 3),
            ("Sorting Algorithms", "Data Structures and Algorithms", "Sorting", "GeeksforGeeks", "https://www.geeksforgeeks.org/sorting-algorithms/", "intermediate", "reading", "GeeksforGeeks", 4),
            ("Linked Lists", "Data Structures and Algorithms", "Linked lists", "GeeksforGeeks", "https://www.geeksforgeeks.org/data-structures/linked-list/", "intermediate", "reading", "GeeksforGeeks", 5),
        ]
        for t in dsa:
            add(db, *t, course_key="dsa-fundamentals", course_title="Data Structures & Algorithms")
        db.commit()
        print("DONE. Total: %d" % db.query(LearningResource).count())
    except Exception as e:
        db.rollback()
        print("FAILED: %s" % e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
