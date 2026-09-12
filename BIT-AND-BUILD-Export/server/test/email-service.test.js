import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { createEmailService, emailErrorCodes, teamCredentialsMessage } from '../src/services/emailService.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

function makeClient(send = vi.fn().mockResolvedValue({ data: { id: 'email_123' } })) {
  return class ResendMock { constructor(apiKey) { this.apiKey = apiKey; this.emails = { send }; } };
}

describe('Resend email service', () => {
  test('uses a valid normalized Resend sender and recipient with HTML and text', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email_123' } });
    const service = createEmailService({ apiKey: 'test-key', senderEmail: ' VERIFIED@EXAMPLE.COM ', senderName: ' BIT AND BUILD ', ResendClient: makeClient(send) });
    await expect(service.send({ to: ' LEADER@EXAMPLE.COM ', subject: 'Credentials', html: '<p>Hello</p>', text: 'Hello' })).resolves.toEqual({ ok: true, id: 'email_123' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'BIT AND BUILD <verified@example.com>', to: 'leader@example.com', html: '<p>Hello</p>', text: 'Hello' }));
  });

  test('handles a missing sender environment variable without leaking details', async () => {
    const logger = { error: vi.fn() };
    const service = createEmailService({ apiKey: 'test-key', logger });
    await expect(service.send({ to: 'leader@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toEqual(expect.objectContaining({ ok: false, code: emailErrorCodes.EMAIL_CONFIGURATION_ERROR }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('test-key');
  });

  test('rejects an invalid recipient before calling Resend', async () => {
    const send = vi.fn();
    const service = createEmailService({ apiKey: 'test-key', senderEmail: 'verified@example.com', ResendClient: makeClient(send), logger: { error: vi.fn() } });
    await expect(service.send({ to: 'not-an-email', subject: 'Test', html: '<p>Test</p>' })).resolves.toEqual({ ok: false, code: 'INVALID_EMAIL_MESSAGE' });
    expect(send).not.toHaveBeenCalled();
  });

  test('logs safe Resend validation-failure details and payload metadata', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: null }, errors: [{ field: 'from', message: 'Sender domain is not verified' }], error: { name: 'validation_error', message: 'The sender domain is not verified', statusCode: 422, code: 'validation_error' } });
    const logger = { error: vi.fn() };
    const service = createEmailService({ apiKey: 'test-key', senderEmail: 'verified@example.com', ResendClient: makeClient(send), logger });
    await expect(service.send({ to: 'leader@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toMatchObject({ ok: false, code: emailErrorCodes.EMAIL_DELIVERY_ERROR, diagnostic: { providerErrorName: 'validation_error', providerStatus: 422 } });
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ provider: 'resend', providerErrorName: 'validation_error', providerErrorMessage: 'The sender domain is not verified', providerStatus: 422, providerResponseData: { id: null }, providerResponseErrors: [{ field: 'from', message: 'Sender domain is not verified' }], senderEmail: 'verified@example.com', recipientEmail: 'leader@example.com', subject: 'Test', payloadFieldTypes: { from: 'string', to: 'string', subject: 'string', html: 'string', text: 'undefined', replyTo: 'undefined' } }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('test-key');
  });

  test('handles an SDK exception and does not treat a response without a message ID as sent', async () => {
    const logger = { error: vi.fn(), info: vi.fn() };
    const thrown = new Error('Resend request failed');
    const throwingService = createEmailService({ apiKey: 'test-key', senderEmail: 'verified@example.com', ResendClient: makeClient(vi.fn().mockRejectedValue(thrown)), logger });
    await expect(throwingService.send({ to: 'leader@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toMatchObject({ ok: false, code: emailErrorCodes.EMAIL_DELIVERY_ERROR, diagnostic: { providerErrorName: 'Error', providerErrorMessage: 'Resend request failed' } });

    const emptyService = createEmailService({ apiKey: 'test-key', senderEmail: 'verified@example.com', ResendClient: makeClient(vi.fn().mockResolvedValue({ data: null, error: null })), logger });
    await expect(emptyService.send({ to: 'leader@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toMatchObject({ ok: false, code: emailErrorCodes.EMAIL_DELIVERY_ERROR, diagnostic: { providerErrorName: 'unexpected_response' } });
  });

  test('uses the Resend service payload for team credential emails', () => {
    const message = teamCredentialsMessage({ teamName: '<Team>', loginName: 'spider-team', password: 'private-pass' });
    expect(message.subject).toMatch(/credentials/i);
    expect(message.html).toContain('&lt;Team&gt;');
    expect(message.text).toContain('Login ID: spider-team');
  });

  test('contains no Brevo production integration', async () => {
    const serverRoot = path.resolve(directory, '..');
    const files = await fs.readdir(path.join(serverRoot, 'src'), { recursive: true });
    const sourceFiles = files.filter((file) => file.endsWith('.js'));
    const contents = await Promise.all(sourceFiles.map((file) => fs.readFile(path.join(serverRoot, 'src', file), 'utf8')));
    expect(contents.join('\n')).not.toMatch(/brevo/i);
  });
});
