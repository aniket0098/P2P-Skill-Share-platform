import pathlib
p = pathlib.Path('stage9_service.py')
with open(p, 'a', encoding='utf-8') as f:
    f.write('''

def generate_recommendations(db, user_id):
    context = build_career_context(db, user_id)
    gaps = context.get("skill_gaps", [])
    skills = context.get("skills", [])
    readiness = context.get("readiness") or {}
    learning = context.get("learning") or {}
    projects = context.get("projects") or {}
    sandbox = context.get("sandbox") or {}
    target = context.get("target_role") or {}
    evidence = context.get("evidence") or {}
    score = readiness.get("score")
    level = readiness.get("level", "N/A")
    next_mission = _compute_next_mission(context)
    roadmap = _build_roadmap(context)
    actions = []
    if gaps:
        top_gap = gaps[0]
        actions.append({"priority": 1, "type": "skill_gap",
            "title": "Close gap: " + top_gap["skill_name"],
            "reason": top_gap.get("reason", "Highest-priority gap"),
            "action": "Start learning " + top_gap["skill_name"]})
    if learning.get("total", 0) == 0:
        actions.append({"priority": 2, "type": "learning",
            "title": "Start a learning path",
            "reason": "No tracked learning activity",
            "action": "Begin with a course for your top gap"})
    if projects.get("total", 0) == 0:
        actions.append({"priority": 3, "type": "project",
            "title": "Build your first project",
            "reason": "Projects provide strong evidence",
            "action": "Build something demonstrating target skills"})
    if sandbox.get("joined", 0) == 0 and gaps:
        actions.append({"priority": 4, "type": "sandbox",
            "title": "Attempt an Industry Sandbox challenge",
            "reason": "Sandbox provides evaluated evidence",
            "action": "Pick a challenge targeting your top gap"})
    return {
        "target_role": target, "readiness": readiness,
        "readiness_score": score, "readiness_level": level,
        "top_gaps": gaps[:5], "top_skills": skills[:5],
        "evidence_summary": evidence, "next_mission": next_mission,
        "roadmap": roadmap, "recommended_actions": actions[:4],
        "learning_resources": context.get("learning_resources", [])[:5],
        "sandbox_targets": context.get("sandbox_targets", [])[:4],
        "has_target": context.get("has_target"),
        "profile_complete": context.get("profile_complete"),
    }


def _compute_next_mission(context):
    gaps = context.get("skill_gaps", [])
    learning = context.get("learning") or {}
    projects = context.get("projects") or {}
    recent_learning = learning.get("recent", [])
    in_progress = [l for l in recent_learning if 0 < (l.get("progress", 0) or 0) < 100]
    if in_progress:
        item = in_progress[0]
        return {"type": "learning",
            "title": "Continue: " + item.get("resource_title", item.get("skill_name", "Current learning")),
            "reason": "In progress at " + str(item.get("progress", 0)) + "%",
            "action": "Complete the current module"}
    if gaps:
        top = gaps[0]
        return {"type": "skill",
            "title": "Learn " + top["skill_name"],
            "reason": top.get("reason", "Highest-priority gap"),
            "action": "Start with fundamentals of " + top["skill_name"]}
    if projects.get("total", 0) == 0:
        return {"type": "project",
            "title": "Start your first project",
            "reason": "Projects demonstrate skills better than self-reporting",
            "action": "Build something small using your strongest skill"}
    return {"type": "maintain",
        "title": "Maintain and deepen skills",
        "reason": "No critical gaps - focus on depth",
        "action": "Take on a harder project or mentor others"}
''')
print("Part 5 done")
