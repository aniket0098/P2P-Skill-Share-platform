#!/usr/bin/env python3
"""Update all remaining pages to use shared profile dropdown component."""
import pathlib

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

TOPBAR_HTML = (
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


def add_scripts_and_css(html):
    if 'profile-dropdown.css' not in html:
        html = html.replace('</head>', CSS_HEAD + '</head>')
    if 'profile-dropdown.js' not in html:
        html = html.replace('</body>', SCRIPTS_BODY + '</body>')
    return html


def update_discussion_room():
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
        '                    <span>⌄</span>\n'
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
        t = add_scripts_and_css(t)
        p.write_text(t, encoding='utf-8')
        print('discussion-room.html: updated\n')
        return
    print('discussion-room.html: NOT FOUND\n')


def update_discussion_waiting():
    p = BASE / 'discussion-waiting.html'
    t = p.read_text(encoding='utf-8')
    t = add_scripts_and_css(t)
    old = '    <!-- =====================================================\n         STAGE\n    ====================================================== -->\n\n    <main class="stage">'
    if old in t:
        t = t.replace(old, TOPBAR_HTML + old)
        p.write_text(t, encoding='utf-8')
        print('discussion-waiting.html: updated\n')
    else:
        print('discussion-waiting.html: NOT FOUND\n')


def update_match_waiting():
    p = BASE / 'match-waiting.html'
    t = p.read_text(encoding='utf-8')
    t = add_scripts_and_css(t)
    old = '    <!-- =====================================================\n         STAGE\n    ====================================================== -->\n\n    <main class="stage">'
    if old in t:
        t = t.replace(old, TOPBAR_HTML + old)
        p.write_text(t, encoding='utf-8')
        print('match-waiting.html: updated\n')
    else:
        print('match-waiting.html: NOT FOUND\n')


def update_live_learning():
    p = BASE / 'live-learning.html'
    t = p.read_text(encoding='utf-8')
    old = '           <!-- =================================================\n                PROFILE\n           ================================================== -->\n\n           <div class="profile-wrap">'
    if old in t:
        start = t.find(old)
        end = t.find('          </div>\n\n', start)
        if end < 0:
            end = t.find('        \n\n', start)
        if end > 0:
            end = t.find('\n', end) + 1
            full_old = t[start:end]
            full_new = '           <!-- =================================================\n                PROFILE\n           ================================================== -->\n\n           <div id="profileDropdownContainer"></div>'
            t = t[:start] + full_new + t[end:]
            t = add_scripts_and_css(t)
            p.write_text(t, encoding='utf-8')
            print('live-learning.html: updated\n')
            return
    print('live-learning.html: NOT FOUND\n')


def update_projects():
    p = BASE / 'projects.html'
    t = p.read_text(encoding='utf-8')
    old = '                     <!-- PROFILE -->\n                     <div class="profile-wrap">'
    if old in t:
        start = t.find(old)
        end = t.find('                 </div>\n\n                </div>\n\n            </header>', start)
        if end > 0:
            end = t.find('</header>', end) + len('</header>')
            full_old = t[start:end]
            full_new = '                     <!-- PROFILE -->\n                     <div id="profileDropdownContainer"></div>'
            t = t[:start] + full_new + t[end:]
            t = add_scripts_and_css(t)
            p.write_text(t, encoding='utf-8')
            print('projects.html: updated\n')
            return
    print('projects.html: NOT FOUND\n')


def update_requests():
    p = BASE / 'requests.html'
    t = p.read_text(encoding='utf-8')
    old = '            <div class="user-chip" id="userChip">'
    if old in t:
        start = t.find(old)
        end = t.find('            </div>\n        </div>\n    </header>', start)
        if end > 0:
            end = t.find('</header>', end) + len('</header>')
            full_old = t[start:end]
            full_new = '            <div id="profileDropdownContainer"></div>'
            t = t[:start] + full_new + t[end:]
            t = add_scripts_and_css(t)
            p.write_text(t, encoding='utf-8')
            print('requests.html: updated\n')
            return
    print('requests.html: NOT FOUND\n')


def update_session_room():
    p = BASE / 'session-room.html'
    t = p.read_text(encoding='utf-8')
    old = '<a class="profile-link" href="profile.html">'
    if old in t:
        start = t.find(old)
        end = t.find('</a>', start) + len('</a>')
        full_old = t[start:end]
        full_new = '<div id="profileDropdownContainer"></div>'
        t = t[:start] + full_new + t[end:]
        t = add_scripts_and_css(t)
        p.write_text(t, encoding='utf-8')
        print('session-room.html: updated\n')
        return
    print('session-room.html: NOT FOUND (trying head-right)\n')


if __name__ == '__main__':
    update_community()
    update_discussion_room()
    update_discussion_waiting()
    update_match_waiting()
    update_live_learning()
    update_projects()
    update_requests()
    update_session_room()
    print('Done.')
