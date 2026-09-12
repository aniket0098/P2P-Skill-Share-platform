
lines = open("stage7_service.py", "r", encoding="utf-8").readlines()
new_lines = []
for i, line in enumerate(lines):
    if i == 157:  # line 158 - empty line after evidence_text=evidence_text,
        new_lines.append('            extra={"challenge_id": challenge.id, "challenge_title": challenge.title,\n')
        new_lines.append('                   "evaluation_id": evaluation.id, "overall_score": evaluation.overall_score},\n')
        new_lines.append('        )\n')
        new_lines.append('        out.append(ev)\n')
        new_lines.append('    if out and challenge.skills:\n')
        new_lines.append('        s6.record_history(\n')
        new_lines.append('            db, user_id=submission.user_id,\n')
        new_lines.append('            skill_id=challenge.skills[0].skill_id,\n')
        new_lines.append('            event_type="sandbox_completed",\n')
        new_lines.append('            note=f"Industry Sandbox challenge completed: {challenge.title}",\n')
        new_lines.append('            confidence=confidence,\n')
        new_lines.append('        )\n')
        new_lines.append('    db.flush()\n')
        new_lines.append('    return out\n')
        new_lines.append('\n')
        continue
    if i == 158:  # skip old empty line
        continue
    if i == 159:  # skip old 'def student_dashboard_stats'
        new_lines.append('def student_dashboard_stats(db: Session, user_id: int) -> dict:\n')
        continue
    new_lines.append(line)
open("stage7_service.py", "w", encoding="utf-8").writelines(new_lines)
print("Fixed")
