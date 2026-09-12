"""Fix escaped triple-quotes in stage9_service.py"""
p = 'stage9_service.py'
s = open(p, encoding='utf-8').read()
# Replace literal \"\"\" with actual triple quotes
s = s.replace('\\"\\"\\"', '"""')
open(p, 'w', encoding='utf-8').write(s)
print("Fixed")
