"""Email helper for Phase 1 admin-access-request notifications.

Credentials always come from environment-backed config (never from
HTML/CSS/JS). When SMTP is unconfigured the send is skipped with a
warning — the request row itself is still stored as pending.
"""
import smtplib
from email.message import EmailMessage

import config


def send_admin_request_notification(payload: dict) -> bool:
    """Email MAIN_ADMIN_EMAIL about a new admin access request.

    Returns True when an email was accepted by the SMTP server,
    False when SMTP is unconfigured or delivery failed (never raises).
    ``payload`` must never contain passwords/secrets.
    """
    if not config.SMTP_HOST or not config.SMTP_USERNAME or not config.SMTP_PASSWORD:
        print("[email] WARNING: SMTP not configured — admin request email skipped "
              "(request still stored as pending).")
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = "Academia Portal — Admin Access Request"
        msg["From"] = config.SMTP_FROM
        msg["To"] = config.MAIN_ADMIN_EMAIL
        msg.set_content(
            "A new admin access request was submitted.\n\n"
            f"Request ID: {payload.get('id')}\n"
            f"Name: {payload.get('full_name')}\n"
            f"Email: {payload.get('email')}\n"
            f"Phone: {payload.get('phone') or '-'}\n"
            f"Organization: {payload.get('organization') or '-'}\n"
            f"Current role: {payload.get('current_role') or '-'}\n"
            f"Reason: {payload.get('reason')}\n"
            f"Date: {payload.get('created_at')}\n"
        )
        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=15) as server:
            if config.SMTP_USE_TLS:
                server.starttls()
            server.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
            server.send_message(msg)
        print(f"[email] Admin access request #{payload.get('id')} emailed to {config.MAIN_ADMIN_EMAIL}")
        return True
    except Exception as exc:  # never break signup/request flow on mail errors
        print(f"[email] WARNING: could not send admin request email: {type(exc).__name__}: {exc}")
        return False
