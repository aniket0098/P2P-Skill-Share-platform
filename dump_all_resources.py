import sys
sys.path.insert(0, 'backend-I')
import os
# DATABASE_URL / SECRET_KEY are read from the environment (or backend-I/.env
# via backend-I/config.py). Credentials are never hardcoded in scripts.

from database import SessionLocal
from models import LearningResource

db = SessionLocal()
try:
    # Show ALL resources
    resources = db.query(LearningResource).order_by(LearningResource.skill, LearningResource.provider, LearningResource.title).all()
    print(f'Total: {len(resources)} learning resources\n')
    print('='*100)
    
    current_skill = None
    for r in resources:
        if r.skill != current_skill:
            current_skill = r.skill
            print(f'\n### {current_skill} ({len([x for x in resources if x.skill == current_skill])} resources)')
            print('-' * 80)
        
        print(f'\nID: {r.id}')
        print(f'  Title: {r.title}')
        print(f'  Provider: {r.provider}')
        print(f'  Type: {r.resource_type}')
        print(f'  Topic: {r.topic or "N/A"}')
        print(f'  Difficulty: {r.difficulty}')
        print(f'  Duration: {r.estimated_duration or "N/A"}')
        print(f'  Source: {r.source_platform or "N/A"}')
        print(f'  Published: {r.published_date or "N/A"}')
        print(f'  URL: {r.url}')
        if r.thumbnail_url:
            print(f'  Thumbnail: {r.thumbnail_url}')
        print(f'  Description: {r.description or "N/A"}')
    
finally:
    db.close()
