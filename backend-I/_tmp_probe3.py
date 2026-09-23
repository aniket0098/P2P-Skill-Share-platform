import os

t = open('main.py', encoding='utf-8').read()
for name in ['def _user_relationship', 'def serialize_current_user', 'def _relationships_batched']:
    i = t.find(name)
    print('==== %s @ %s ====' % (name, i))
    if i >= 0:
        print(t[i:i + 1500])
    print()

print('==== tests/dom ====')
for f in sorted(os.listdir(os.path.join('tests', 'dom'))):
    p = os.path.join('tests', 'dom', f)
    print(f, os.path.getsize(p))
