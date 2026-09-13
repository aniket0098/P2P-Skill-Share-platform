import httpx

B = 'http://127.0.0.1:8000'
s = httpx.Client(base_url=B, timeout=10)

r = s.post('/login', json={'email': 'testfix@example.com', 'password': 'Test1234!'})
print('LOGIN:', r.status_code)
if r.status_code == 200:
    body = r.json()
    tok = body.get('access_token') or body.get('token')
    usr = body.get('user') or body.get('user_info') or {}
    print('Token present:', bool(tok))
    print('User:', usr)
    h = {'Authorization': f'Bearer {tok}'}
    
    print('\n=== STATUS ===')
    r = s.get('/api/career-coach/status', headers=h)
    print('Status:', r.status_code, '|', r.text[:250])
    
    print('\n=== CONTEXT ===')
    r = s.get('/api/career-coach/context', headers=h)
    print('Status:', r.status_code)
    if r.status_code == 200:
        ctx = r.json()
        for k in ['name', 'target_role', 'skills', 'has_skills', 'has_profile', 'readiness', 'provider']:
            if k in ctx:
                v = ctx[k]
                if isinstance(v, (list, dict)):
                    print(f'  {k}: {str(v)[:120]}')
                else:
                    print(f'  {k}: {v}')
    else:
        print('Error:', r.text[:200])
    
    print('\n=== CHAT ===')
    r = s.post('/api/career-coach/chat', json={'message': 'What should I learn next?'}, headers=h)
    print('Status:', r.status_code)
    print('Body:', r.text[:600])
else:
    print('Login failed:', r.text[:200])
