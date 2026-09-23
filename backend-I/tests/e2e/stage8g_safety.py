"""Stage 8G - safe authenticated-verification helpers (LOCAL-ONLY, OFFLINE).

Answer to Stage 8F problem: bind every cleanup to (a) captured fixture IDs,
(b) a secret-safe database fingerprint, (c) explicit remote opt-in gates, and
(d) API-only deletion (draft opportunity DELETE + withdraw-by-owner). No
direct-SQL cleanup, no local SessionLocal cleanup, no production contact.

Secret hygiene: this module NEVER prints/returns passwords, DATABASE_URL,
SECRET_KEY, LIVEKIT secrets, JWTs, or tokens. Fingerprints hash only
non-secret parts (scheme/host/port/dbname, never password).
"""
import hashlib
import os
import urllib.parse

LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1", "0.0.0.0")
REMOTE_ALLOW = "1"
REMOTE_CONFIRM = "yes-i-know"


def classify_host(hostname):
    """Return 'local', 'non-local', or 'unknown' for a hostname (no I/O)."""
    h = (hostname or "").strip().lower()
    if not h:
        return "unknown"
    if h in LOCAL_HOSTS or h.startswith("127.") or h.endswith(".localhost"):
        return "local"
    return "non-local"


def safe_db_identity(database_url):
    """Secret-safe identity from a URL string. Never returns the password/URL.

    Returns dict(environment, host_class, database, port, fingerprint).
    fingerprint = sha256(scheme|host|port|dbname)[:16] - deterministic per
    database, reveals nothing about credentials.
    """
    try:
        p = urllib.parse.urlsplit(database_url or "")
    except Exception:
        return {"environment": "unknown", "host_class": "unknown",
                "database": "unknown", "port": "unknown", "fingerprint": "unknown"}
    scheme = (p.scheme or "unknown").lower()
    if scheme.startswith("sqlite"):
        fp = hashlib.sha256("sqlite|local".encode()).hexdigest()[:16]
        return {"environment": "local", "host_class": "local",
                "database": "sqlite", "port": "n/a", "fingerprint": fp}
    host = (p.hostname or "unknown").lower()
    try:
        port = str(p.port) if p.port else "default"
    except Exception:
        port = "unknown"
    dbname = (p.path or "/unknown").lstrip("/") or "unknown"
    # Never include username/password in fingerprint or output.
    host_class = "local" if classify_host(host) == "local" else "non-local"
    environment = "local" if host_class == "local" else "non-local"
    # Redact actual host/dbname for non-local: report classes only.
    safe_host = host if host_class == "local" else "remote-redacted"
    safe_db = dbname if host_class == "local" else "remote-redacted"
    fp_src = "|".join([scheme, host, port, dbname])
    fp = hashlib.sha256(fp_src.encode()).hexdigest()[:16]
    return {"environment": environment, "host_class": host_class,
            "database": safe_db, "port": port if host_class == "local" else "redacted",
            "fingerprint": fp, "_safe_host": safe_host}


def check_base_guard(test_base, allow_remote="", confirm=""):
    """Fail-closed remote guard. Returns (allowed: bool, mode: str)."""
    base = (test_base or "").strip() or "http://127.0.0.1:8000"
    try:
        host = (urllib.parse.urlsplit(base).hostname or "").lower()
    except Exception:
        return (False, "INVALID-BASE")
    if classify_host(host) == "local":
        return (True, "LOCAL")
    if (allow_remote or "").strip() == REMOTE_ALLOW and \
       (confirm or "").strip().lower() == REMOTE_CONFIRM:
        return (True, "REMOTE-EXPLICITLY-AUTHORIZED")
    return (False, "REMOTE-REFUSED")


def new_manifest(environment, fingerprint):
    """Create empty captured-ID manifest. Never holds secrets/JWT."""
    return {"environment": environment, "database_fingerprint": fingerprint,
            "user_id": None, "opportunity_ids": [], "application_ids": [],
            "expected_deletes": 0}

