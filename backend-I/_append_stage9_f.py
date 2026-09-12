import pathlib
p = pathlib.Path('stage9_service.py')
with open(p, 'a', encoding='utf-8') as f:
    f.write('''

def _build_roadmap(context):
    gaps = context.get("skill_gaps", [])
    learning = context.get("learning") or {}
    projects = context.get("projects") or {}
    sandbox = context.get("sandbox") or {}
    innovation = context.get("innovation") or {}
    readiness = context.get("readiness") or {}
    score = readiness.get("score") or 0
    stages = [
        {"id": "profile", "title": "Profile & Skills",
         "status": "completed" if context.get("profile_complete") else "current",
         "description": "Complete profile, add skills"},
        {"id": "learning", "title": "Learning",
         "status": "completed" if learning.get("completed", 0) > 0 else ("current" if learning.get("total", 0) > 0 else "upcoming"),
         "description": str(learning.get("completed", 0)) + " of " + str(learning.get("total", 0)) + " completed"},
        {"id": "projects", "title": "Projects",
         "status": "completed" if projects.get("total", 0) > 0 else "upcoming",
         "description": str(projects.get("total", 0)) + " project(s) tracked"},
        {"id": "sandbox", "title": "Industry Sandbox",
         "status": "completed" if sandbox.get("joined", 0) > 0 else "upcoming",
         "description": str(sandbox.get("joined", 0)) + " challenge(s)"},
        {"id": "innovation", "title": "Innovation Lab",
         "status": "completed" if len(innovation.get("ideas", [])) > 0 else "upcoming",
         "description": str(len(innovation.get("ideas", []))) + " idea(s)"},
        {"id": "gap_closure", "title": "Skill Gap Closure",
         "status": "completed" if not gaps else ("current" if score > 50 else "upcoming"),
         "description": str(len(gaps)) + " gap(s) remaining"},
        {"id": "interview", "title": "Interview Ready",
         "status": "completed" if score >= 75 else ("current" if score >= 60 else "upcoming"),
         "description": "Readiness: " + str(score) + "%"},
    ]
    return stages


def build_weekly_plan(context):
    gaps = context.get("skill_gaps", [])
    gap_names = [g["skill_name"] for g in gaps[:3]]
    plan = []
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for i, day in enumerate(days):
        if i < 2 and gap_names:
            plan.append({"day": day, "focus": "Study " + gap_names[0], "type": "learning"})
        elif i < 4 and len(gap_names) > 1:
            plan.append({"day": day, "focus": "Practice " + (gap_names[1] or gap_names[0]), "type": "practice"})
        elif i == 4:
            plan.append({"day": day, "focus": "Project work", "type": "project"})
        elif i == 5:
            plan.append({"day": day, "focus": "Review & document", "type": "review"})
        else:
            plan.append({"day": day, "focus": "Rest or light practice", "type": "rest"})
    return plan
''')
print("Part 6 done")
