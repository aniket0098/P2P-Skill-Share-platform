import os, re, json

FRONT = r'C:/project p2p/peer to peer skill share/'

print('=== 1. messages.js conversation deep-link support ===')
mj = open(FRONT + 'messages.js', encoding='utf-8').read() if os.path.exists(FRONT + 'messages.js') else ''
print('URLSearchParams hits:', re.findall(r'URLSearchParams[^\n]{0,150}', mj)[:5])
print('conversation param:', re.findall(r"['\"]conversation['\"][^\n]{0,120}", mj)[:5])

print('\n=== 2. api-client signatures ===')
ac = open(FRONT + 'api-client.js', encoding='utf-8').read()
for key in ['getToken', 'getEducation:', 'searchSkills:', 'updateMyProfile:', 'addEducation:',
            'updateEducation:', 'deleteEducation:', 'addMySkill:', 'deleteMySkill:',
            'acceptRequest:', 'cancelRequest:', 'updateSettings:', 'getMe:']:
    i = ac.find(key)
    print('%-22s -> %s' % (key, (ac[i:i + 180].split(chr(10))[0] if i >= 0 else 'NOT FOUND')))

print('\n=== 3. design-system identity line ===')
ds = open(FRONT + 'design-system.css', encoding='utf-8').read()
print('body[data-page="profile.html"] present:', 'body[data-page="profile.html"]' in ds)
print('data-page="profile.html" present:', 'data-page="profile.html"' in ds)
m = re.findall(r'body\[data-page="dashboard\.html"\][^\n]{0,120}', ds)
print('dashboard anchor:', m[:1])

print('\n=== 4. find-talent -> talent-profile link format ===')
ft = open(FRONT + 'find-talent.html', encoding='utf-8').read()
print(re.findall(r'talent-profile[^\'"\s]{0,60}', ft)[:6])
ftjs = open(FRONT + 'find-talent.js', encoding='utf-8').read() if os.path.exists(FRONT + 'find-talent.js') else ''
print(re.findall(r'talent-profile[^\'"\s]{0,60}', ftjs)[:6])

print('\n=== 5. _sync_profile_skills full body ===')
t = open(r'C:/project p2p/backend-I/main.py', encoding='utf-8').read()
i = t.find('def _sync_profile_skills')
print(t[i:i + 1200])

print('\n=== 6. old profile.js login redirect pattern ===')
old = os.path.expandvars(r'%TEMP%\orig_profile_head.js')
if os.path.exists(old):
    o = open(old, encoding='utf-8', errors='replace').read()
    print(re.findall(r'login\.html[^\n\'"]{0,60}', o)[:4])
    print('getToken refs:', len(re.findall(r'getToken', o)))

print('\n=== 7. auth-guard recruiter string uniqueness ===')
ag = open(FRONT + 'auth-guard.js', encoding='utf-8').read()
needle = '"talent-pool.html","jobs.html"'
print('needle count:', ag.count(needle))
print('recruiter has profile.html:', 'recruiter:[\"recruiter-dashboard.html\"' in ag and '"profile.html"' in ag.split('recruiter:[')[1].split('],faculty:')[0])

print('\n=== 8. portal-shell recruiter Company group ===')
ps = open(FRONT + 'portal-shell.js', encoding='utf-8').read()
i = ps.find('recruiter: [')
print(ps[i:i + 700])

print('\n=== 9. UpdateProfileSchema fields ===')
i = t.find('class UpdateProfileSchema')
print(t[i:i + 500])
