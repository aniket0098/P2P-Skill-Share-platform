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