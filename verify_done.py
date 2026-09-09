#!/usr/bin/env python3
"""Final verification of Explore Skills implementation."""
import sys
import os

os.environ['DATABASE_URL'] = 'postgresql://neondb_owner:npg_ahdkLCVYl39S@ep-lingering-firefly-a5ni2e23-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require'
os.environ['SECRET_KEY'] = 'test_key'
os.environ['FRONTEND_URL'] = 'http://localhost:5500'

sys.path.insert(0, 'backend-I')

print("=" * 70)
print("EXPLORE SKILLS LEARNING RESOURCES - VERIFICATION")
print("=" * 70)

# Database check
print("\n[1] DATABASE")
print("-" * 70)
from database import SessionLocal
from models import LearningResource

db = SessionLocal()
try:
    count = db.query(LearningResource).count()
    print(f"Total resources: {count}")
    
    skills = db.query(LearningResource.skill).distinct().order_by(LearningResource.skill).all()
    print(f"\nSkills ({len(skills)}):")
    for s in skills:
        cnt = db.query(LearningResource).filter(LearningResource.skill == s.skill).count()
        videos = db.query(LearningResource).filter(
            LearningResource.skill == s.skill,
            LearningResource.resource_type == 'video'
        ).count()
        courses = cnt - videos
        print(f"  - {s.skill}: {cnt} ({videos} videos, {courses} courses)")
    
    providers = db.query(LearningResource.provider).distinct().order_by(LearningResource.provider).all()
    print(f"\nProviders ({len(providers)}):")
    for p in providers:
        print(f"  - {p.provider}")
    
    print(f"\nResource types:")
    for t in db.query(LearningResource.resource_type).distinct().all():
        cnt = db.query(LearningResource).filter(LearningResource.resource_type == t.resource_type).count()
        print(f"  - {t.resource_type}: {cnt}")
    
    print(f"\nDifficulty levels:")
    for d in db.query(LearningResource.difficulty).distinct().all():
        cnt = db.query(LearningResource).filter(LearningResource.difficulty == d.difficulty).count()
        print(f"  - {d.difficulty}: {cnt}")
    
    # Trusted providers
    print(f"\nTrusted provider resources:")
    trusted = ['Google', 'Microsoft', 'IBM', 'AWS', 'Cisco', 'NVIDIA', 'Meta']
    total_trusted = 0
    for prov in trusted:
        cnt = db.query(LearningResource).filter(LearningResource.provider == prov).count()
        total_trusted += cnt
        if cnt > 0:
            print(f"  - {prov}: {cnt}")
    print(f"Total from trusted providers: {total_trusted}")
    
finally:
    db.close()

# API check
print("\n[2] BACKEND API ENDPOINTS")
print("-" * 70)
from main import app

for route in app.routes:
    path = getattr(route, 'path', '')
    if 'learning' in path.lower():
        methods = getattr(route, 'methods', set())
        print(f"  {path} [{', '.join(methods)}]")

# Frontend check
print("\n[3] FRONTEND FILES")
print("-" * 70)
import pathlib

files = [
    ('peer to peer skill share/explore.html', ['skillGrid', 'learning-resources', 'videoGrid', 'courseGrid', 'difficultyTabs']),
    ('peer to peer skill share/explore.js', ['LR = {', 'lrRenderSkillGrid', 'lrOpenSkill', 'lrResourceCard', 'lrRenderResources', 'API.getLearningResources']),
    ('peer to peer skill share/api-client.js', ['getLearningSkills', 'getLearningProviders', 'getLearningResources']),
    ('peer to peer skill share/explore.css', ['.lr-skill-card', '.resource-card', '#videoGrid', '#courseGrid', '.topic-tab', '.lr-start-btn']),
]

for filepath, checks in files:
    p = pathlib.Path(filepath)
    if p.exists():
        content = p.read_text(encoding='utf-8')
        print(f"\n{filepath} ({len(content)} bytes)")
        for check in checks:
            if check in content:
                print(f"  ✓ {check}")
            else:
                print(f"  ✗ MISSING: {check}")
    else:
        print(f"\n✗ MISSING FILE: {filepath}")

print("\n" + "=" * 70)
print("VERIFICATION COMPLETE")
print("=" * 70)
