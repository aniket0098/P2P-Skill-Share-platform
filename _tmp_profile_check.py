import re, sys, pathlib

base = pathlib.Path("peer to peer skill share")
html = (base / "profile.html").read_text(encoding="utf-8")
css = (base / "profile.css").read_text(encoding="utf-8")

names = set()
for attr in re.findall(r'class="([^"]+)"', html):
    for token in attr.split():
        names.add(token)

defined = set(re.findall(r"\.([a-zA-Z0-9_-]+)", css))
missing = sorted(n for n in names if n.startswith("pf-") and n not in defined)
print("HTML lines:", html.count("\n") + 1)
print("APPEND marker present:", "APPEND" in html)
print("MISSING IN CSS (%d):" % len(missing))
for m in missing:
    print("  ", m)

ids = set(re.findall(r'id="([^"]+)"', html))
print("\nTOTAL ids:", len(ids))
js = base / "profile.js"
print("profile.js exists:", js.exists())
