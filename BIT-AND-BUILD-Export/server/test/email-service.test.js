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
  test('uses Resend with an HTML message and plain-text fallback', async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: 'email_123' } });
    const service = createEmailService({ apiKey: 'test-key', senderEmail: 'verified@example.com', ResendClient: makeClient(send) });
    await expect(service.send({ to: 'leader@example.com', subject: 'Credentials', html: '<p>Hello</p>', text: 'Hello' })).resolves.toEqual({ ok: true, id: 'email_123' });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'BIT AND BUILD <verified@example.com>', to: 'leader@example.com', html: '<p>Hello</p>', text: 'Hello' }));
  });

  test('handles missing Resend configuration without leaking details', async () => {
    const service = createEmailService({ logger: { error: vi.fn() } });
    await expect(service.send({ to: 'leader@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toEqual(expect.objectContaining({ ok: false, code: emailErrorCodes.EMAIL_CONFIGURATION_ERROR }));
  });

  test('handles invalid recipients and provider failures safely', async () => {
    const send = vi.fn().mockRejectedValue(new Error('provider token detail'));
    const service = createEmailService({ apiKey: 'test-key', senderEmail: 'verified@example.com', ResendClient: makeClient(send), logger: { error: vi.fn() } });
    await expect(service.send({ to: 'not-an-email', subject: 'Test', html: '<p>Test</p>' })).resolves.toEqual({ ok: false, code: 'INVALID_EMAIL_MESSAGE' });
    await expect(service.send({ to: 'leader@example.com', subject: 'Test', html: '<p>Test</p>' })).resolves.toEqual({ ok: false, code: emailErrorCodes.EMAIL_DELIVERY_ERROR });
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
