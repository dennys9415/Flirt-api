import { decryptSecret, encryptSecret, maskSecret } from './crypto.util';

const KEY = 'a'.repeat(64); // 32 bytes hex

describe('crypto.util', () => {
  it('round-trips a secret', () => {
    const ciphertext = encryptSecret('sk-super-secret-key', KEY);
    expect(ciphertext).not.toContain('sk-super-secret-key');
    expect(decryptSecret(ciphertext, KEY)).toBe('sk-super-secret-key');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encryptSecret('same', KEY)).not.toBe(encryptSecret('same', KEY));
  });

  it('fails to decrypt with the wrong key', () => {
    const ciphertext = encryptSecret('secret', KEY);
    expect(() => decryptSecret(ciphertext, 'b'.repeat(64))).toThrow();
  });

  it('fails on tampered ciphertext (GCM auth)', () => {
    const parts = encryptSecret('secret', KEY).split(':');
    const tampered = Buffer.from(parts[2], 'base64');
    tampered[0] ^= 0xff;
    parts[2] = tampered.toString('base64');
    expect(() => decryptSecret(parts.join(':'), KEY)).toThrow();
  });

  it('rejects invalid key length', () => {
    expect(() => encryptSecret('x', 'deadbeef')).toThrow('64 hex chars');
  });

  it('masks secrets for display', () => {
    expect(maskSecret('sk-abcdefghijklmnop')).toBe('sk-a…mnop');
    expect(maskSecret('short')).toBe('••••');
  });
});
