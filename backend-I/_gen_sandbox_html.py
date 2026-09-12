
OUT = r"C:\project p2p\peer to peer skill share\industry-sandbox.html"

html = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Industry Sandbox \u2014 SkillShare</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="dashboard.css"><link rel="stylesheet" href="portal.css">
<link rel="stylesheet" href="portal-shell.css"><link rel="stylesheet" href="industry-sandbox.css"></head>
<body data-page="industry-sandbox.html" data-role="student">
<div id="app-sidebar"></div><div class="app-main"><div id="app-topbar"></div>
<main class="page-content">
<div class="sandbox-hero"><span class="eyebrow" style="color:#38bdf8;">Build \u00b7 Simulations \u00b7 Real-world Problems</span>
<h1>Industry <span>Sandbox</span></h1><p>Solve realistic industry challenges. Submit your solution. Earn credible skill evidence.</p></div>
<section class="sandbox-stats" id="sb-stats">
    <div class="sandbox-stat"><b id="stat-joined">0</b><span>Joined</span></div>
    <div class="sandbox-stat"><b id="stat-progress">0</b><span>In Progress</span></div>
    <div class="sandbox-stat"><b id="stat-completed">0</b><span>Completed</span></div>
    <div class="sandbox-stat"><b id="stat-skills">0</b><span>Skills Demonstrated</span></div>
</section>
<div class="sandbox-filters">
    <input type="text" id="sb-search" placeholder="Search challenges...">
    <select id="sb-domain"><option value="">All Domains</option></select>
    <select id="sb-difficulty"><option value="">All Levels</option>


# ---- sandbox-challenge.html (detail page) ----
CHALLENGE_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Challenge - SkillShare</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="dashboard.css"><link rel="stylesheet" href="portal.css">
<link rel="stylesheet" href="portal-shell.css"><link rel="stylesheet" href="industry-sandbox.css"></head>
<body data-page="sandbox-challenge.html" data-role="student">
<div id="app-sidebar"></div><div class="app-main"><div id="app-topbar"></div>
<main class="page-content">
<div id="challenge-detail"><div class="sandbox-loading">Loading challenge...</div></div>
</main></div><div id="toast-root"></div>
<script src="config.js"></script><script src="api-client.js"></script><script src="portal-shell.js"></script><script src="portal.js"></script>
<script src="sandbox-challenge.js"></script></body></html>"""

with open(r"C:\project p2p\peer to peer skill share\sandbox-challenge.html", "w", encoding="utf-8") as f:
    f.write(CHALLENGE_HTML)

# ---- sandbox-workspace.html ----
WORKSPACE_HTML = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Workspace - SkillShare</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="dashboard.css"><link rel="stylesheet" href="portal.css">
<link rel="stylesheet" href="portal-shell.css"><link rel="stylesheet" href="industry-sandbox.css"></head>
<body data-page="sandbox-workspace.html" data-role="student">
<div id="app-sidebar"></div><div class="app-main"><div id="app-topbar"></div>
<main class="page-content" style="padding:16px;">
<div id="workspace-root"><div class="sandbox-loading">Loading workspace...</div></div>
</main></div><div id="toast-root"></div>
<script src="config.js"></script><script src="api-client.js"></script><script src="portal-shell.js"></script><script src="portal.js"></script>
<script src="sandbox-workspace.js"></script></body></html>"""

with open(r"C:\project p2p\peer to peer skill share\sandbox-workspace.html", "w", encoding="utf-8") as f:
    f.write(WORKSPACE_HTML)

print("sandbox-challenge.html and sandbox-workspace.html written OK")

        <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>
    <select id="sb-status"><option value="">All Status</option>
        <option value="open" selected>Open</option><option value="closed">Closed</option></select>
    <button class="btn small ghost" id="sb-reset">Reset</button>
</div>
<h2 style="color:#f1f5f9;font-size:18px;margin:0 0 12px 0;">Discover Challenges</h2>
<div id="sb-challenges-container" class="sandbox-challenges-grid">
    <div class="sandbox-loading">Loading challenges...</div>
</div>
<h2 style="color:#f1f5f9;font-size:18px;margin:28px 0 12px 0;">Recommended For You</h2>
<div id="sb-recommendations">
    <div class="sandbox-loading">Loading recommendations...</div>
</div>
<h2 style="color:#f1f5f9;font-size:18px;margin:28px 0 12px 0;">Your Active Challenges</h2>
<div id="sb-my-challenges">
    <div class="sandbox-loading">Loading your activity...</div>
</div>
</main></div><div id="toast-root"></div>
<script src="config.js"></script><script src="api-client.js"></script><script src="portal-shell.js"></script><script src="portal.js"></script>
<script src="industry-sandbox.js"></script></body></html>"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("industry-sandbox.html written OK")

