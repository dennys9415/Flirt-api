import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import { SubscriptionsService } from './subscriptions.service';

function makeService(env: Record<string, string> = {}) {
  const config = {
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  } as unknown as ConfigService;
  const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
  return {
    service: new SubscriptionsService(db as unknown as DbService, config),
    db,
  };
}

const input = {
  transactionId: 'txn-123',
  productId: 'com.singularitybox.flirt.pro.monthly',
  environment: 'storekit_test',
};

describe('SubscriptionsService', () => {
  it('requires an account', async () => {
    const { service } = makeService();
    await expect(service.verify(null, input)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('records the subscription and upgrades the plan (trust_client)', async () => {
    const { service, db } = makeService();
    const result = await service.verify('user-1', input);

    expect(result).toEqual({ plan: 'pro', status: 'active', expiresAt: null });
    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO subscriptions');
    expect(db.query.mock.calls[1][0]).toContain('UPDATE users SET plan');
    expect(db.query.mock.calls[1][1]).toEqual(['user-1', 'pro']);
  });

  it('maps premium product ids to the premium plan', async () => {
    const { service } = makeService();
    const result = await service.verify('user-1', {
      ...input,
      productId: 'com.singularitybox.flirt.premium.monthly',
    });
    expect(result.plan).toBe('premium');
  });

  it('rejects unknown product ids', async () => {
    const { service } = makeService();
    await expect(
      service.verify('user-1', { ...input, productId: 'com.evil.hack' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects claims when real verification mode is configured but unimplemented', async () => {
    const { service } = makeService({ SUBSCRIPTION_VERIFY_MODE: 'app_store' });
    const error = await service.verify('user-1', input).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify(error.getResponse())).toContain(
      'verification_unavailable',
    );
  });
});
