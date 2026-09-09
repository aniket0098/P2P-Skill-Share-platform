import sys
import os
sys.path.insert(0, 'backend-I')

# Set environment variables for testing
os.environ['DATABASE_URL'] = 'postgresql://neondb_owner:npg_ahdkLCVYl39S@ep-lingering-firefly-a5ni2e23-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
os.environ['SECRET_KEY'] = 'test_secret_key_for_verification'
os.environ['FRONTEND_URL'] = 'http://localhost:5500'

from main import app
print('Backend app imports successfully')
print(f'App title: {app.title}')
print(f'Number of routes: {len(app.routes)}')

# Check learning resources routes
learning_routes = [r for r in app.routes if 'learning' in r.path.lower()]
print(f'\nLearning-related routes ({len(learning_routes)}):')
for route in learning_routes:
    print(f'  {route.path} [{route.methods}]')
