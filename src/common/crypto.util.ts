import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'crypto';

/**
 * AES-256-GCM for secrets at rest (user AI keys). The encryption key comes
 * from API_KEY_ENCRYPTION_SECRET (64 hex chars = 32 bytes).
 * Wire format: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encryptSecret(plaintext: string, hexKey: string): string {
  const key = keyFrom(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((b) => b.toString('base64')).join(':');
}

export function decryptSecret(payload: string, hexKey: string): string {
  const key = keyFrom(hexKey);
  const [iv, tag, ciphertext] = payload
    .split(':')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

function keyFrom(hexKey: string): Buffer {
  const key = Buffer.from(hexKey, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'API_KEY_ENCRYPTION_SECRET must be 64 hex chars (32 bytes)',
    );
  }
  return key;
}

/** "sk-abc…xyz" style mask for display — never return the full key. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••';
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}
