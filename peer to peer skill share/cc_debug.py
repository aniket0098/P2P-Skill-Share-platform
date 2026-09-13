import httpx
B = 'http://127.0.0.1:8000'
s = httpx.Client(base_url=B, timeout=10)

# 1. Login as the test user we just created
r = s.post('/login', json={'email': 'testfix@example.com', 'password': 'Test1234!'})
print(f'LOGIN: {r.status_code}')
if r.status_code == 200:
    body = r.json()
    token = body.get('access_token') or body.get('token')
    user = body.get('user') or body.get('user_info') or {}
    print(f'Token present: {bool(token)}')
    print(f'User: {user}')
    headers = {'Authorization': f'Bearer {token}'}
    
    # 2. Call career coach status
    print()
    print('=== STATUS ===')
    r = s.get('/api/career-coach/status', headers=headers)
    print(f'Status: {r.status_code} | {r.text[:250]}')
    
    # 3. Call career coach context
    print()
    print('=== CONTEXT ===')
    r = s.get('/api/career-coach/context', headers=headers)
    print(f'Status: {r.status_code}')
    if r.status_code == 200:
        ctx = r.json()
        keys = ['name','target_role','skills','has_skills','has_profile','readiness','provider','known_skills_only']
        for k in keys:
            if k in ctx:
                v = ctx[k]
                if isinstance(v, (list, dict)):
                    print(f'  {k}: {str(v)[:150]}')
                else:
                    print(f'  {k}: {v}')
    else:
        print(f'Error: {r.text[:250]}')
    
    # 4. Call career coach chat
    print()
    print('=== CHAT ===')
    r = s.post('/api/career-coach/chat', json={'message': 'What should I learn next?'}, headers=headers)
    print(f'Status: {r.status_code}')
    print(f'Body: {r.text[:600]}')
else:
    print(f'Login failed: {r.status_code} | {r.text[:250]}')
