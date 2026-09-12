import { Resend } from 'resend';

const EMAIL_CONFIGURATION_ERROR = 'EMAIL_CONFIGURATION_ERROR';
const EMAIL_DELIVERY_ERROR = 'EMAIL_DELIVERY_ERROR';

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function configurationError(missing) {
  return { ok: false, code: EMAIL_CONFIGURATION_ERROR, missing };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

/**
 * Creates the server-only transactional email client. Results deliberately
 * exclude provider responses, credentials, and error details so callers can
 * safely map failures to public API responses.
 */
export function createEmailService({
  apiKey,
  senderEmail,
  senderName = 'BIT AND BUILD',
  ResendClient = Resend,
  logger = console,
} = {}) {
  const missing = [
    !apiKey && 'RESEND_API_KEY',
    !senderEmail && 'RESEND_SENDER_EMAIL',
  ].filter(Boolean);

  if (missing.length > 0) {
    logger.error?.({ event: 'email_configuration_error', missing });
    return { isConfigured: false, send: async () => configurationError(missing) };
  }

  const client = new ResendClient(apiKey);
  const from = `${senderName} <${senderEmail}>`;

  return {
    isConfigured: true,
    async send({ to, subject, html, text }) {
      if (!isEmail(to) || typeof subject !== 'string' || !subject.trim() || typeof html !== 'string' || !html.trim()) {
        return { ok: false, code: 'INVALID_EMAIL_MESSAGE' };
      }

      try {
        const response = await client.emails.send({ from, to: to.trim(), subject: subject.trim(), html, ...(text ? { text } : {}) });
        if (response?.error) {
          logger.error?.({ event: 'email_delivery_error', provider: 'resend', errorType: response.error.name || 'ProviderError' });
          return { ok: false, code: EMAIL_DELIVERY_ERROR };
        }
        return { ok: true, id: response?.data?.id };
      } catch (error) {
        logger.error?.({ event: 'email_delivery_error', provider: 'resend', errorType: error?.name || 'Error' });
        return { ok: false, code: EMAIL_DELIVERY_ERROR };
      }
    },
  };
}

export function teamCredentialsMessage({ teamName, loginName, password }) {
  const safeTeamName = escapeHtml(teamName);
  const safeLoginName = escapeHtml(loginName);
  const safePassword = escapeHtml(password);
  return {
    subject: 'Your BIT AND BUILD team credentials',
    html: `<p>Hello ${safeTeamName},</p><p>Your participant login credentials are:</p><ul><li>Login ID: <strong>${safeLoginName}</strong></li><li>Password: <strong>${safePassword}</strong></li></ul><p>Please keep these credentials private.</p>`,
    text: `Hello ${teamName},\n\nYour participant login credentials are:\nLogin ID: ${loginName}\nPassword: ${password}\n\nPlease keep these credentials private.`,
  };
}

export const emailErrorCodes = { EMAIL_CONFIGURATION_ERROR, EMAIL_DELIVERY_ERROR };
