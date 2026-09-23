import re

t = open(r'C:/project p2p/backend-I/main.py', encoding='utf-8').read()

i = t.find('@app.post("/api/requests")')
print(t[i:i + 1100])

print('\n=== request schema classes ===')
for m in re.finditer(r'class (\w*Request\w*)\(BaseModel\):(.*?)(?=\nclass |\n@app)', t, re.S):
    if 'receiver' in m.group(2) or 'message' in m.group(2):
        print(m.group(0)[:600])
        print('----')
