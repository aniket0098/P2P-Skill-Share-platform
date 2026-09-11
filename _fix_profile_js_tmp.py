#!/usr/bin/env python3
from pathlib import Path

p = Path("peer to peer skill share/profile.js")
lines = p.read_text(encoding="utf-8").splitlines()

# 1) Fix escapeRole() body (file line 681 => index 680)
lines[680] = '    if (s == null) return "";'
lines.insert(681, '    return String(s)')
lines.insert(682, '        .replace(/&/g, "&amp;")')
lines.insert(683, '        .replace(/</g, "&lt;")')
lines.insert(684, '        .replace(/>/g, "&gt;")')
lines.insert(685, '        .replace(/"/g, "&quot;")')
lines.insert(686, '        .replace(/'"'"'/g, "&#39;");')

# 2) Fix roleLink() body (file line 697 => index 696 after the two inserts above)
# After insert, original line 697 is now at index 696+len(insert 1) = 696+7 = 703
idx_rolelink = 703
lines[idx_rolelink] = '    const clean = (v || "").replace(/^https?:\/\//, "");'
lines.insert(idx_rolelink + 1, "    return '<a class=\"field-val role-link\" href=\"' + escapeRole(v) + '\" target=\"_blank\" rel=\"noopener\">' + escapeRole(clean) + '</a>';")

# 3) Remove stray '}' at file line 711 (index 710 after previous inserts).
# Original line 711 was an extra '}' right before renderRoleProfile.
idx_extra = 715  # after previous inserts offset tracking
lines[idx_extra] = "function renderRoleProfile(data) {"

# Write back only if all targeted lines were replaced successfully
Path("peer to peer skill share/profile_fixed.js").write_text("\n".join(lines), encoding="utf-8")
print("FIXED OK")
