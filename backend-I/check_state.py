#!/usr/bin/env python3
"""Quick database state check."""
import sys
sys.path.insert(0, 'backend-I')
import os
# DATABASE_URL / SECRET_KEY are read from the environment (or backend-I/.env
# via backend-I/config.py). Credentials are never hardcoded in scripts.

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
