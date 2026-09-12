import pathlib
p = pathlib.Path('stage9_service.py')
with open(p, 'a', encoding='utf-8') as f:
    f.write('''
    def _weekly_plan(self, first_name, gaps):
        gn = [g["skill_name"] for g in gaps[:3]]
        lines = [first_name + ", suggested week plan:"]
        if gn:
            lines.append("**Mon-Tue:** Study " + gn[0])
            lines.append("**Wed-Thu:** Practice" + (" " + gn[1] if len(gn) > 1 else " " + gn[0]))
            lines.append("**Fri:** Project work")
            lines.append("**Weekend:** Review")
        else:
            lines.append("**This week:** Deepen a skill or start a project")
        return "\\n".join(lines)

    def _roadmap(self, first_name, gaps, target, readiness):
        tt = target.get("target_role", {}).get("title", "your target role")
        score = readiness.get("readiness", {}).get("score")
        gn = [g["skill_name"] for g in gaps[:5]]
        lines = [first_name + ", roadmap for **" + tt + "**:"]
        if score is not None:
            lines.append("Current readiness: **" + str(score) + "%**\\n")
        gs = ", ".join(gn[:2]) if gn else "core skills"
        lines.append("**Phase 1 - Foundation:** Close " + gs)
        lines.append("**Phase 2 - Evidence:** Build projects")
        lines.append("**Phase 3 - Sandbox:** Complete challenges")
        lines.append("**Phase 4 - Innovation:** Apply in Innovation Lab")
        lines.append("**Phase 5 - Interview:** Prep at 75%+ readiness")
        return "\\n".join(lines)

    def _readiness_summary(self, first_name, target, readiness, gaps):
        tt = target.get("target_role", {}).get("title", "your target role")
        score = readiness.get("readiness", {}).get("score")
        level = readiness.get("readiness", {}).get("level", "N/A")
        lines = [first_name + ", readiness for **" + tt + "**:"]
        if score is not None:
            lines.append("**" + str(score) + "%** - " + level + "\\n")
        if gaps:
            lines.append("Top gaps:")
            for g in gaps[:4]:
                lines.append("- " + g["skill_name"] + " (" + g.get("status", "?") + ")")
        else:
            lines.append("No critical gaps.")
        return "\\n".join(lines)

    def _evidence_summary(self, first_name, skills):
        if not skills:
            return first_name + ", no tracked skills yet."
        strong = [s for s in skills if s.get("evidence_count", 0) >= 2]
        weak = [s for s in skills if s.get("evidence_count", 0) == 0]
        lines = [first_name + ", skill evidence breakdown:"]
        if strong:
            lines.append("\\n**Strong (" + str(len(strong)) + "):**")
            for s in strong[:5]:
                lines.append("- " + s["skill_name"] + " - " + str(s["evidence_count"]) + " evidence(s)")
        if weak:
            lines.append("\\n**No evidence (" + str(len(weak)) + "):**")
            for s in weak[:5]:
                lines.append("- " + s["skill_name"])
        return "\\n".join(lines)

    def _next_action(self, first_name, gaps):
        lines = [first_name + ", your next action:"]
        if gaps:
            top = gaps[0]
            lines.append("**" + top["skill_name"] + "** - highest-priority gap.")
            lines.append("Current: " + str(top.get("student_level", "none")) + " -> Need: " + str(top.get("required_level", "intermediate")))
        else:
            lines.append("Maintain skills and seek deeper challenges.")
        return "\\n".join(lines)

    def _general_response(self, first_name, gaps, target, readiness):
        tt = target.get("target_role", {}).get("title", "your target role")
        score = readiness.get("readiness", {}).get("score")
        lines = [first_name + ", I am your AI Career Coach."]
        if score is not None:
            lines.append("Readiness for **" + tt + "**: **" + str(score) + "%**")
        if gaps:
            lines.append("Top gap: **" + gaps[0]["skill_name"] + "**")
        lines.append("\\nAsk: learn next, gaps, projects, sandbox, weekly plan, roadmap.")
        return "\\n".join(lines)
''')
print("Part 3 done")
