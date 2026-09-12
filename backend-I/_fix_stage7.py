
with open("stage7_service.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

out = []
i = 0
while i < len(lines):
    line = lines[i]
    if 'evidence_text=evidence_text,' in line and i > 0 and 'upsert_evidence' in lines[i-4]:
        out.append(line)
        out.append('            extra={"challenge_id": challenge.id, "challenge_title": challenge.title,\n')
        out.append('                   "evaluation_id": evaluation.id, "overall_score": evaluation.overall_score},\n')
        out.append('        )\n')
        out.append('        out.append(ev)\n')
        out.append('    if out and challenge.skills:\n')
        out.append('        s6.record_history(\n')
        out.append('            db, user_id=submission.user_id,\n')
        out.append('            skill_id=challenge.skills[0].skill_id,\n')
        out.append('            event_type="sandbox_completed",\n')
        out.append('            note=f"Industry Sandbox challenge completed: {challenge.title}",\n')
        out.append('            confidence=confidence,\n')
        out.append('        )\n')
        out.append('    db.flush()\n')
        out.append('    return out\n')
        i += 1
        while i < len(lines) and lines[i].strip() == '':
            i += 1
        continue
    out.append(line)
    i += 1

with open("stage7_service.py", "w", encoding="utf-8") as f:
    f.writelines(out)
print("Fixed stage7_service.py")
