"""Cross-check every $("id") referenced in profile.js against profile.html."""
import re, os

BASE = r"C:/project p2p/"
FRONT = BASE + "peer to peer skill share/"

js = open(FRONT + "profile.js", encoding="utf-8").read()
html = open(FRONT + "profile.html", encoding="utf-8").read()

html_ids = set(re.findall(r'id="([^"]+)"', html))
js_ids = set(re.findall(r'\$\("([^"]+)"\)', js))
js_ids |= set(re.findall(r'getElementById\("([^"]+)"\)', js))

missing = sorted(i for i in js_ids if i not in html_ids)
print("profile.js direct-lookup ids:", len(js_ids))
print("MISSING in profile.html:", missing if missing else "none")

# setSection names must exist as data-section values
sections = set(re.findall(r'data-section="([^"]+)"', html))
names = set(re.findall(r'setSection\("([^"]+)"', js))
print("setSection names missing:", sorted(names - sections) or "none")

# data-state values per section
print("data-state values:", sorted(set(re.findall(r'data-state="([^"]+)"', html))))

# txt("id") helpers write textContent; check those ids too
txt_ids = set(re.findall(r'txt\("([^"]+)"', js))
print("txt() ids missing:", sorted(i for i in txt_ids if i not in html_ids) or "none")
