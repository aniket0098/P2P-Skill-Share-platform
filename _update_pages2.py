import pathlib
import re

# Common head additions
head_add = [
    '<link rel="stylesheet" href="components/profile-dropdown.css">',
    '<script src="config.js"></script>',
    '<script src="api-client.js"></script>',
    '<script src="auth.js"></script>',
    '<script src="components/profile-dropdown.js"></script>',
]

# Common init script
init_script = '''<script>
    document.addEventListener("DOMContentLoaded", function () {
        if (window.SkillShareProfileDropdown) {
            SkillShareProfileDropdown.init("#profileDropdownContainer");
        }
    });
</script>'''

def update_page(filepath, profile_section_pattern, replacement):
    """Update a page with profile dropdown component."""
    p = pathlib.Path(filepath)
    if not p.exists():
        print(f"NOT FOUND: {filepath}")
        return
    t = p.read_text(encoding='utf-8')
    
    # Add head additions (only if not already present)
    for addition in head_add:
        if addition not in t:
            t = t.replace('</head>', f'    {addition}\n</head>')
    
    # Replace profile section
    if profile_section_pattern in t:
        t = t.replace(profile_section_pattern, replacement)
    else:
        print(f"  Pattern not found in {filepath}")
    
    # Add init script if not present
    if 'SkillShareProfileDropdown.init' not in t:
        t = t.rstrip() + '\n' + init_script + '\n'
    
    p.write_text(t, encoding='utf-8')
    print(f"Updated: {filepath}")

# explore.html - has mini-avatar and profile-text section
update_page(
    'peer to peer skill share/explore.html',
    '<div class="mini-avatar">\n                <a href="profile.html">P</a>\n            </div>\n\n            <di class="profile-text">\n                <a href="profile.html">Profile</a>\n\n        </div>',
    '<div id="profileDropdownContainer"></div>'
)

# community.html - check structure
p = pathlib.Path('peer to peer skill share/community.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    # Find the profile section
    if 'profile.html' in t:
        # Replace simple profile link
        t = re.sub(r'<a href="profile.html">[^<]*</a>', '<div id="profileDropdownContainer"></div>', t)
        for addition in head_add:
            if addition not in t:
                t = t.replace('</head>', f'    {addition}\n</head>')
        if 'SkillShareProfileDropdown.init' not in t:
            t = t.rstrip() + '\n' + init_script + '\n'
        p.write_text(t, encoding='utf-8')
        print(f"Updated: community.html")

# messages.html - has user-menu button
update_page(
    'peer to peer skill share/messages.html',
    '<button class="user-menu">\n                    <a href="profile.html">\n                        <img src="" alt="">\n\n                        <span>\n                            Profile\n                        </span>\n                    </a>\n\n                </button>',
    '<div id="profileDropdownContainer"></div>'
)

# projects.html
p = pathlib.Path('peer to peer skill share/projects.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    if 'profile.html' in t:
        t = re.sub(r'<a href="profile.html">[^<]*</a>', '<div id="profileDropdownContainer"></div>', t)
        for addition in head_add:
            if addition not in t:
                t = t.replace('</head>', f'    {addition}\n</head>')
        if 'SkillShareProfileDropdown.init' not in t:
            t = t.rstrip() + '\n' + init_script + '\n'
        p.write_text(t, encoding='utf-8')
        print(f"Updated: projects.html")

# my-learning.html
p = pathlib.Path('peer to peer skill share/my-learning.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    if 'profile.html' in t:
        t = re.sub(r'<a href="profile.html">[^<]*</a>', '<div id="profileDropdownContainer"></div>', t)
        for addition in head_add:
            if addition not in t:
                t = t.replace('</head>', f'    {addition}\n</head>')
        if 'SkillShareProfileDropdown.init' not in t:
            t = t.rstrip() + '\n' + init_script + '\n'
        p.write_text(t, encoding='utf-8')
        print(f"Updated: my-learning.html")

# notifications.html
p = pathlib.Path('peer to peer skill share/notifications.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    if 'profile.html' in t:
        t = re.sub(r'<a href="profile.html">[^<]*</a>', '<div id="profileDropdownContainer"></div>', t)
        for addition in head_add:
            if addition not in t:
                t = t.replace('</head>', f'    {addition}\n</head>')
        if 'SkillShareProfileDropdown.init' not in t:
            t = t.rstrip() + '\n' + init_script + '\n'
        p.write_text(t, encoding='utf-8')
        print(f"Updated: notifications.html")

# requests.html
p = pathlib.Path('peer to peer skill share/requests.html')
if p.exists():
    t = p.read_text(encoding='utf-8')
    if 'profile.html' in t:
        t = re.sub(r'<a href="profile.html">[^<]*</a>', '<div id="profileDropdownContainer"></div>', t)
        for addition in head_add:
            if addition not in t:
                t = t.replace('</head>', f'    {addition}\n</head>')
        if 'SkillShareProfileDropdown.init' not in t:
            t = t.rstrip() + '\n' + init_script + '\n'
        p.write_text(t, encoding='utf-8')
        print(f"Updated: requests.html")

print("\nDone with batch 2")
