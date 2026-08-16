import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const RESEND_URL = 'https://api.resend.com/emails';

export const mailerService = {
  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = new URL('/reset-password', env.APP_URL);
    url.searchParams.set('token', token);

    if (!env.RESEND_API_KEY) {
      const redacted = new URL(url.toString());
      redacted.searchParams.set('token', '[redacted]');
      logger.info({ to: email }, `password reset requested (log-only mailer): ${redacted.toString()}`);
      return;
    }

    try {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: env.RESEND_FROM ?? 'Work Order Desk <onboarding@resend.dev>',
          to: [email],
          subject: 'Reset your password',
          html: `<p>We got a request to reset the password for your Work Order Desk account.</p><p><a href="${url}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, you can ignore this email.</p>`,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        logger.error({ to: email, status: res.status, body }, 'resend send failed');
      } else {
        logger.info({ to: email }, 'password reset email sent');
      }
    } catch (err) {
      logger.error({ err, to: email }, 'resend send threw');
    }
  },
};