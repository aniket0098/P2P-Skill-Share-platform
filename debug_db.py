import sys
import os
import json

# Add backend-I to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend-I'))

from models import LearningResource
from database import SessionLocal

db = SessionLocal()
try:
    count = db.query(LearningResource).count()
    print(f"Total learning resources: {count}")
    
    skills = db.query(LearningResource.skill).distinct().order_by(LearningResource.skill).all()
    print("\nSkills:")
    for s in skills:
        print(f"  - {s.skill}")
    
    providers = db.query(LearningResource.provider).distinct().order_by(LearningResource.provider).all()
    print("\nProviders:")
    for p in providers:
        print(f"  - {p.provider}")
    
    resource_types = db.query(LearningResource.resource_type).distinct().all()
    print("\nResource types:")
    for rt in resource_types:
        print(f"  - {rt.resource_type}")
    
    difficulties = db.query(LearningResource.difficulty).distinct().all()
    print("\nDifficulty levels:")
    for d in difficulties:
        print(f"  - {d.difficulty}")
finally:
    db.close()
