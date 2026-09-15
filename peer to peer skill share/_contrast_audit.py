"""Automated contrast audit for requests.css (test-only helper).

Parses every rule in requests.css, resolves :root CSS variables, and
computes the WCAG contrast ratio for each rule that declares BOTH a
foreground and a background. Rules that only declare a foreground are
checked against the container surface their selector belongs to, using
the explicit map below. Exit code 1 when a real failure is found.
"""
import io
import re
import sys

CSS = r"c:\project p2p\peer to peer skill share\requests.css"

src = io.open(CSS, encoding="utf-8", errors="replace").read()
src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)

# ---- :root variables -------------------------------------------------------
root = re.search(r":root\s*\{(.*?)\}", src, flags=re.S).group(1)
VAR = {}
for name, value in re.findall(r"--([\w-]+)\s*:\s*([^;]+);", root):
    VAR[name] = value.strip()


def resolve(value):
    for _ in range(6):
        m = re.search(r"var\(\s*--([\w-]+)\s*\)", value)
        if not m:
            break
        value = value.replace(m.group(0), VAR.get(m.group(1), "#000000"))
    return value.strip()


def hex_of(value):
    """First #rgb/#rrggbb found in a value (gradients included)."""
    m = re.search(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", value)
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return h.lower()


def rgba_of(value, fallback_bg=None):
    """Return (r, g, b) for #hex or rgba(...) over a fallback background."""
    m = re.search(r"rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)",
                  value)
    if m:
        r, g, b = (float(m.group(i)) for i in (1, 2, 3))
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        if a < 1.0:
            base = rgba_of(fallback_bg or "#000000")
            r = r * a + base[0] * (1 - a)
            g = g * a + base[1] * (1 - a)
            b = b * a + base[2] * (1 - a)
        return (r, g, b)
    h = hex_of(value)
    if h:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    return None


def lum(rgb):
    def chan(c):
        c = c / 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (chan(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


PAGE = resolve(VAR["bg"])
SURFACE = resolve(VAR["surface"])          # cards / dropdown
SOFT = resolve(VAR["surface-soft"])
MODAL = "#0B1628"                           # .modal / .search-results input surface
INPUT = "#0B1628"

# Where a foreground-only rule actually renders.
CONTAINER = [
    (r"^\.card|^\.chip|^\.rel-pill|^\.status-badge|^\.avatar", SURFACE),
    (r"^\.search-item|^\.search-empty|^\.search-status|^\.search-hint|^\.search-results-head", SURFACE),
    (r"^\.search-see-all", SOFT),
    (r"^\.p-|^\.skill-", MODAL),
    (r"^\.empty-state|^\.empty-icon", SURFACE),
    (r"^\.sk-", SURFACE),
    (r"^\.panel|^\.tab|^\.filter-chip", PAGE),
    (r"^\.topbar|^\.hero", PAGE),
]

rows = []
for selector, decls in re.findall(r"([^{}]+)\{([^{}]*)\}", src):
    selector = " ".join(selector.split())
    decl = dict(re.findall(r"([\w-]+)\s*:\s*([^;]+)", decls))
    fg_val = decl.get("color")
    if not fg_val:
        continue
    fg_val = resolve(fg_val)
    bg_val = decl.get("background") or decl.get("background-color")
    bg_val = resolve(bg_val) if bg_val else None
    if bg_val:
        if "gradient" in bg_val:
            bg = rgba_of(bg_val)
            note = "gradient"
        else:
            bg = rgba_of(bg_val, PAGE)
            note = "own bg"
    else:
        bg = rgba_of(PAGE)
        note = "inherited surface"
        for pattern, surface in CONTAINER:
            if re.search(pattern, selector.split(",")[0].strip()):
                bg = rgba_of(surface)
                break
    fg = rgba_of(fg_val, bg)
    if fg is None or bg is None or fg == bg:
        continue
    rows.append((selector, fg_val.strip(), note, ratio(fg, bg)))

rows.sort(key=lambda r: r[3])
print(f"page bg={PAGE}  surface={SURFACE}  soft={SOFT}  modal={MODAL}")
print(f"audited {len(rows)} text rules\n")
bad = 0
for selector, fg, note, r in rows:
    flag = "FAIL" if r < 4.5 else ("low " if r < 7 else "ok  ")
    if r < 4.5:
        bad += 1
    if r < 7:
        print(f"{flag} {r:5.2f}  {selector[:52]:<52} {fg:<22} ({note})")
print(f"\nbelow 4.5: {bad}   below 7.0: {sum(1 for r in rows if r[3] < 7)}")
sys.exit(1 if bad else 0)