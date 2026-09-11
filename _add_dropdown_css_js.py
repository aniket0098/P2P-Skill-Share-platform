#!/usr/bin/env python3
"""Add shared profile dropdown to pages that already have container but missing CSS/JS."""
import pathlib

BASE = pathlib.Path('c:/project p2p/peer to peer skill share')

# Scripts to add before </body>
SCRIPTS = (
    '\n    <script src="config.js"></script>\n'
    '    <script src="api-client.js"></script>\n'
    '    <script src="auth.js"></script>\n'
    '    <script src="components/profile-dropdown.js"></script>\n'
    '    <script>\n'
    '        document.addEventListener("DOMContentLoaded", () => {\n'
    '            if (window.SkillShareProfileDropdown) {\n'
    '                window.SkillShareProfileDropdown.init("#profileDropdownContainer");\n'
    '            }\n'
    '        });\n'
    '    </script>\n'
)

# CSS to add before </head>
CSS_LINK = '    <link rel="stylesheet" href="components/profile-dropdown.css">\n'


def update_page(name):
    p = BASE / name
    if not p.exists():
        print(f"{name}: NOT FOUND")
        return
    t = p.read_text(encoding='utf-8')

    # Add CSS if missing
    if 'profile-dropdown.css' not in t:
        t = t.replace('</head>', CSS_LINK + '</head>')
        print(f"  Added CSS to {name}")

    # Add JS + init if missing
    if 'profile-dropdown.js' not in t:
        t = t.replace('</body>', SCRIPTS + '</body>')
        print(f"  Added JS to {name}")

    p.write_text(t, encoding='utf-8')
    print(f"{name}: updated")


if __name__ == '__main__':
    # Pages that already have the container but are missing CSS/JS
    for name in [
        'community.html',
        'discussion-room.html',
    ]:
        update_page(name)
