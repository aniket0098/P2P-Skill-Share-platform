"""Append RuleBasedCareerProvider - part 1."""
import pathlib

content = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')

p7a = '''

class RuleBasedCareerProvider(CareerAIProvider):
    """Deterministic fallback - produces structured recommendations from context."""

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

        if any(w in msg for w in ["learn next", "what should i learn", "what to learn", "next skill"]):
            return self._what_to_learn(first_name, gaps, target, readiness)
        elif any(w in msg for w in ["not ready", "why not", "not ready for"]):
            return self._why_not_ready(first_name, gaps, target, readiness)
        elif any(w in msg for w in ["missing", "gap", "what skills am i missing"]):
            return self._skill_gaps(first_name, gaps, target)
        elif any(w in msg for w in ["project", "build", "which project"]):
            return self._project_advice(first_name, gaps, projects)
        elif any(w in msg for w in ["sandbox", "challenge"]):
            return self._sandbox_advice(first_name, gaps, sandbox)
        elif any(w in msg for w in ["this week", "weekly", "plan", "do this week"]):
            return self._weekly_plan(first_name, gaps, learning, projects)
        elif any(w in msg for w in ["roadmap", "path", "how do i become", "career path"]):
            return self._roadmap(first_name, gaps, target, readiness)
        elif any(w in msg for w in ["ready", "am i ready", "job ready"]):
            return self._readiness_summary(first_name, target, readiness, gaps)
        elif any(w in msg for w in ["evidence", "strong", "which skills have"]):
            return self._evidence_summary(first_name, skills)
        elif any(w in msg for w in ["next", "what should i do", "do next", "action"]):
            return self._next_action(first_name, gaps, learning, projects)
        else:
            return self._general_response(first_name, gaps, target, readiness)
'''

content += p7a
pathlib.Path('stage9_service.py').write_text(content, encoding='utf-8')
print('Part 7a appended:', len(content), 'chars')
