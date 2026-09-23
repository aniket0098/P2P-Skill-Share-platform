import py_compile, os, sys

base = r'c:\project p2p\backend-I'
ok = True
for f in ['main.py','stage8_service.py','comm_api.py','models.py']:
    p = os.path.join(base, f)
    if not os.path.exists(p):
        print('MISSING', f)
        ok = False
        continue
    try:
        py_compile.compile(p, doraise=True)
        print('OK', f)
    except py_compile.PyCompileError as e:
        ok = False
        print('FAIL', f, e)
print('RESULT', 'ALL_OK' if ok else 'SOME_FAILED')
