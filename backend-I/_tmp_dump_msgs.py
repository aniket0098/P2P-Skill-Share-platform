"""Throwaway: dump user messages from a Cline session transcript."""
import json
import os
import re

SESSION = "1790154927276_st6zf"
SESS_DIR = r"C:/Users/danik/.cline/data/sessions/" + SESSION
MSG_FILE = os.path.join(SESS_DIR, SESSION + ".messages.json")
OUT_DIR = r"C:/Users/danik/AppData/Local/Temp/cline_spec"

os.makedirs(OUT_DIR, exist_ok=True)
data = json.load(open(MSG_FILE, encoding="utf-8"))
msgs = data.get("messages") or (data if isinstance(data, list) else [])

mode_re = re.compile(r'mode="([a-z]+)"')
ui = 0
for i, m in enumerate(msgs):
    if not isinstance(m, dict) or m.get("role") != "user":
        continue
    c = m.get("content")
    if isinstance(c, list):
        c = " ".join([x.get("text", "") if isinstance(x, dict) else str(x) for x in c])
    c = (c or "").strip()
    if not c:
        continue
    mode = "act"
    if c.startswith("<user_input"):
        mm = mode_re.search(c)
        mode = mm.group(1) if mm else "?"
        c = c.split(">", 1)[1]
    ui += 1
    out = os.path.join(OUT_DIR, "msg_%02d_%s.txt" % (ui, mode))
    open(out, "w", encoding="utf-8").write(c)
    print("idx", i, "| mode", mode, "| len", len(c), "|", c[:120].replace("\n", " | "))
