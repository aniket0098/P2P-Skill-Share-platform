import pathlib
p = pathlib.Path('stage9_service.py')
with open(p, 'a', encoding='utf-8') as f:
    f.write('''
    def _what_to_learn(self, first_name, gaps, target, readiness):
        if not gaps:
            return first_name + ", you have no critical skill gaps for your target role."
        top = gaps[:3]
        tt = target.get("target_role", {}).get("title", "your target role")
        lines = [first_name + ", here is what to learn next:"]
        for i, g in enumerate(top, 1):
            r = g.get("reason", "Required at " + g.get("required_level", "intermediate"))
            lines.append(str(i) + ". **" + g["skill_name"] + "** - " + r)
        lines.append("\\nWhy: highest-priority gaps for **" + tt + "**.")
        return "\\n".join(lines)

    def _why_not_ready(self, first_name, gaps, target, readiness):
        if not gaps:
            return first_name + ", you appear ready!"
        score = readiness.get("readiness", {}).get("score")
        tt = target.get("target_role", {}).get("title", "your target role")
        lines = [first_name + ", not yet ready for **" + tt + "** because:"]
        if score is not None:
            lines.append("Readiness: **" + str(score) + "%**")
        missing = [g for g in gaps if g.get("status") == "missing"]
        partial = [g for g in gaps if g.get("status") == "partial"]
        if missing:
            lines.append("\\nMissing (" + str(len(missing)) + "):")
            for g in missing[:4]:
                lines.append("- **" + g["skill_name"] + "** (" + g.get("required_level", "intermediate") + ")")
        if partial:
            lines.append("\\nPartial (" + str(len(partial)) + "):")
            for g in partial[:3]:
                lines.append("- **" + g["skill_name"] + "** have " + str(g.get("student_level", "some")) + " need " + str(g.get("required_level")))
        return "\\n".join(lines)

    def _skill_gaps(self, first_name, gaps):
        if not gaps:
            return first_name + ", no skill gaps detected."
        lines = [first_name + ", your skill gaps:"]
        for g in gaps[:5]:
            lines.append("- **" + g["skill_name"] + "** | " + g.get("status", "unknown") + " | " + g.get("priority", "medium"))
        return "\\n".join(lines)

    def _project_advice(self, first_name, gaps, projects):
        gn = [g["skill_name"] for g in gaps[:3]]
        pt = projects.get("projects", {}).get("total", 0)
        lines = [first_name + ", for your next project:"]
        if gn:
            lines.append("Build something demonstrating: **" + ", ".join(gn) + "**")
        if pt == 0:
            lines.append("\\nNo tracked projects yet. Start small.")
        else:
            lines.append("\\nYou have " + str(pt) + " project(s). Target your top gap.")
        return "\\n".join(lines)

    def _sandbox_advice(self, first_name, gaps, sandbox):
        j = sandbox.get("sandbox", {}).get("joined", 0)
        gn = [g["skill_name"] for g in gaps[:3]]
        lines = [first_name + ", for Industry Sandbox:"]
        if gn:
            lines.append("Look for challenges involving: **" + ", ".join(gn) + "**")
        if j == 0:
            lines.append("\\nNo attempts yet. Sandbox gives evaluated evidence.")
        else:
            lines.append("\\nYou joined " + str(j) + " challenge(s). Pick one for a gap.")
        return "\\n".join(lines)
''')
print("Part 2 done")
