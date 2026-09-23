"""Check that classes emitted from profile.js exist in profile.css."""
import re

FRONT = r"C:/project p2p/peer to peer skill share/"
js = open(FRONT + "profile.js", encoding="utf-8").read()
css = open(FRONT + "profile.css", encoding="utf-8").read()

js_classes = set()
for m in re.findall(r'class=\\?\\?"([^"\\]+)', js):
    for c in m.split():
        if c.startswith("pf-") or c in ("on",):
            js_classes.add(c)
for m in re.findall(r'classList\.(?:add|remove)\("([^"]+)"\)', js):
    js_classes.add(m)

css_classes = set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", css))
missing = sorted(c for c in js_classes if c not in css_classes)
print("classes emitted by JS:", len(js_classes))
print("missing from profile.css:", missing or "none")
