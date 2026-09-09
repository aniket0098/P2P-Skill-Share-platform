import sys
sys.path.insert(0, 'backend-I')
import os
os.environ['DATABASE_URL'] = 'postgresql://neondb_owner:npg_ahdkLCVYl39S@ep-lingering-firefly-a5ni2e23-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
os.environ['SECRET_KEY'] = 'test_key_for_verification'

# Test the API endpoints
print("=" * 80)
print("TESTING LEARNING RESOURCES API ENDPOINTS")
print("=" * 80)

from database import SessionLocal
from models import LearningResource

db = SessionLocal()
try:
    # 1. Test skills endpoint
    print("\n1. LEARNING SKILLS (from DB)")
    skills = db.query(LearningResource.skill).distinct().order_by(LearningResource.skill).all()
    for s in skills:
        count = db.query(LearningResource).filter(LearningResource.skill == s[0]).count()
        print(f"   ✓ {s[0]} ({count} resources)")
    
    # 2. Test providers endpoint  
    print("\n2. PROVIDERS (from DB)")
    providers = db.query(LearningResource.provider).distinct().order_by(LearningResource.provider).all()
    for p in providers:
        print(f"   ✓ {p[0]}")
    
    # 3. Test full resource list with filters
    print("\n3. SAMPLE PYTHON RESOURCES (beginner, videos)")
    py_videos = db.query(LearningResource).filter(
        LearningResource.skill == "Python",
        LearningResource.resource_type == "video",
        LearningResource.difficulty == "beginner"
    ).all()
    for r in py_videos:
        print(f"   ✓ {r.provider}: {r.title[:50]}")
        print(f"     URL: {r.url}")
        print(f"     Thumbnail: {r.thumbnail_url or 'N/A'}")
    
    # 4. Test courses
    print("\n4. SAMPLE PYTHON COURSES (Google, IBM, Microsoft)")
    py_courses = db.query(LearningResource).filter(
        LearningResource.skill == "Python",
        LearningResource.resource_type == "course"
    ).filter(
        LearningResource.provider.in_(["Google", "IBM", "Microsoft"])
    ).all()
    for r in py_courses:
        print(f"   ✓ {r.provider}: {r.title[:50]}")
        print(f"     Duration: {r.estimated_duration or 'N/A'}")
        print(f"     Source: {r.source_platform or 'N/A'}")
    
    # 5. Verify data integrity
    print("\n5. DATA INTEGRITY CHECK")
    all_resources = db.query(LearningResource).all()
    issues = []
    for r in all_resources:
        if not r.title:
            issues.append(f"Resource {r.id} missing title")
        if not r.provider:
            issues.append(f"Resource {r.id} missing provider")
        if not r.url or not (r.url.startswith('http://') or r.url.startswith('https://')):
            issues.append(f"Resource {r.id} has invalid URL: {r.url}")
        if not r.skill:
            issues.append(f"Resource {r.id} missing skill")
        if not r.resource_type or r.resource_type not in ['video', 'course']:
            issues.append(f"Resource {r.id} has invalid type: {r.resource_type}")
        if not r.difficulty or r.difficulty not in ['beginner', 'intermediate', 'advanced']:
            issues.append(f"Resource {r.id} has invalid difficulty: {r.difficulty}")
    
    if issues:
        print("   ⚠ Issues found:")
        for issue in issues:
            print(f"     - {issue}")
    else:
        print(f"   ✓ All {len(all_resources)} resources have valid data")
    
    # 6. Summary statistics
    print("\n6. SUMMARY STATISTICS")
    print(f"   Total resources: {len(all_resources)}")
    print(f"   Skills covered: {len(skills)}")
    print(f"   Providers: {len(providers)}")
    print(f"   Videos: {db.query(LearningResource).filter(LearningResource.resource_type == 'video').count()}")
    print(f"   Courses: {db.query(LearningResource).filter(LearningResource.resource_type == 'course').count()}")
    print(f"   Beginner: {db.query(LearningResource).filter(LearningResource.difficulty == 'beginner').count()}")
    print(f"   Intermediate: {db.query(LearningResource).filter(LearningResource.difficulty == 'intermediate').count()}")
    print(f"   Advanced: {db.query(LearningResource).filter(LearningResource.difficulty == 'advanced').count()}")
    
    # 7. Trusted providers breakdown
    print("\n7. TRUSTED PROVIDERS BREAKDOWN")
    trusted = ['Google', 'Microsoft', 'IBM', 'AWS', 'Cisco', 'NVIDIA', 'Meta']
    for provider in trusted:
        count = db.query(LearningResource).filter(LearningResource.provider == provider).count()
        if count > 0:
            print(f"   ✓ {provider}: {count} resources")
    
    # 8. Resources by skill
    print("\n8. RESOURCES BY SKILL")
    for skill in ['Python', 'JavaScript', 'AI', 'Machine Learning', 'FastAPI', 'Cloud', 'Data Science']:
        count = db.query(LearningResource).filter(LearningResource.skill == skill).count()
        videos = db.query(LearningResource).filter(
            LearningResource.skill == skill,
            LearningResource.resource_type == 'video'
        ).count()
        courses = db.query(LearningResource).filter(
            LearningResource.skill == skill,
            LearningResource.resource_type == 'course'
        ).count()
        print(f"   {skill}: {count} total ({videos} videos, {courses} courses)")
    
finally:
    db.close()

print("\n" + "=" * 80)
print("API VERIFICATION COMPLETE")
print("=" * 80)
