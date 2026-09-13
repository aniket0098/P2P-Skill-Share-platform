import httpx, json, pathlib

B = 'http://127.0.0.1:8000'
out = pathlib.Path('c:/project p2p/backend-I/cc_debug_output.json')

s = httpx.Client(base_url=B, timeout=10)

# 1. Login
r = s.post('/login', json={'email': 'testfix@example.com', 'password': 'Test1234!'})
print('LOGIN:', r.status_code)
result = {'login_status': r.status_code}
if r.status_code == 200:
    body = r.json()
    token = body.get('access_token') or body.get('token')
    user = body.get('user') or body.get('user_info') or body
    result['token_present'] = bool(token)
    result['user'] = user
    print('Token present:', bool(token))
    print('User:', user)
    headers = {'Authorization': f'Bearer {token}'}
    
    # 2. Status
    print()
    print('=== STATUS ===')
    r = s.get('/api/career-coach/status', headers=headers)
    result['status_status'] = r.status_code
    result['status_body'] = r.text[:500]
    print('Status:', r.status_code, '|', r.text[:200])
    
    # 3. Context
    print()
    print('=== CONTEXT ===')
    r = s.get('/api/career-coach/context', headers=headers)
    result['context_status'] = r.status_code
    result['context_body'] = r.text[:500]
    print('Status:', r.status_code)
    if r.status_code == 200:
        ctx = r.json()
        for k in ['name', 'target_role', 'skills', 'has_skills', 'has_profile', 'readiness', 'provider']:
            if k in ctx:
                v = ctx[k]
                if isinstance(v, (list, dict)):
                    print('  ', k, ':', str(v)[:100])
                else:
                    print('  ', k, ':', v)
    else:
        print('Error:', r.text[:200])
    
    # 4. Chat
    print()
    print('=== CHAT ===')
    r = s.post('/api/career-coach/chat', json={'message': 'What should I learn next?'}, headers=headers)
    result['chat_status'] = r.status_code
    result['chat_body'] = r.text[:1000]
    print('Status:', r.status_code)
    print('Body:', r.text[:500])
else:
    result['login_error'] = r.text[:300]
    print('Login failed:', r.text[:200])

out.write_text(json.dumps(result, indent=2, default=str), encoding='utf-8')
print()
print('Saved to', out)