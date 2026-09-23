import re

FRONT = r'C:/project p2p/peer to peer skill share/'
BACK = r'C:/project p2p/backend-I/'

print('=== find-talent talent-profile link building ===')
t = open(FRONT + 'find-talent.html', encoding='utf-8').read()
for m in re.finditer('talent-profile', t):
    print(repr(t[max(0, m.start() - 240):m.start() + 160]))
    print('----')

print('=== education serializer tail ===')
b = open(BACK + 'main.py', encoding='utf-8').read()
i = b.find('def _serialize_education')
print(b[i:i + 700])

print('=== .pf-btn display ===')
c = open(FRONT + 'profile.css', encoding='utf-8').read()
i = c.find('.pf-btn {')
print(c[i:i + 500] if i >= 0 else 'pf-btn block not found')
i = c.find('.pf-text-btn')
print(c[i:i + 320])

print('=== design-system body rules ===')
d = open(FRONT + 'design-system.css', encoding='utf-8').read()
for m in re.finditer(r'(?:^|\})\s*(body[^{]*\{[^}]{0,220}\})', d):
    print(m.group(1)[:260])
    print('--')
