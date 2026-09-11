#!/usr/bin/env python3
"""Run all profile dropdown updates."""
import pathlib, re, sys

BASE = pathlib.Path('c:/project p2p/peer to peer skill share')

SCRIPTS_BODY = (
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

CSS_HEAD = '    <link rel="stylesheet" href="components/profile-dropdown.css">\n'

def add_scripts(html):
    if 'profile-dropdown.css' not in html:
        html = html.replace('</head>', CSS_HEAD + '</head>')
    if 'profile-dropdown.js' not in html:
        html = html.replace('</body>', SCRIPTS_BODY + '</body>')
    return html

def update_file(filepath, old, new):
    p = BASE / filepath
    if not p.exists():
        print(f'  SKIP: {filepath} not found')
        return False
    t = p.read_text(encoding='utf-8')
    if old in t:
        t = t.replace(old, new)
        t = add_scripts(t)
        p.write_text(t, encoding='utf-8')
        print(f'  UPDATED: {filepath}')
        return True
    print(f'  NOT FOUND: {filepath} - pattern missing')
    return False

def ensure_container(filepath):
    """Add container + scripts if missing."""
    p = BASE / filepath
    if not p.exists():
        print(f'  SKIP: {filepath} not found')
        return
    t = p.read_text(encoding='utf-8')
    if 'profileDropdownContainer' in t:
        print(f'  EXISTS: {filepath}')
        if 'profile-dropdown.css' not in t:
            t = add_scripts(t)
            p.write_text(t, encoding='utf-8')
            print(f'  ADDED scripts to {filepath}')
        return
    print(f'  NEEDS WORK: {filepath} - manual check needed')

# ========== COMMUNITY ==========
update_file(
    'community.html',
    (
        '                <!-- Profile -->\n\n'
        '                <div class="profile">\n\n'
        '                    <div class="profile-image">\n\n'
        '                        <img src="" alt="">\n\n'
        '                        <span class="online-dot"></span>\n\n'
        '                    </div>\n\n'
        '                    <span class="profile-name">\n'
        '                        Anonymous\n'
        '                    </span>\n\n'
        '                    <i class="fa-solid fa-chevron-down"></i>\n\n'
        '                </div>'
    ),
    (
        '                <!-- Profile dropdown rendered by shared component -->\n\n'
        '                <div id="profileDropdownContainer"></div>'
    )
)

# ========== DISCUSSION ROOM ==========
update_file(
    'discussion-room.html',
    (
        '                <div class="profile">\n\n'
        '                    <div class="profile-avatar">\n'
        '                        AD\n'
        '                    </div>\n\n'
        '                    <div class="profile-info">\n'
        '                        <strong>Anonymous</strong>\n'
        '                        <small>Learner</small>\n'
        '                    </div>\n\n'
        '                    <span>\u2304</span>\n\n'
        '                </div>'
    ),
    (
        '                <!-- Profile dropdown rendered by shared component -->\n\n'
        '                <div id="profileDropdownContainer"></div>'
    )
)
