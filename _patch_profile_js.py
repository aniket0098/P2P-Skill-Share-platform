#!/usr/bin/env python3
from pathlib import Path
p = Path("peer to peer skill share/profile.js")
text = p.read_text(encoding="utf-8")
print("BEFORE chars:", len(text))
print("escapeRole count:", text.count("function escapeRole(s)"))
print("renderRoleProfile count:", text.count("function renderRoleProfile(data)"))
print("loadAll fetch getMyRoleProfile present:", "API.getMyRoleProfile()" in text)
