import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import { AiSettingsService } from './ai-settings.service';

const KEY = 'c'.repeat(64);

function makeService(env: Record<string, string> = { API_KEY_ENCRYPTION_SECRET: KEY }) {
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
  const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  return {
    service: new AiSettingsService(db as unknown as DbService, config),
    db,
  };
}

describe('AiSettingsService', () => {
  it('requires an account for upsert/view/remove', async () => {
    const { service } = makeService();
    await expect(service.upsert(null, 'openai', 'sk-x'.repeat(3))).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.view(null)).rejects.toThrow(ForbiddenException);
    await expect(service.remove(null)).rejects.toThrow(ForbiddenException);
  });

  it('rejects when encryption is not configured on the server', async () => {
    const { service } = makeService({});
    await expect(
      service.upsert('user-1', 'openai', 'sk-test-key-123'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown providers (fake is not user-selectable)', async () => {
    const { service } = makeService();
    await expect(
      service.upsert('user-1', 'fake', 'whatever-key'),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores the key encrypted, never plaintext', async () => {
    const { service, db } = makeService();
    const view = await service.upsert('user-1', 'anthropic', 'sk-ant-secret-key', 'claude-opus-4-8');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO user_ai_settings');
    expect(JSON.stringify(params)).not.toContain('sk-ant-secret-key');
    expect(view.apiKeyMasked).toBe('sk-a…-key');
    expect(view.provider).toBe('anthropic');
  });

  it('resolve decrypts the stored key for the hot path', async () => {
    const { service, db } = makeService();
    await service.upsert('user-1', 'gemini', 'AIza-test-key-value');
    const ciphertext = db.query.mock.calls[0][1][2];

    db.query.mockResolvedValue({
      rows: [{ provider: 'gemini', api_key_ciphertext: ciphertext, model: null }],
    });
    const resolved = await service.resolve('user-1');
    expect(resolved).toEqual({
      provider: 'gemini',
      apiKey: 'AIza-test-key-value',
      model: null,
    });
  });

  it('resolve returns null for anonymous users and missing rows', async () => {
    const { service } = makeService();
    expect(await service.resolve(null)).toBeNull();
    expect(await service.resolve('user-1')).toBeNull(); // db returns no rows
  });

  it('resolve fails open (null) when decryption fails', async () => {
    const { service, db } = makeService();
    db.query.mockResolvedValue({
      rows: [
        { provider: 'openai', api_key_ciphertext: 'garbage:junk:bad', model: null },
      ],
    });
    expect(await service.resolve('user-1')).toBeNull();
  });
});
