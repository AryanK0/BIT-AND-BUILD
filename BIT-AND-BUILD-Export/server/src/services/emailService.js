import { Resend } from 'resend';

const EMAIL_CONFIGURATION_ERROR = 'EMAIL_CONFIGURATION_ERROR';
const EMAIL_DELIVERY_ERROR = 'EMAIL_DELIVERY_ERROR';

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isDisplayName(value) {
  return typeof value === 'string' && /^[^<>\r\n]+$/.test(value.trim());
}

function safeProviderText(value) {
  return String(value || '')
    .replace(/re_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/(?:api[_ -]?key|authorization|password)\s*[:=]\s*\S+/gi, (match) => `${match.split(/[:=]/)[0]}=[redacted]`)
    .slice(0, 500);
}

function safeProviderValue(value, depth = 0) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'string') return safeProviderText(value);
  if (depth >= 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => safeProviderValue(item, depth + 1));
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, /api[_ -]?key|authorization|password|html|text/i.test(key) ? '[redacted]' : safeProviderValue(item, depth + 1)]));
  return safeProviderText(value);
}

function providerErrorDetails(error) {
  return {
    providerErrorName: safeProviderText(error?.name || 'ProviderError'),
    providerErrorMessage: safeProviderText(error?.message || 'No provider error message'),
    providerStatus: error?.statusCode ?? error?.status ?? null,
    providerCode: safeProviderText(error?.code || ''),
  };
}

function providerResponseDetails(response) {
  return {
    providerResponseData: safeProviderValue(response?.data),
    providerResponseErrors: safeProviderValue(response?.errors ?? response?.error?.errors),
  };
}

function payloadSummary({ from, to, subject, html, text }) {
  return {
    senderEmail: from.match(/<([^>]+)>$/)?.[1] || from,
    recipientEmail: to,
    subject,
    payloadFieldTypes: {
      from: typeof from,
      to: typeof to,
      subject: typeof subject,
      html: typeof html,
      text: typeof text,
      replyTo: 'undefined',
    },
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
    (!normalizedSenderName || !isDisplayName(normalizedSenderName)) && 'RESEND_SENDER_NAME',
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
  logger.info?.({ event: 'email_service_configuration', senderEmail: normalizedSenderEmail, senderNameConfigured: true });

  return {
    isConfigured: true,
    async send({ to, subject, html, text }) {
      const recipient = normalizeEmail(to);
      const validText = text === undefined || (typeof text === 'string' && text.trim());
      if (!isEmail(recipient) || typeof subject !== 'string' || !subject.trim() || typeof html !== 'string' || !html.trim() || !validText) {
        return { ok: false, code: 'INVALID_EMAIL_MESSAGE' };
      }

      const emailPayload = { from, to: recipient, subject: subject.trim(), html, ...(text !== undefined ? { text } : {}) };
      const summary = payloadSummary(emailPayload);
      logger.info?.({ event: 'email_delivery_attempt', provider: 'resend', ...summary });

      try {
        const response = await client.emails.send(emailPayload);
        if (response?.error) {
          const diagnostic = { ...providerErrorDetails(response.error), ...providerResponseDetails(response) };
          logger.error?.({ event: 'email_delivery_error', provider: 'resend', ...summary, ...diagnostic });
          return { ok: false, code: EMAIL_DELIVERY_ERROR, diagnostic };
        }
        if (!response?.data?.id) {
          const diagnostic = { providerErrorName: 'unexpected_response', providerErrorMessage: 'Resend returned no message ID', providerStatus: null, providerCode: '', ...providerResponseDetails(response) };
          logger.error?.({ event: 'email_delivery_error', provider: 'resend', ...summary, ...diagnostic });
          return { ok: false, code: EMAIL_DELIVERY_ERROR, diagnostic };
        }
        return { ok: true, id: response.data.id };
      } catch (error) {
        const diagnostic = { ...providerErrorDetails(error), providerResponseData: safeProviderValue(error?.data), providerResponseErrors: safeProviderValue(error?.errors) };
        logger.error?.({ event: 'email_delivery_error', provider: 'resend', ...summary, ...diagnostic });
        return { ok: false, code: EMAIL_DELIVERY_ERROR, diagnostic };
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
