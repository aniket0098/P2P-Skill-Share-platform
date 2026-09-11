#!/usr/bin/env python3
"""Fix profile.js - escapeRole and roleLink functions."""
import pathlib
import re

p = pathlib.Path('peer to peer skill share/profile.js')
t = p.read_text(encoding='utf-8')
original = t

# Fix 1: escapeRole function
old_escape = '''function escapeRole(s) {
    return String(s == null ? "" : s).replace(/[&<>"\\']/g,, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}'''

new_escape = '''function escapeRole(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}'''

if old_escape in t:
    t = t.replace(old_escape, new_escape, 1)
    print('Fixed escapeRole')
else:
    print('escapeRole pattern not found, using regex')
    t, count = re.subn(
        r'function escapeRole\(s\) \{.*?\}',
        new_escape,
        t,
        count=1,
        flags=re.DOTALL
    )
    print(f'Regex fixed: {count} replacements')

# Fix 2: roleLink function  
old_link = '''function roleLink(v) {
    if (!v) return '<span class="field-val muted">Not provided</span>';
    return '<a class="field-val role-link" href="' + escapeRole(v) + '" target="_blank" rel="noopener">' + escapeRole(v.replace(/^https?:\\/\\//, ""))) + '</a>';
}'''

new_link = '''function roleLink(v) {
    if (!v) return '<span class="field-val muted">Not provided</span>';
    const clean = (v || "").replace(/^https?:\\/\\//, "");
    return '<a class="field-val role-link" href="' + escapeRole(v) + '" target="_blank" rel="noopener">' + escapeRole(clean) + '</a>';
}'''

if old_link in t:
    t = t.replace(old_link, new_link, 1)
    print('Fixed roleLink')
else:
    print('roleLink pattern not found, using regex')
    t, count = re.subn(
        r'function roleLink\(v\) \{.*?\}',
        new_link,
        t,
        count=1,
        flags=re.DOTALL
    )
    print(f'Regex fixed: {count} replacements')

# Fix 3: Remove extra brace before renderRoleProfile
if '\n}\nfunction renderRoleProfile(data) {' in t:
    t = t.replace('\n}\nfunction renderRoleProfile(data) {', '\nfunction renderRoleProfile(data) {', 1)
    print('Removed extra brace')

if t != original:
    p.write_text(t, encoding='utf-8')
    print('Written profile.js')
else:
    print('No changes')
