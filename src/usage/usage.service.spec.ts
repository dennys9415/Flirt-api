import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import { UsageService } from './usage.service';

const redisMock = {
  incr: jest.fn(),
  expire: jest.fn(),
  get: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => redisMock),
}));

function makeService(env: Record<string, string> = {}) {
  const config = {
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  } as unknown as ConfigService;
  const db = { query: jest.fn() } as unknown as DbService & {
    query: jest.Mock;
  };
  return { service: new UsageService(db, config), db };
}

describe('UsageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkLimits', () => {
    it('allows requests under the ceiling', async () => {
      redisMock.incr.mockResolvedValue(5);
      const { service } = makeService();
      await expect(service.checkLimits('dev-1', 'free')).resolves.toBeUndefined();
    });

    it('sets the TTL on the first request of the hour bucket', async () => {
      redisMock.incr.mockResolvedValue(1);
      const { service } = makeService();
      await service.checkLimits('dev-1', 'free');
      expect(redisMock.expire).toHaveBeenCalledWith(
        expect.stringContaining('abuse:dev-1:'),
        3600,
      );
    });

    it('throws 429 past the anti-abuse ceiling', async () => {
      redisMock.incr.mockResolvedValue(101);
      const { service } = makeService({ ABUSE_MAX_REQUESTS_PER_HOUR: '100' });
      await expect(service.checkLimits('dev-1', 'free')).rejects.toThrow(
        HttpException,
      );
      await redisMock.incr.mockResolvedValue(102);
      const error = await service.checkLimits('dev-1', 'free').catch((e) => e);
      expect(error.getStatus()).toBe(429);
    });

    it('fails open when Redis is down (product must not break)', async () => {
      redisMock.incr.mockRejectedValue(new Error('ECONNREFUSED'));
      const { service } = makeService();
      await expect(service.checkLimits('dev-1', 'free')).resolves.toBeUndefined();
    });

    it('does NOT enforce plan limits by default (powerful-MVP)', async () => {
      redisMock.incr.mockResolvedValue(2);
      redisMock.get.mockResolvedValue('9999'); // way past any plan limit
      const { service } = makeService();
      await expect(service.checkLimits('dev-1', 'free')).resolves.toBeUndefined();
    });

    it('enforces the free daily limit when the flag is on', async () => {
      redisMock.incr.mockResolvedValue(2);
      redisMock.get.mockResolvedValue('20');
      const { service } = makeService({
        ENFORCE_PLAN_LIMITS: 'true',
        FREE_PLAN_DAILY_LIMIT: '20',
      });
      const error = await service.checkLimits('dev-1', 'free').catch((e) => e);
      expect(error.getStatus()).toBe(429);
      expect(JSON.stringify(error.getResponse())).toContain('plan_limit_reached');
    });

    it('never limits paid plans even with the flag on', async () => {
      redisMock.incr.mockResolvedValue(2);
      redisMock.get.mockResolvedValue('9999');
      const { service } = makeService({ ENFORCE_PLAN_LIMITS: 'true' });
      await expect(service.checkLimits('dev-1', 'pro')).resolves.toBeUndefined();
    });
  });

  describe('summary', () => {
    it('reports usage from the Redis daily counter', async () => {
      redisMock.get.mockResolvedValue('7');
      const { service } = makeService();
      const summary = await service.summary('dev-1', 'free');
      expect(summary).toMatchObject({
        plan: 'free',
        used: 7,
        limit: 20,
        enforced: false,
      });
      expect(new Date(summary.resetsAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('falls back to Postgres when Redis is empty', async () => {
      redisMock.get.mockResolvedValue(null);
      const { service, db } = makeService();
      db.query.mockResolvedValue({ rows: [{ count: '3' }] });
      const summary = await service.summary('dev-1', 'pro');
      expect(summary.used).toBe(3);
      expect(summary.limit).toBeNull(); // paid plans are unlimited
    });
  });

  describe('record', () => {
    it('writes a usage event row', async () => {
      redisMock.incr.mockResolvedValue(1);
      const { service, db } = makeService();
      await service.record('dev-1', null, 'reply_generate');
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_events'),
        ['dev-1', null, 'reply_generate'],
      );
    });

    it('swallows metering failures (fail-open)', async () => {
      const { service, db } = makeService();
      db.query.mockRejectedValue(new Error('db down'));
      await expect(
        service.record('dev-1', null, 'refine'),
      ).resolves.toBeUndefined();
    });
  });
});
