import re

d = open('profile.css', encoding='utf-8').read()
sels = sorted(set(re.findall(r'\.(pf-[a-z0-9-]+)', d)))
h = open('profile.html', encoding='utf-8').read()
used = set()
for m in re.findall(r'class="([^"]+)"', h):
    used.update(m.split())
miss = sorted(c for c in used if c.startswith('pf-') and c not in sels)
print('CSS classes (%d):' % len(sels))
print(' '.join(sels))
print()
print('MISSING in CSS (%d):' % len(miss))
print(' '.join(miss))
print()
ids = sorted(set(re.findall(r'id="([^"]+)"', h)))
print('IDS (%d):' % len(ids))
print(' '.join(ids))
print()
# JS stub check
t = open('profile.js', encoding='utf-8').read()
print('profile.js refs getProfileSummary:', 'getProfileSummary' in t)
print('profile.js refs getProfileView:', 'getProfileView' in t)
# data-section attributes
print('sections:', re.findall(r'data-section="([^"]+)"', h))
print('retry targets:', re.findall(r'data-retry="([^"]+)"', h))
