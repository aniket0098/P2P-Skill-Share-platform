# Robust fix for the broken roadmap string in stage9_service.py
p = r"c:\project p2p\backend-I\stage9_service.py"
with open(p, "rb") as f:
    raw = f.read()
text = raw.decode("utf-8")
nl = "\r\n" if "\r\n" in text else "\n"
lines = text.split(nl)
for i in range(len(lines)):
    s = lines[i].strip()
    if s.startswith('"**Your progress:**') and not s.rstrip().endswith('"]'):
        # line is missing its closing quote+colon and a stray '"]' follows
        lines[i] = lines[i].rstrip() + '"]'
        if i + 1 < len(lines) and lines[i + 1].strip() == '"]':
            del lines[i + 1]
        break
open(p, "w", encoding="utf-8", newline="").write(nl.join(lines))
print("done")