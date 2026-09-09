import sys
sys.path.insert(0, 'backend-I')
import os
os.environ['DATABASE_URL'] = 'postgresql://neondb_owner:npg_ahdkLCVYl39S@ep-lingering-firefly-a5ni2e23-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
os.environ['SECRET_KEY'] = 'test_key_for_verification'

from database import SessionLocal
from models import LearningResource

db = SessionLocal()
try:
    # Check learning_resources table
    count = db.query(LearningResource).count()
    print(f'Total learning resources: {count}')
    
    # Get distinct skills
    skills = db.query(LearningResource.skill).distinct().order_by(LearningResource.skill).all()
    print('\nSkills:')
    for s in skills:
        print(f'  - {s[0]}')
    
    # Get distinct providers
    providers = db.query(LearningResource.provider).distinct().order_by(LearningResource.provider).all()
    print('\nProviders:')
    for p in providers:
        print(f'  - {p[0]}')
    
    # Get distinct resource types
    types = db.query(LearningResource.resource_type).distinct().all()
    print('\nResource types:')
    for t in types:
        print(f'  - {t[0]}')
    
    # Get distinct difficulties
    diffs = db.query(LearningResource.difficulty).distinct().all()
    print('\nDifficulty levels:')
    for d in diffs:
        print(f'  - {d[0]}')
    
    # Show sample resources
    resources = db.query(LearningResource).order_by(LearningResource.skill, LearningResource.provider).limit(30).all()
    print('\nSample resources (first 30):')
    for r in resources:
        print(f'  {r.id}: {r.provider} | {r.title[:50]} | {r.skill} | {r.resource_type} | {r.difficulty}')
        
    # Check for any resources with problematic URLs
    print('\nChecking URLs...')
    all_resources = db.query(LearningResource).all()
    for r in all_resources:
        url = r.url
        if url and not (url.startswith('http://') or url.startswith('https://')):
            print(f'  WARNING: Resource {r.id} has invalid URL: {url}')
        elif url and 'placeholder' in url.lower():
            print(f'  WARNING: Resource {r.id} has placeholder URL: {url}')
            
    print(f'\nTotal checked: {len(all_resources)} resources')
    
finally:
    db.close()
