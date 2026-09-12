"""Append AI Provider classes."""
import pathlib

content = pathlib.Path('stage9_service.py').read_text(encoding='utf-8')

p6 = '''

# ---------------------------------------------------------------------------
# AI Provider Abstraction
# ---------------------------------------------------------------------------

class CareerAIProvider:
    """Abstract base for career coach AI providers."""

    def chat(self, system_prompt, user_message, context, history=None):
        raise NotImplementedError


class ExternalAIProvider(CareerAIProvider):
    """OpenAI-compatible chat API using server-side AI_API_KEY."""

    def chat(self, system_prompt, user_message, context, history=None):
        if not config.AI_API_KEY:
            return {"content": "", "provider": "external", "ai_used": False,
                    "error": "AI_API_KEY not configured"}
        try:
            import httpx
            messages = [{"role": "system", "content": system_prompt}]
            for h in (history or [])[-6:]:
                role = "user" if h.get("role") == "user" else "assistant"
                content = str(h.get("content", ""))[:1200]
                if content:
                    messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": user_message[:2000]})
            with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS) as client:
                resp = client.post(
                    f"{config.AI_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {config.AI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": config.AI_MODEL,
                        "messages": messages,
                        "max_tokens": config.AI_MAX_TOKENS,
                        "temperature": 0.4,
                    },
                )
            if resp.status_code != 200:
                return {"content": "", "provider": "external", "ai_used": False,
                        "error": f"AI API error {resp.status_code}: {resp.text[:200]}"}
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if not content:
                return {"content": "", "provider": "external", "ai_used": False,
                        "error": "Empty AI response"}
            return {"content": content.strip(), "provider": "external", "ai_used": True, "error": None}
        except Exception as e:
            return {"content": "", "provider": "external", "ai_used": False,
                    "error": f"AI provider error: {str(e)[:200]}"}


class LocalAIProvider(CareerAIProvider):
    """Local/private model server (LM Studio, Ollama with OpenAI compat layer)."""

    def chat(self, system_prompt, user_message, context, history=None):
        try:
            import httpx
            messages = [{"role": "system", "content": system_prompt}]
            for h in (history or [])[-4:]:
                role = "user" if h.get("role") == "user" else "assistant"
                content = str(h.get("content", ""))[:1000]
                if content:
                    messages.append({"role": role, "content": content})
            messages.append({"role": "user", "content": user_message[:1500]})
            with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS) as client:
                resp = client.post(
                    f"{config.AI_LOCAL_BASE_URL}/chat/completions",
                    headers={"Content-Type": "application/json"},
                    json={
                        "model": config.AI_MODEL,
                        "messages": messages,
                        "max_tokens": config.AI_MAX_TOKENS,
                        "temperature": 0.4,
                    },
                )
            if resp.status_code != 200:
                return {"content": "", "provider": "local", "ai_used": False,
                        "error": f"Local AI error {resp.status_code}"}
            data = resp.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if not content:
                return {"content": "", "provider": "local", "ai_used": False,
                        "error": "Empty local AI response"}
            return {"content": content.strip(), "provider": "local", "ai_used": True, "error": None}
        except Exception as e:
            return {"content": "", "provider": "local", "ai_used": False,
                    "error": f"Local AI unavailable: {str(e)[:200]}"}
'''

content += p6
pathlib.Path('stage9_service.py').write_text(content, encoding='utf-8')
print('Part 6 appended:', len(content), 'chars')
