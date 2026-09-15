"""SkillShare backend configuration.

All environment-specific values (database URL, JWT secret, CORS origins)
are read from environment variables. A local ``.env`` file is loaded when
``python-dotenv`` is installed (see ``.env.example``).

Security rules:
  * NEVER hardcode real credentials, tokens, or API keys here.
  * Production must set ``DATABASE_URL``, ``SECRET_KEY`` and ``FRONTEND_URL``
    as real environment variables (Render + Neon) — no code changes needed.

Local development:
  * Copy ``.env.example`` to ``.env`` and fill in your values.
  * When optional values are missing, the backend falls back to safe,
    clearly-labelled local-only defaults and warns on startup.
"""

import os
import secrets

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv not installed yet — rely on real env vars
    pass


def _warn(message: str) -> None:
    """Print a visible startup warning when a fallback is used."""
    print(f"[config] WARNING: {message}")


def _fail(message: str) -> None:
    """Raise a clear, actionable configuration error (production only)."""
    raise RuntimeError(f"[config] CONFIGURATION ERROR: {message}")


def _is_production() -> bool:
    """Detect a production environment (Render or explicit override).

    * Render injects ``RENDER`` into the runtime environment.
    * Any deployment can also set ``ENVIRONMENT=production`` explicitly.
    """
    if os.getenv("ENVIRONMENT", "").strip().lower() in ("production", "prod"):
        return True
    return os.getenv("RENDER", "").strip().lower() in ("1", "true", "yes")


# True when running on Render (or when ENVIRONMENT=production is set).
# Local development is always treated as non-production, so the clearly
# labelled local fallbacks below keep working from VS Code.
IS_PRODUCTION = _is_production()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
# PostgreSQL (local or Neon) connection string. e.g.
#   postgresql://user:password@host:port/dbname
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    if IS_PRODUCTION:
        # NEVER silently fall back to a local database in production.
        _fail(
            "DATABASE_URL is not set. On Render, add it under "
            "Environment → Environment Variables (your Neon pooled "
            "connection string, ending with ?sslmode=require). "
            "Render → Manual Deploy → Clear build cache & deploy after saving."
        )
    DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/skillshare"
    _warn(
        "DATABASE_URL is not set. Using a local-default PostgreSQL connection. "
        "Set the DATABASE_URL environment variable (or a .env file) to point "
        "at your local database or a Neon connection string."
    )

# ---------------------------------------------------------------------------
# JWT (authentication)
# ---------------------------------------------------------------------------
# The secret MUST come from the environment so existing sessions survive
# restarts and tokens keep validating across deploys. A per-start random
# key is only acceptable as a clearly-labelled LOCAL development fallback.
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    if IS_PRODUCTION:
        _fail(
            "SECRET_KEY is not set. On Render, add a stable secret under "
            "Environment → Environment Variables. Generate one with: "
            'python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    SECRET_KEY = secrets.token_urlsafe(48)
    _warn(
        "SECRET_KEY is not set. Generated a random ephemeral key — existing "
        "sessions will be invalidated on restart. Set SECRET_KEY in "
        "production to keep sessions stable and secure."
    )

ALGORITHM = os.getenv("ALGORITHM", "HS256")

try:
    ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
except ValueError:
    _warn("ACCESS_TOKEN_EXPIRE_MINUTES must be an integer. Using 30.")
    ACCESS_TOKEN_EXPIRE_MINUTES = 30

# ---------------------------------------------------------------------------
# Admin access-request workflow (Phase 1)
# ---------------------------------------------------------------------------
# MAIN_ADMIN_EMAIL is the notification recipient + bootstrap identity.
# It is NEVER proof of authority by itself: admin powers always come
# from users.role == "admin" in PostgreSQL.
MAIN_ADMIN_EMAIL = os.getenv("MAIN_ADMIN_EMAIL", "daniket797@gmail.com").strip().lower()

# SMTP for admin-request notification emails. All optional: when unset,
# requests are still stored as pending and the mail step is skipped
# with a logged warning (never a 500).
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or 587)
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USERNAME or MAIN_ADMIN_EMAIL)
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() in ("1", "true", "yes")

# ---------------------------------------------------------------------------
# CORS — allowed production frontend origins
# ---------------------------------------------------------------------------
# Comma-separated list, e.g. the future Vercel frontend URL:
#   FRONTEND_URL=https://skillshare.vercel.app,https://example.com
# Local origins (localhost / 127.0.0.1 / null) are always allowed so local
# development keeps working without extra configuration.
FRONTEND_URLS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_URL", "").split(",")
    if origin.strip()
]


# ---------------------------------------------------------------------------
# LiveKit Cloud — real-time audio/video rooms (server-side ONLY)
# ---------------------------------------------------------------------------
# SECURITY: LIVEKIT_API_SECRET must never appear in HTML/JS/CSS,
# localStorage, logs, or any API response. The frontend only ever
# receives the public server URL + a short-lived participant token.
LIVEKIT_URL = (os.getenv("LIVEKIT_URL", "") or "").strip()
LIVEKIT_API_KEY = (os.getenv("LIVEKIT_API_KEY", "") or "").strip()
LIVEKIT_API_SECRET = (os.getenv("LIVEKIT_API_SECRET", "") or "").strip()
if (not LIVEKIT_URL or not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET) and not IS_PRODUCTION:
    _warn(
        "LiveKit is not configured (LIVEKIT_URL / LIVEKIT_API_KEY / "
        "LIVEKIT_API_SECRET). /api/livekit/token will return 503 until "
        "these are set in backend-I/.env."
    )


# ---------------------------------------------------------------------------
# Stage 9 — AI Career Coach provider settings
# ---------------------------------------------------------------------------
# The coach is a provider abstraction:
#   AI_PROVIDER=auto     -> external (if a key is configured) -> local -> rules
#   AI_PROVIDER=external -> OpenAI-compatible chat API only (needs AI_API_KEY)
#   AI_PROVIDER=local    -> local/private model server (LM Studio / Ollama)
#   AI_PROVIDER=rule     -> deterministic rule-based coach (always available)
#
# SECURITY: AI keys are server-side ONLY. Never put them in HTML/JS/CSS or
# localStorage. When no key is configured the coach still works through the
# deterministic rule-based provider — the application never depends on an AI.
AI_PROVIDER = (os.getenv("AI_PROVIDER", "auto") or "auto").strip().lower() or "auto"
AI_API_KEY = os.getenv("AI_API_KEY", "") or ""
AI_MODEL = (os.getenv("AI_MODEL", "gpt-4o-mini") or "gpt-4o-mini").strip()
AI_BASE_URL = (os.getenv("AI_BASE_URL", "https://api.openai.com/v1") or "https://api.openai.com/v1").rstrip("/")
AI_LOCAL_BASE_URL = (os.getenv("AI_LOCAL_BASE_URL", "http://127.0.0.1:1234/v1") or "http://127.0.0.1:1234/v1").rstrip("/")


def _ai_int(name: str, fallback: int) -> int:
    try:
        return int(os.getenv(name, "") or "")
    except (TypeError, ValueError):
        return fallback


AI_TIMEOUT_SECONDS = _ai_int("AI_TIMEOUT_SECONDS", 30)
AI_MAX_TOKENS = _ai_int("AI_MAX_TOKENS", 700)