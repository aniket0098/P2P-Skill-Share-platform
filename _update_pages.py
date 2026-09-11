import pathlib
import re

def update_page(filepath, head_additions, header_replacements, body_additions=None):
    """Update a page with profile dropdown component."""
    p = pathlib.Path(filepath)
    t = p.read_text(encoding='utf-8')
    
    # Add CSS and JS to head
    for addition in head_additions:
        if addition not in t:
            t = t.replace('</head>', f'    {addition}\n</head>')
    
    # Replace header profile elements
    for old, new in header_replacements:
        if old in t:
            t = t.replace(old, new)
    
    # Add body script if needed
    if body_additions:
        for addition in body_additions:
            if addition not in t:
                t = t.replace('</body>', f'{addition}\n</body>')
    
    p.write_text(t, encoding='utf-8')
    print(f"Updated: {filepath}")

# Common head additions
head_add = [
    '<link rel="stylesheet" href="components/profile-dropdown.css">',
    '<script src="config.js"></script>',
    '<script src="api-client.js"></script>',
    '<script src="auth.js"></script>',
    '<script src="components/profile-dropdown.js"></script>',
]

# Common init script
init_script = '''
    <script>
        document.addEventListener("DOMContentLoaded", function () {
            if (window.SkillShareProfileDropdown) {
                SkillShareProfileDropdown.init("#profileDropdownContainer");
            }
        });
    </script>
'''

# Pages with app-pages.css pattern (bookmarks, calendar, create-session)
app_pages = ['bookmarks.html', 'calendar.html', 'create-session.html']
for page in app_pages:
    p = pathlib.Path(f'peer to peer skill share/{page}')
    if p.exists():
        t = p.read_text(encoding='utf-8')
        # Add head additions
        for addition in head_add:
            if addition not in t:
                t = t.replace('</head>', f'    {addition}\n</head>')
        # Replace profile link with dropdown container
        t = re.sub(
            r'<a href="profile.html"><img[^>]*src=""[^>]*alt="Profile"></a>',
            '<div id="profileDropdownContainer"></div>',
            t
        )
        # Add init script before closing body or at end
        if '#profileDropdownContainer' in t and 'SkillShareProfileDropdown.init' not in t:
            t = t.rstrip() + '\n' + init_script.strip() + '\n'
        p.write_text(t, encoding='utf-8')
        print(f"Updated: {page}")

print("\nDone with app-pages pattern pages")
