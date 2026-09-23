import re

t = open('api-client.js', encoding='utf-8').read()
j = t.find('profile/view')
print('--- api-client around profile/view ---')
print(t[max(0, j - 700): j + 120])

d = open('design-system.css', encoding='utf-8').read()
print('--- design-system profile.html present:', 'profile.html' in d, '---')
for l in d.split('\n'):
    if 'profile.html' in l or 'tutor-profile' in l:
        print(l[:300])

p = open('profile-role.css', encoding='utf-8').read()
print('--- profile-role.css len:', len(p), '---')
print(p[:400])
