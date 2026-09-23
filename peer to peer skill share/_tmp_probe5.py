import re

FRONT = r'C:/project p2p/peer to peer skill share/'
css = open(FRONT + 'profile.css', encoding='utf-8').read()
ds = open(FRONT + 'design-system.css', encoding='utf-8').read()

chrome = ['topbar', 'brand', 'brand-mark', 'icon-btn', 'credits-chip', 'cc-coin', 'cc-num',
          'cc-label', 'mini-profile', 'mini-avatar', 'profile-arrow', 'active-profile',
          'top-actions', 'public-page', 'empty-state']
print('%-16s %-10s %-10s' % ('selector', 'profile.css', 'design-system'))
for c in chrome:
    pat = re.compile(r'\.' + re.escape(c) + r'[\s,{:.]')
    print('%-16s %-10s %-10s' % (c, bool(pat.search(css)), bool(pat.search(ds))))

print('\nall non-pf selectors in profile.css:')
print(sorted(set(re.findall(r'^(?:[^{}@]*?)\.([a-zA-Z][\w-]*)', css, re.M)))[:60])
