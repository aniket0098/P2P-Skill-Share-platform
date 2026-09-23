import re

b = open(r'C:/project p2p/backend-I/main.py', encoding='utf-8').read()

print('=== UpdateProfileSchema full ===')
i = b.find('class UpdateProfileSchema')
print(b[i:i + 700])

print('\n=== skills catalog endpoint + response ===')
i = b.find('/api/skills/catalog')
print(b[max(0, i - 200):i + 700])

print('\n=== career event types (careerverse_service) ===')
cs = open(r'C:/project p2p/backend-I/careerverse_service.py', encoding='utf-8').read()
print(sorted(set(re.findall(r'event_type[\"\']?\s*[:=]\s*[\"\']([\w]+)[\"\']', cs))))
print(sorted(set(re.findall(r'[\"\'](learning_\w+|project_\w+|sandbox_\w+|innovation_\w+|skill_\w+|profile_\w+|connection_\w+)[\"\']', cs))))

print('\n=== login.js next-param handling ===')
lj = open('login.js', encoding='utf-8').read()
print(re.findall(r'next[^\n]{0,110}', lj)[:6])
