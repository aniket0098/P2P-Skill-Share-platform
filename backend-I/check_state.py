#!/usr/bin/env python3
"""Quick database state check."""
import sys
sys.path.insert(0, 'backend-I')
import os
os.environ['DATABASE_URL'] = 'postgresql://neondb_owner:npg_ahdkLCVYl39S@ep-lingering-firefly-a5ni2e23-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
os.environ['SECRET_KEY'] = 'test_key'

from database import SessionLocal
from models import LearningResource

db = SessionLocal()
try:
    count = db.query(LearningResource).count()
    print(f'Total resources: {count}')
    skills = db.query(LearningResource.skill).distinct().order_by(LearningResource.skill).all()
    print('Skills:', [s.skill for s in skills])
    providers = db.query(LearningResource.provider).distinct().order_by(LearningResource.provider).all()
    print('Providers:', [p.provider for p in providers])
    types = db.query(LearningResource.resource_type).distinct().all()
    print('Types:', [t.resource_type for t in types])
    difficulties = db.query(LearningResource.difficulty).distinct().all()
    print('Difficulties:', [d.difficulty for d in difficulties])
finally:
    db.close()
