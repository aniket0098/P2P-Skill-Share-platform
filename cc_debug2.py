import httpx
B = 'http://127.0.0.1:8000'
s = httpx.Client(base_url=B, timeout=10)
f = open('c:/project p2p/cc_debug_out.txt', 'w', encoding='utf-8')
def p(*a):
    print(*a, file=f)
    f.flush()
r = s.post('/login', json={'email': 'testfix@example.com', 'password': 'Test1234!'})
p('LOGIN:', r.status_code)
if r.status_code == 200:
    body = r.json()
    token = body.get('access_token') or body.get('token')
    headers = {'Authorization': 'Bearer ' + token}
    p('TOKEN_LEN:', len(token))
    p('STATUS:')
    r2 = s.get(B + '/api/career-coach/status', headers=headers)
    p(r2.text[:400])
    p('CONTEXT:')
    r3 = s.get(B + '/api/career-coach/context', headers=headers)
    p(r3.status_code, r3.text[:500])
    p('CHAT:')
    r4 = s.post(B + '/api/career-coach/chat', json={'message': 'What should I learn next?'}, headers=headers)
    p('STATUS:', r4.status_code)
    p(r4.text[:800])
else:
    p(r.text[:200])
f.close()
