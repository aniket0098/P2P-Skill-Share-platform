#!/usr/bin/env python3
"""Fix profile.js - error handler, account status, and add profile fetch."""
import pathlib
import re

p = pathlib.Path('peer to peer skill share/profile.js')
t = p.read_text(encoding='utf-8')
original = t

# Fix 1: error handler in loadRoleProfile
old_error = "body.innerHTML = '<div class=\"empty-state-box\"><div class=\"empty-state-icon\">⚠️</div><h4>Could not load role profile</h4><p>' + escapeRole((error && (error.detail || error.message))) || \"Please try again.\") + '</p><button type=\"button\" class=\"primary-btn mini-btn\" onclick=\"window.location.reload()\">Retry</button></div>';"

new_error = '''const msg = (error && (error.detail || error.message)) ? escapeRole(error.detail || error.message) : "Please try again.";
            body.innerHTML = '<div class="empty-state-box"><div class="empty-state-icon">⚠️</div><h4>Could not load role profile</h4><p>' + msg + '</p><button type="button" class="primary-btn mini-btn" onclick="window.location.reload()">Retry</button></div>';'''

if old_error in t:
    t = t.replace(old_error, new_error, 1)
    print('Fixed error handler')
else:
    print('Error handler pattern not found')
    # Try regex
    t, count = re.subn(
        r"body\.innerHTML = '.*?Could not load role profile.*?</div>';",
        new_error,
        t,
        count=1,
        flags=re.DOTALL
    )
    print(f'Regex fixed error handler: {count} replacements')

# Fix 2: account status extra paren
old_status = 'roleValue((u.account_status || "active")).toUpperCase()));'
new_status = 'roleValue((u.account_status || "active")).toUpperCase());'
if old_status in t:
    t = t.replace(old_status, new_status, 1)
    print('Fixed account status paren')

# Fix 3: Add profile fetch in loadAll
old_loadall = '''        renderProfile(currentUser);
        loadRoleProfile(currentUser);'''

new_loadall = '''        renderProfile(currentUser);
        // Load the backend-driven role profile (GET /profile/me)
        try {
            const roleRes = await window.SkillShareAPI.getMyRoleProfile();
            renderRoleProfile(roleRes);
        } catch (err) {
            if (err && err.status === 401) {
                // session handled globally
            } else {
                console.warn("Role profile could not be loaded:", err);
            }
        }'''

if old_loadall in t:
    t = t.replace(old_loadall, new_loadall, 1)
    print('Added profile fetch to loadAll')
else:
    # Search for the pattern with different spacing
    print('loadAll pattern not found, searching...')
    idx = t.find('renderProfile(currentUser);')
    if idx >= 0:
        snippet = t[idx:idx+200]
        print(f'Found at {idx}: {repr(snippet[:150])}')

if t != original:
    p.write_text(t, encoding='utf-8')
    print('Written profile.js')
else:
    print('No changes')
