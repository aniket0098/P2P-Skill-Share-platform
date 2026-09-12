import pathlib
p = pathlib.Path('stage9_service.py')
with open(p, 'a', encoding='utf-8') as f:
    f.write('''
class RuleBasedCareerProvider(CareerAIProvider):
    """Deterministic fallback that always produces useful career guidance."""

    def chat(self, system_prompt, user_message, context, history=None):
        response = self._generate_response(user_message, context)
        return {"content": response, "provider": "rule", "ai_used": False, "error": None}

    def _generate_response(self, user_message, context):
        msg = user_message.lower().strip()
        gaps = context.get("skill_gaps", [])
        skills = context.get("skills", [])
        target = context.get("target_role", {})
        readiness = context.get("readiness", {})
        learning = context.get("learning", {})
        projects = context.get("projects", {})
        sandbox = context.get("sandbox", {})
        profile = context.get("profile", {})
        first_name = profile.get("first_name", "there")
        if any(w in msg for w in ["learn next", "what should i learn", "next skill"]):
            return self._what_to_learn(first_name, gaps, target, readiness)
        if any(w in msg for w in ["not ready", "why not"]):
            return self._why_not_ready(first_name, gaps, target, readiness)
        if any(w in msg for w in ["missing", "gap"]):
            return self._skill_gaps(first_name, gaps)
        if any(w in msg for w in ["project", "build"]):
            return self._project_advice(first_name, gaps, projects)
        if any(w in msg for w in ["sandbox", "challenge"]):
            return self._sandbox_advice(first_name, gaps, sandbox)
        if any(w in msg for w in ["this week", "weekly", "plan"]):
            return self._weekly_plan(first_name, gaps)
        if any(w in msg for w in ["roadmap", "path", "how do i become"]):
            return self._roadmap(first_name, gaps, target, readiness)
        if any(w in msg for w in ["ready", "am i ready"]):
            return self._readiness_summary(first_name, target, readiness, gaps)
        if any(w in msg for w in ["evidence", "strong"]):
            return self._evidence_summary(first_name, skills)
        if any(w in msg for w in ["next", "do next", "action"]):
            return self._next_action(first_name, gaps)
        return self._general_response(first_name, gaps, target, readiness)
''')
print("Part 1 done")
