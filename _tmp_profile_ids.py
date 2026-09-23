import re, pathlib

base = pathlib.Path("peer to peer skill share")
html = (base / "profile.html").read_text(encoding="utf-8")

# ids with the tag they belong to
for m in re.finditer(r"<([a-zA-Z0-9]+)([^>]*?)\bid=\"([^\"]+)\"([^>]*)>", html):
    tag, pre, i, post = m.group(1), m.group(2), m.group(3), m.group(4)
    extra = ""
    for key in ("data-section", "data-state", "data-retry", "data-tab", "data-mode", "role"):
        mm = re.search(r'%s="([^"]*)"' % key, pre + " " + post)
        if mm:
            extra += " %s=%s" % (key, mm.group(1))
    print("%-10s %-28s%s" % (tag, i, extra))
