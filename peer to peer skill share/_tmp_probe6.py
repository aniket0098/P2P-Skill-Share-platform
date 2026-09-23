import subprocess, re, os

FRONT = r'C:/project p2p/peer to peer skill share/'
old = subprocess.run(['git', 'show', 'HEAD:peer to peer skill share/profile.css'],
                     cwd=r'C:/project p2p', capture_output=True).stdout.decode('utf-8', 'replace')
print('old profile.css len:', len(old))
for c in ['topbar', 'brand', 'brand-mark', 'icon-btn', 'credits-chip', 'cc-coin', 'cc-num',
          'cc-label', 'mini-profile', 'mini-avatar', 'profile-arrow', 'active-profile',
          'top-actions', 'public-page']:
    print('%-16s %s' % (c, bool(re.search(r'\.' + re.escape(c) + r'[\s,{:.]', old))))

# Does portal.css / portal-shell.css / dashboard.css style the chrome?
for f in ['portal.css', 'portal-shell.css', 'dashboard.css', 'style.css']:
    t = open(FRONT + f, encoding='utf-8', errors='replace').read()
    hits = [c for c in ['topbar', 'mini-profile', 'credits-chip', 'brand'] if re.search(r'\.' + c + r'[\s,{:.]', t)]
    print(f, '->', hits)
