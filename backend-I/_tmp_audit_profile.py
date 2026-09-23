"""Throwaway audit: profile.js <-> api-client.js <-> main.py <-> profile.html/css."""
import re

FRONT = r"C:/project p2p/peer to peer skill share/"
BACK = r"C:/project p2p/backend-I/"

js = open(FRONT + "profile.js", encoding="utf-8").read()
api = open(FRONT + "api-client.js", encoding="utf-8").read()
html = open(FRONT + "profile.html", encoding="utf-8").read()
css = open(FRONT + "profile.css", encoding="utf-8").read()
main = open(BACK + "main.py", encoding="utf-8").read()

out = []
P = out.append

# ---------------------------------------------------------------- 1) API surface
# profile.js reaches the client through several aliases: `var API = window.SkillShareAPI`.
aliases = set(re.findall(r"\b([A-Za-z_$][\w$]*)\s*=\s*(?:window\.|globalThis\.)?SkillShareAPI\b", js))
aliases.add("SkillShareAPI")
aliases |= set(re.findall(r"\b([A-Za-z_$][\w$]*)\s*=\s*window\.SkillShareAPI\b", js))

call_re = re.compile(
    r"(?:(?:" + "|".join(sorted(map(re.escape, aliases))) + r")(?:\.([A-Za-z_$][\w$]*))?\.)?"
    # simple form below
)
used = {}
for m in re.finditer(r"(?:window\.|globalThis\.)?(?:SkillShareAPI|" + "|".join(sorted(map(re.escape, aliases - {"SkillShareAPI"}))) + r")\.([A-Za-z_$][\w$]*)\s*\(", js):
    name = m.group(1)
    line = js[: m.start()].count("\n") + 1
    used.setdefault(name, []).append(line)

declared = set(re.findall(r"\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=", js))
defined = set(re.findall(r"^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:\(|function)", api, re.M))
defined |= set(re.findall(r"^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{", api, re.M))

P("=== 1. API methods CALLED BY profile.js (aliases: %s) ===" % sorted(aliases))
for name in sorted(used):
    flag = "" if name in defined else "   <== NOT IN api-client.js"
    P("  %-26s x%-3d lines %s%s" % (name, len(used[name]), used[name][:8], flag))
P("")
missing_methods = sorted(n for n in used if n not in defined)
P("MISSING FROM api-client.js: %s" % (missing_methods or "none"))
P("")

# ---------------------------------------------------------------- 2) direct fetch
P("=== 2. raw fetch()/XHR in profile.js ===")
for m in re.finditer(r"[^\n]*\bfetch\s*\(", js):
    P("  " + m.group(0).strip()[:160])
P("")

# ---------------------------------------------------------------- 3) backend routes
routes = re.findall(r'@app\.(get|post|put|patch|delete)\("([^"]+)"', main)
routes += re.findall(r'@(?:api_)?router\.(get|post|put|patch|delete)\("([^"]+)"', main)
routes += re.findall(r'@app\.(get|post|put|patch|delete)\(\s*"([^"]+)"', main)
route_paths = sorted(set(p for _, p in routes))
P("=== 3. backend routes in main.py (count=%d) ===" % len(route_paths))
P("\n".join("  " + p for p in route_paths))
P("")

# ---------------------------------------------------------------- 4) paths used by api-client
api_paths = sorted(set(re.findall(r'["\'`](/api/[A-Za-z0-9_\-/{}$\.:]*)["\'`]', api)))
P("=== 4. /api paths referenced by api-client.js (count=%d) ===" % len(api_paths))
P("\n".join("  " + p for p in api_paths))
P("")

def norm(p):
    p = p.split("?")[0]
    p = re.sub(r"\$\{[^}]*\}", "{X}", p)
    p = re.sub(r"\{[^}]*\}", "{X}", p)
    return p.rstrip("/")

route_norm = {}
for meth, p in routes:
    route_norm.setdefault(norm(p), set()).add(meth.upper())

unmatched = []
for p in api_paths:
    n = norm(p)
    if n in route_norm:
        continue
    # try to find a fuzzy match
    fuzz = [r for r in route_norm if r.startswith(n.rsplit("/", 1)[0])]
    unmatched.append((p, fuzz[:4]))
P("=== 5. api-client paths with NO literal main.py route ===")
for p, fuzz in unmatched:
    P("  %-55s maybe-> %s" % (p, fuzz))
P("")

# ---------------------------------------------------------------- 6) DOM ids
html_ids = set(re.findall(r'id="([^"]+)"', html))
js_ids = set(re.findall(r'\$\("([^"]+)"\)', js))
js_ids |= set(re.findall(r'getElementById\("([^"]+)"\)', js))
js_ids |= set(re.findall(r'txt\("([^"]+)"', js))
js_ids |= set(re.findall(r'data-id="([^"]+)"', js))
P("=== 6. DOM ids looked up by profile.js but absent in profile.html ===")
P("  js ids: %d ; html ids: %d" % (len(js_ids), len(html_ids)))
miss_ids = sorted(i for i in js_ids if i not in html_ids)
P("  missing: %s" % (miss_ids or "none"))
P("")

sections_html = set(re.findall(r'data-section="([^"]+)"', html))
sections_js = set(re.findall(r'setSection\("([^"]+)"', js))
P("=== 7. sections ===")
P("  html: %s" % sorted(sections_html))
P("  js  : %s" % sorted(sections_js))
P("  js-not-html: %s" % sorted(sections_js - sections_html))
P("  html-not-js: %s" % sorted(sections_html - sections_js))
P("")

# ---------------------------------------------------------------- 8) CSS classes
js_classes = set()
for m in re.findall(r'class=\\?\\?"([^"\\]+)', js):
    for c in m.split():
        if c.startswith("pf-"):
            js_classes.add(c)
for m in re.findall(r'class="([^"$]*)"', js):
    for c in m.split():
        if c.startswith("pf-"):
            js_classes.add(c)
for m in re.findall(r'classList\.(?:add|remove|toggle)\("([^"]+)"', js):
    js_classes.add(m)
css_classes = set(re.findall(r"\.([A-Za-z][A-Za-z0-9_-]*)", css))
P("=== 8. pf-* classes emitted by profile.js but not styled in profile.css ===")
miss = sorted(c for c in js_classes if c not in css_classes)
P("  js classes: %d" % len(js_classes))
P("  missing: %s" % (miss or "none"))
P("")

report = "\n".join(out)
open(BACK + "_tmp_audit_report.txt", "w", encoding="utf-8").write(report)
print("written; lines=%d" % len(out))
