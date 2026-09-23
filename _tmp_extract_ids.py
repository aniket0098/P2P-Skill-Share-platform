import re, pathlib

base = pathlib.Path("peer to peer skill share")
html = (base / "profile.html").read_text(encoding="utf-8")
ids = re.findall(r'id="([^"]+)"', html)
sections = re.findall(r'data-section="([^"]+)"', html)
rstates = re.findall(r'data-retry="([^"]+)"', html)
out = []
out.append("IDS (%d):" % len(ids))
out.append("\n".join(ids))
out.append("\nDATA-SECTION (%d): %s" % (len(sections), ", ".join(sections)))
out.append("DATA-RETRY: %s" % ", ".join(rstates))
css = (base / "profile.css").read_text(encoding="utf-8")
sel = sorted(set(re.findall(r'\.(pf-[a-z0-9-]+)', css)))
out.append("\nCSS CLASSES (%d):\n%s" % (len(sel), "\n".join(sel)))
pathlib.Path("_tmp_profile_ids.txt").write_text("\n".join(out), encoding="utf-8")
print("written", len(ids), len(sel))
