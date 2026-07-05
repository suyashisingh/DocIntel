import logging

import resend

from app.config import settings

logger = logging.getLogger(__name__)


def send_invite_email(to_email: str, org_name: str, invite_link: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — skipping invite email to %s", to_email)
        return

    resend.api_key = settings.RESEND_API_KEY

    resend.Emails.send({
        "from": "onboarding@resend.dev",
        "to": [to_email],
        "subject": f"You've been invited to {org_name} on DocIntel",
        "html": f"""
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 0">
          <h2 style="margin-bottom:8px">You've been invited to {org_name}</h2>
          <p style="color:#555;margin-bottom:24px">
            Click the button below to accept your invitation and create your account.
          </p>
          <a href="{invite_link}"
             style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;
                    padding:12px 24px;border-radius:8px;font-weight:600">
            Accept invitation
          </a>
          <p style="margin-top:24px;font-size:13px;color:#999">
            This link expires in 7 days. If you didn't expect this invitation, you can ignore this email.
          </p>
        </div>
        """,
    })
    logger.info("Invite email sent to %s for org %r", to_email, org_name)
