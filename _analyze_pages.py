import pathlib

# Analyze all HTML pages
html_dir = pathlib.Path('peer to peer skill share')
if not html_dir.exists():
    html_dir = pathlib.Path('.')

results = []
for f in sorted(html_dir.glob('*.html')):
    t = f.read_text(encoding='utf-8', errors='replace')
    has_css = 'profile-dropdown.css' in t
    has_js = 'profile-dropdown.js' in t
    has_container = 'profileDropdownContainer' in t
    has_anon = 'Anonymous' in t and ('profile' in t.lower() or 'user' in t.lower())
    results.append((f.name, has_css, has_js, has_container, has_anon))

print(f'{"Name":30s} {"CSS":5s} {"JS":5s} {"Container":10s} {"Anon":5s}')
print('-' * 55)
for name, css, js, container, anon in results:
    print(f'{name:30s} {str(css):5s} {str(js):5s} {str(container):10s} {str(anon):5s}')

# Now detailed analysis of pages that need work
print('\n\n=== DETAILED ANALYSIS ===')
pages_to_check = [
    'community.html',
    'discussion-room.html', 
    'discussion-waiting.html',
    'match-waiting.html',
    'live-learning.html',
    'projects.html',
    'requests.html',
    'session-room.html',
]

for name in pages_to_check:
    p = html_dir / name
    if not p.exists():
        print(f'\n{name}: FILE NOT FOUND')
        continue
    t = p.read_text(encoding='utf-8', errors='replace')
    
    print(f'\n{"="*60}')
    print(f'FILE: {name}')
    print(f'{"="*60}')
    
    # Check for topbar
    for marker in ['<header class="topbar"', '<header class="app-head"', '<header class="top-header"', '<div class="topbar"']:
        idx = t.find(marker)
        if idx >= 0:
            end = t.find('</header>', idx)
            if end < 0:
                end = t.find('</div>', idx + 100)
                if end >= 0:
                    end += 6
            header = t[idx:end] if end >= 0 else t[idx:idx+500]
            print(f'\nHeader section ({len(header)} chars):')
            for line in header.split('\n')[:30]:
                stripped = line.strip()
                if stripped:
                    print(f'  {stripped}')
            break
    
    # Check for profile-related markup
    for pattern in ['profile-wrap', 'profile-area', 'profile-menu', 'user-menu', 
                    'profile-link', 'user-chip', 'profile-btn', 'profile-image',
                    'profile-name', 'profile-avatar', 'avatar-', 'profile-dropdown',
                    'profileDropdownContainer', '<!-- Profile']:
        idx = t.find(pattern)
        if idx >= 0:
            ctx_start = max(0, idx - 50)
            ctx_end = min(len(t), idx + 300)
            ctx = t[ctx_start:ctx_end]
            print(f'\n  Found "{pattern}" at char {idx}:')
            for line in ctx.split('\n')[:10]:
                if line.strip():
                    print(f'    {line.strip()}')
    
    # Check bottom scripts
    print(f'\n  Bottom scripts:')
    for script_tag in ['profile-dropdown.js', 'config.js', 'api-client.js', 'auth.js']:
        idx = t.rfind(script_tag)
        if idx >= 0:
            ctx = t[max(0,idx-10):idx+len(script_tag)+50]
            print(f'    {ctx.strip()[:120]}')
