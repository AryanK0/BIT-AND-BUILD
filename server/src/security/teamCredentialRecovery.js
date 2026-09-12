import crypto from 'node:crypto';

function keyFrom(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value) ? Buffer.from(value, 'hex') : null;
}

export function encryptRecoverablePassword(password, encryptionKey) {
  const key = keyFrom(encryptionKey);
  if (!key) throw new Error('TEAM_CREDENTIAL_ENCRYPTION_KEY is not configured as 64 hexadecimal characters');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function decryptRecoverablePassword(value, encryptionKey) {
  const key = keyFrom(encryptionKey);
  if (!key) throw new Error('TEAM_CREDENTIAL_ENCRYPTION_KEY is not configured as 64 hexadecimal characters');
  const [version, ivValue, tagValue, encryptedValue] = String(value || '').split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Stored credential cannot be recovered');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}
