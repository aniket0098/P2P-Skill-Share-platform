"""Part B: Communication/Career/Business courses."""
from database import SessionLocal
from models import LearningResource
from sqlalchemy import func

CATS = {"english speaking": "Communication", "public speaking": "Communication",
        "interview preparation": "Career", "resume building": "Career",
        "aptitude fundamentals": "Career", "excel fundamentals": "Business",
        "project management fundamentals": "Business", "entrepreneurship fundamentals": "Business"}

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
        en = [
            ("English Speaking Fundamentals", "English Speaking", "Basics", "BBC", "https://www.bbc.co.uk/learningenglish/", "beginner", "reading", "BBC", 1),
            ("Everyday English Conversation", "English Speaking", "Daily talk", "BBC", "https://www.bbc.co.uk/learningenglish/english/features/english-in-daily-use", "beginner", "reading", "BBC", 2),
            ("Vocabulary Building", "English Speaking", "Words", "BBC", "https://www.bbc.co.uk/learningenglish/english/features/6-minute-english", "beginner", "reading", "BBC", 3),
        ]
        for t in en:
            add(db, *t, course_key="english-speaking-basics", course_title="English Speaking Fundamentals")
        ps = [
            ("Public Speaking Basics", "Public Speaking", "Getting started", "Toastmasters", "https://www.toastmasters.org/resources/public-speaking-tips", "beginner", "reading", "Toastmasters", 1),
            ("Overcoming Stage Fear", "Public Speaking", "Confidence", "Toastmasters", "https://www.toastmasters.org/resources/speaking-tips/nervousness", "beginner", "reading", "Toastmasters", 2),
        ]
        for t in ps:
            add(db, *t, course_key="public-speaking-fundamentals", course_title="Public Speaking Fundamentals")
        iv = [
            ("Interview Fundamentals", "Interview Preparation", "Overview", "Indeed", "https://www.indeed.com/career-advice/interviewing", "beginner", "reading", "Indeed", 1),
            ("Common Interview Questions", "Interview Preparation", "Q&A", "Indeed", "https://www.indeed.com/career-advice/interviewing/common-interview-questions", "beginner", "reading", "Indeed", 2),
        ]
        for t in iv:
            add(db, *t, course_key="interview-preparation", course_title="Interview Preparation")
        rl = [
            ("Resume Building", "Resume Building", "CV writing", "Indeed", "https://www.indeed.com/career-advice/resumes-cover-letters", "beginner", "reading", "Indeed", 1),
            ("LinkedIn Profile Building", "Resume Building", "LinkedIn", "LinkedIn", "https://www.linkedin.com/pulse/how-create-linkedin-profile-stand-out", "beginner", "reading", "LinkedIn", 2),
        ]
        for t in rl:
            add(db, *t, course_key="resume-linkedin", course_title="Resume & LinkedIn Profile Building")
        ex = [
            ("Excel Introduction", "Excel Fundamentals", "Basics", "Microsoft", "https://support.microsoft.com/en-us/office/excel-training-9bc05390-e94c-4668-a591-62f69a88c88d", "beginner", "reading", "Microsoft", 1),
            ("Excel Formulas", "Excel Fundamentals", "Formulas", "ExcelJet", "https://exceljet.net/excel-functions", "beginner", "reading", "ExcelJet", 2),
        ]
        for t in ex:
            add(db, *t, course_key="excel-fundamentals", course_title="Excel Fundamentals")
        pm = [
            ("Project Management Introduction", "Project Management Fundamentals", "Overview", "PMI", "https://www.pmi.org/about/learn-about-pmi/what-is-project-management", "beginner", "reading", "PMI", 1),
            ("Design Thinking", "Project Management Fundamentals", "Design", "IDEO", "https://www.ideou.com/pages/design-thinking", "beginner", "reading", "IDEO", 2),
        ]
        for t in pm:
            add(db, *t, course_key="project-management-basics", course_title="Project Management Fundamentals")
        ep = [
            ("Entrepreneurship Introduction", "Entrepreneurship Fundamentals", "Overview", "SCORE", "https://www.score.org/resource/entrepreneurship-basics", "beginner", "reading", "SCORE", 1),
            ("Time Management", "Entrepreneurship Fundamentals", "Productivity", "MindTools", "https://www.mindtools.com/a5oiyfg/time-management", "beginner", "reading", "MindTools", 2),
        ]
        for t in ep:
            add(db, *t, course_key="entrepreneurship-basics", course_title="Entrepreneurship Fundamentals")
        db.commit()
        print("DONE. Total: %d" % db.query(LearningResource).count())
    except Exception as e:
        db.rollback()
        print("FAILED: %s" % e)
    finally:
        db.close()

if __name__ == "__main__":
    main()
