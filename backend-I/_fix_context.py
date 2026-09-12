"""Fix context access bugs in stage9_service.py rule-based provider."""
p = "stage9_service.py"
with open(p, encoding="utf-8") as f:
    content = f.read()

# The ai_context() returns target_role as the direct role dict: {"title": ..., "description": ...}
# But rule-based provider was doing target.get("target_role", {}).get("title", ...)
# Fix: remove the extra .get("target_role", {}) nesting

replacements = [
    # target.get("target_role", {}).get("title", "...") -> target.get("title", "...")
    ('target.get("target_role", {}).get("title"', 'target.get("title"'),
    # readiness.get("readiness", {}).get("score") -> readiness.get("score")
    ('readiness.get("readiness", {}).get("score"', 'readiness.get("score"'),
    # readiness.get("readiness", {}).get("level", "...") -> readiness.get("level", "...")
    ('readiness.get("readiness", {}).get("level"', 'readiness.get("level"'),
    # projects.get("projects", {}).get("total", ...) -> projects.get("total", ...)
    ('projects.get("projects", {}).get("total"', 'projects.get("total"'),
    # sandbox.get("sandbox", {}).get("joined", ...) -> sandbox.get("joined", ...)
    ('sandbox.get("sandbox", {}).get("joined"', 'sandbox.get("joined"'),
]

count = 0
for old, new in replacements:
    n = content.count(old)
    if n:
        content = content.replace(old, new)
        count += n
        print(f"  Fixed {n}x: {old[:60]}...")

with open(p, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Total fixes: {count}")
