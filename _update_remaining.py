#!/usr/bin/env python3
"""Update pages to use shared profile dropdown component."""
import pathlib
import re

BASE = pathlib.Path('c:/project p2p/peer to peer skill share')

HEAD_ADD = '    <link rel="stylesheet" href="components/profile-dropdown.css">\n'
SCRIPTS_HEAD = (
    '    <script src="config.js"></script>\n'
    '    <script src="api-client.js"></script>\n'
    '    <script src="auth.js"></script>\n'
)
SCRIPTS_BODY = (
    '    <script src="components/profile-dropdown.js"></script>\n'
    '    <script>\n'
    "        document.addEventListener('DOMContentLoaded', () => {\n"
    '            if (window.SkillShareProfileDropdown) {\n'
    "                window.SkillShareProfileDropdown.init('#profileDropdownContainer');\n"
    '            }\n'
    '        });\n'
    '    </script>\n'
)


def inject_resources(html: str) -> str:
    """Add CSS in head, JS in body if not already present."""
    if 'profile-dropdown.css' not in html:
        html = html.replace('</head>', HEAD_ADD + '</head>')
    if 'api-client.js' not in html:
        html = html.replace('</head>', SCRIPTS_HEAD + '</head>')
    if 'profile-dropdown.js' not in html:
        html = html.replace('</body>', SCRIPTS_BODY + '</body>')
    return html


def inject_if_needed(filepath: str):
    """Read file, add resources, write back."""
    p = BASE / filepath
    t = p.read_text(encoding='utf-8')
    t = inject_resources(t)
    p.write_text(t, encoding='utf-8')


def update_discussion_room() -> bool:
    """Replace hardcoded Anonymous profile div with dropdown container."""
    p = BASE / 'discussion-room.html'
    t = p.read_text(encoding='utf-8')
    old = (
        '                <div class="profile">\n'
        '\n'
        '                    <div class="profile-avatar">\n'
        '                        AD\n'
        '                    </div>\n'
        '\n'
        '                    <div class="profile-info">\n'
        '                        <strong>Anonymous</strong>\n'
        '                        <small>Learner</small>\n'
        '                    </div>\n'
        '\n'
        '                    <span>\u2302;</span>\n'
        '\n'
        '                </div>'
    )
    new = (
        '                <!-- Profile dropdown - rendered by shared component -->\n'
        '\n'
        '                <div id="profileDropdownContainer"></div>'
    )
    if old in t:
        t = t.replace(old, new)
        inject_resources(t)
        p.write_text(t, encoding='utf-8')
        print('discussion-room.html: updated')
        return True
    print('discussion-room.html: profile div not found')
    return False


def update_discussion_waiting() -> bool:
    """Add topbar with profile dropdown container."""
    p = BASE / 'discussion-waiting.html'
    t = p.read_text(encoding='utf-8')
    topbar = (
        '    <!-- TOPBAR -->\n'
        '\n'
        '    <header class="topbar">\n'
        '\n'
        '        <div class="topbar-left">\n'
        '            <a class="brand" href="dashboard.html">\n'
        '                <span class="brand-mark">S</span>\n'
        '                <span class="brand-text">SkillShare</span>\n'
        '            </a>\n'
        '        </div>\n'
        '\n'
        '        <div class="topbar-right">\n'
        '            <div id="profileDropdownContainer"></div>\n'
        '        </div>\n'
        '\n'
        '    </header>\n'
        '\n'
    )
    old = (
        '    <!-- =====================================================\n'
        '         STAGE\n'
        '    ====================================================== -->\n'
        '\n'
        '    <main class="stage">'
    )
    if old in t:
        t = t.replace(old, topbar + old)
        inject_resources(t)
        p.write_text(t, encoding='utf-8')
        print('discussion-waiting.html: updated')
        return True
    print('discussion-waiting.html: STAGE marker not found')
    return False


# credits.html - replace profile-wrapper section
p = pathlib.Path('peer to peer skill share/credits.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    # Replace the profile-wrapper div with our container
    t = re.sub(
        r'<div class="profile-wrapper">.*?</div>\s*</div>',
        '<div id="profileDropdownContainer"></div>',
        t,
        flags=re.DOTALL
    )
    add_head_and_init('peer to peer skill share/credits.html')
    print("Updated: credits.html")

# live-discussions.html - replace profile-wrapper section
p = pathlib.Path('peer to peer skill share/live-discussions.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    # Replace the profile-wrapper div with our container
    t = re.sub(
        r'<div class="profile-wrapper">.*?</div>\s*</div>',
        '<div id="profileDropdownContainer"></div>',
        t,
        flags=re.DOTALL
    )
    add_head_and_init('peer to peer skill share/live-discussions.html')
    print("Updated: live-discussions.html")

# setting.html - replace user-menu-trigger and user-dropdown
p = pathlib.Path('peer to peer skill share/setting.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    # Replace user-menu-trigger button with our container
    t = re.sub(
        r'<button class="user-menu-trigger"[^>]*>.*?</button>',
        '<div id="profileDropdownContainer"></div>',
        t,
        flags=re.DOTALL
    )
    # Remove the old user-dropdown div
    t = re.sub(
        r'<!--.*?USER DROPDOWN.*?-->.*?</div>\s*</div>',
        '',
        t,
        flags=re.DOTALL
    )
    add_head_and_init('peer to peer skill share/setting.html')
    print("Updated: setting.html")

# profile.html - replace mini-profile in topbar
p = pathlib.Path('peer to peer skill share/profile.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    # Replace the mini-profile link with our container
    t = re.sub(
        r'<a href="profile\.html" class="mini-profile[^"]*"[^>]*>.*?</a>',
        '<div id="profileDropdownContainer"></div>',
        t,
        flags=re.DOTALL
    )
    add_head_and_init('peer to peer skill share/profile.html')
    print("Updated: profile.html")

print("\nDone with remaining pages")
