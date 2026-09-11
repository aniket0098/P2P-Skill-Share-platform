#!/usr/bin/env python3
"""Update all remaining pages to use shared profile dropdown component."""
import pathlib

BASE = pathlib.Path('c:/project p2p/peer to peer skill share')

CSS = '    <link rel="stylesheet" href="components/profile-dropdown.css">\n'
SCRIPTS = (
    '    <script src="config.js"></script>\n'
    '    <script src="api-client.js"></script>\n'
    '    <script src="auth.js"></script>\n'
    '    <script src="components/profile-dropdown.js"></script>\n'
    '    <script>\n'
    "        document.addEventListener('DOMContentLoaded', () => {\n"
    '            if (window.SkillShareProfileDropdown) {\n'
    "                window.SkillShareProfileDropdown.init('#profileDropdownContainer');\n"
    '            }\n'
    '        });\n'
    '    </script>\n'
)
TOPBAR = '''    <!-- TOPBAR -->

    <header class="topbar">

        <div class="topbar-left">
            <a class="brand" href="dashboard.html">
                <span class="brand-mark">S</span>
                <span class="brand-text">SkillShare</span>
            </a>
        </div>

        <div class="topbar-right">
            <div id="profileDropdownContainer"></div>
        </div>

    </header>

'''


def add_assets(html):
    if 'profile-dropdown.css' not in html:
        html = html.replace('</head>', CSS + '</head>')
    if 'profile-dropdown.js' not in html:
        html = html.replace('</body>', SCRIPTS + '</body>')
    return html


def update_community():
    p = BASE / 'community.html'
    t = p.read_text(encoding='utf-8')
    marker = '<!-- Profile -->'
    idx = t.find(marker)
    if idx < 0:
        print('community.html: Profile comment not found')
        return False
    end = '                </div>\n'
    end_idx = t.find(end, idx)
    if end_idx < 0:
        print('community.html: closing div not found')
        return False
    end_idx += len(end)
    new = ('                <!-- Profile dropdown rendered by shared component -->\n'
           '\n'
           '                <div id="profileDropdownContainer"></div>')
    t = t[:idx] + new + t[end_idx:]
    t = add_assets(t)
    p.write_text(t, encoding='utf-8')
    print('community.html: updated')
    return True
