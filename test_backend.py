import sys
import os
sys.path.insert(0, 'backend-I')

# Set environment variables for testing
# DATABASE_URL / SECRET_KEY are read from the environment (or backend-I/.env
# via backend-I/config.py). Credentials are never hardcoded in scripts.
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
