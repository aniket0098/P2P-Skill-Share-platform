
content = open("stage7_api.py", "r", encoding="utf-8").read()

old_func = '''        sub = db.query(SandboxSubmission).filter(
'''

new_func = '''        sub = db.query(SandboxSubmission).filter(
            SandboxSubmission.challenge_id == challenge_id,
            SandboxSubmission.user_id == cu.id,
        ).order_by(SandboxSubmission.id.desc()).first()
        evaluation = None
        if sub and sub.status == "submitted":
            ev = db.query(SandboxEvaluation).filter(
                SandboxEvaluation.submission_id == sub.id).first()
            if ev:
                evaluation = s7.serialize_evaluation(ev)
        data = s7.serialize_challenge(ch)
        data["tasks"] = [s7.serialize_task(t) for t in ch.tasks]
        data["resources"] = [s7.serialize_resource(r) for r in ch.resources]
        data["participant"] = {"id": participant.id, "status": participant.status,
                               "started_at": participant.started_at.isoformat() if participant.started_at else None}
        data["submission"] = s7.serialize_submission(sub) if sub else None
        data["evaluation"] = evaluation
        return data


'''

if old_func in content:
    content = content.replace(old_func, new_func)
    open("stage7_api.py", "w", encoding="utf-8").write(content)
    print("Fixed")
else:
    print("Not found")
