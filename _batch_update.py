"""
Batch update: add shared profile dropdown to all pages that don't have it yet.
Handles both plain <div> containers and pages where profile is inside <header>/blockquote.
"""
import pathlib
import re

BASE = pathlib.Path('c:/project p2p/peer to peer skill share')

# HTML that renders the profile dropdown container in various contexts
CONTAINER_HTML = '<div id="profileDropdownContainer"></div>'

# Scripts to add before </body>
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

# CSS to add before </head>
CSS_HEAD = '    <link rel="stylesheet" href="components/profile-dropdown.css">\n'


def add_scripts(html):
    """Add CSS + JS to an HTML page if not already present."""
    if 'profile-dropdown.css' not in html:
        html = html.replace('</head>', CSS_HEAD + '</head>')
    if 'profile-dropdown.js' not in html:
        html = html.replace('</body>', SCRIPTS_BODY + '</body>')
    return html


def replace_in_file(filepath, old_str, new_str, extra_transform=None):
    """Replace old_str with new_str in filepath, optionally transform further."""
    p = pathlib.Path(filepath)
    if not p.exists():
        print(f'  SKIP: {filepath} not found')
        return False
    t = p.read_text(encoding='utf-8')
    if old_str in t:
        t = t.replace(old_str, new_str)
        t = add_scripts(t)
        if extra_transform:
            t = extra_transform(t)
        p.write_text(t, encoding='utf-8')
        print(f'  UPDATED: {filepath}')
        return True
    else:
        print(f'  NOT FOUND in {filepath}')
        return False


def add_if_missing(filepath, container_marker, insert_before=None, extra_transform=None):
    """Add container to a page if not present, optionally at a specific location."""
    p = pathlib.Path(filepath)
    if not p.exists():
        print(f'  SKIP: {filepath} not found')
        return False
    t = p.read_text(encoding='utf-8')
    if container_marker in t:
        print(f'  ALREADY HAS container in {filepath}')
        # Still add scripts if missing
        if 'profile-dropdown.css' not in t or 'profile-dropdown.js' not in t:
            t = add_scripts(t)
            p.write_text(t, encoding='utf-8')
            print(f'  ADDED scripts to {filepath}')
        return True

    if insert_before and insert_before in t:
        # Insert container before the marker
        t = t.replace(insert_before, f'{CONTAINER_HTML}\n{insert_before}')
        t = add_scripts(t)
        if extra_transform:
            t = extra_transform(t)
        p.write_text(t, encoding='utf-8')
        print(f'  INSERTED container in {filepath}')
        return True

    print(f'  COULD NOT INSERT in {filepath}')
    return False
