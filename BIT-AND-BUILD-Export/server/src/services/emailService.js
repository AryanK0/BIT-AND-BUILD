import { Resend } from 'resend';

const EMAIL_CONFIGURATION_ERROR = 'EMAIL_CONFIGURATION_ERROR';
const EMAIL_DELIVERY_ERROR = 'EMAIL_DELIVERY_ERROR';

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function safeProviderText(value) {
  return String(value || '')
    .replace(/re_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/(?:api[_ -]?key|authorization|password)\s*[:=]\s*\S+/gi, (match) => `${match.split(/[:=]/)[0]}=[redacted]`)
    .slice(0, 500);
}

function providerErrorDetails(error) {
  return {
    providerErrorName: safeProviderText(error?.name || 'ProviderError'),
    providerErrorMessage: safeProviderText(error?.message || 'No provider error message'),
    providerStatus: error?.statusCode ?? error?.status ?? null,
    providerCode: safeProviderText(error?.code || ''),
  };
}

function configurationError(missing, invalid = []) {
  return { ok: false, code: EMAIL_CONFIGURATION_ERROR, missing, invalid };
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
  const normalizedSenderEmail = normalizeEmail(senderEmail);
  const normalizedSenderName = typeof senderName === 'string' ? senderName.trim() : '';
  const missing = [
    !apiKey && 'RESEND_API_KEY',
    !normalizedSenderEmail && 'RESEND_SENDER_EMAIL',
  ].filter(Boolean);
  const invalid = [
    normalizedSenderEmail && !isEmail(normalizedSenderEmail) && 'RESEND_SENDER_EMAIL',
    !normalizedSenderName && 'RESEND_SENDER_NAME',
  ].filter(Boolean);

  if (missing.length > 0 || invalid.length > 0) {
    return {
      isConfigured: false,
      send: async () => {
        logger.error?.({ event: 'email_configuration_error', missing, invalid });
        return configurationError(missing, invalid);
      },
    };
  }

  let client;
  try {
    client = new ResendClient(apiKey);
  } catch (error) {
    logger.error?.({ event: 'email_initialization_error', errorType: error?.name || 'Error' });
    return { isConfigured: false, send: async () => ({ ok: false, code: EMAIL_CONFIGURATION_ERROR }) };
  }
  const from = `${normalizedSenderName} <${normalizedSenderEmail}>`;

  return {
    isConfigured: true,
    async send({ to, subject, html, text }) {
      const recipient = normalizeEmail(to);
      if (!isEmail(recipient) || typeof subject !== 'string' || !subject.trim() || typeof html !== 'string' || !html.trim()) {
        return { ok: false, code: 'INVALID_EMAIL_MESSAGE' };
      }

      try {
        const response = await client.emails.send({ from, to: recipient, subject: subject.trim(), html, ...(text ? { text } : {}) });
        if (response?.error) {
          logger.error?.({ event: 'email_delivery_error', provider: 'resend', ...providerErrorDetails(response.error) });
          return { ok: false, code: EMAIL_DELIVERY_ERROR };
        }
        return { ok: true, id: response?.data?.id };
      } catch (error) {
        logger.error?.({ event: 'email_delivery_error', provider: 'resend', ...providerErrorDetails(error) });
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
