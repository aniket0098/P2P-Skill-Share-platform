import os, datetime
for p in ['c:/project p2p/backend-I/stage9_api.py', 'c:/project p2p/backend-I/__pycache__/stage9_api.cpython-312.pyc']:
    try:
        s = os.stat(p)
        print(f'{os.path.basename(p)}: mtime={datetime.datetime.fromtimestamp(s.st_mtime).isoformat()} size={s.st_size}')
    except Exception as e:
        print(f'{p}: ERROR {e}')
