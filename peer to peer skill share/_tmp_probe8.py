import re

d = open('profile.html', encoding='utf-8').read()
for s in ['config.js', 'api-client.js', 'auth.js', 'profile.js', 'portal-unify.js', 'stage5-shared-bridge.js']:
    print('%-24s x%d' % (s, d.count('src="%s"' % s)))

print('\nscript tags in order:')
for m in re.finditer(r'<script[^>]*src="([^"]+)"[^>]*>', d):
    print('  line', d[:m.start()].count('\n') + 1, m.group(0))

print('\nstylesheet links:')
for m in re.finditer(r'<link[^>]*rel="stylesheet"[^>]*>', d):
    print('  line', d[:m.start()].count('\n') + 1, m.group(0))
