import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';
import { UsageService } from './usage.service';

const redisMock = {
  incr: jest.fn(),
  expire: jest.fn(),
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

  describe('checkAbuseCeiling', () => {
    it('allows requests under the ceiling', async () => {
      redisMock.incr.mockResolvedValue(5);
      const { service } = makeService();
      await expect(service.checkAbuseCeiling('dev-1')).resolves.toBeUndefined();
    });

    it('sets the TTL on the first request of the hour bucket', async () => {
      redisMock.incr.mockResolvedValue(1);
      const { service } = makeService();
      await service.checkAbuseCeiling('dev-1');
      expect(redisMock.expire).toHaveBeenCalledWith(
        expect.stringContaining('abuse:dev-1:'),
        3600,
      );
    });

    it('throws 429 past the anti-abuse ceiling', async () => {
      redisMock.incr.mockResolvedValue(101);
      const { service } = makeService({ ABUSE_MAX_REQUESTS_PER_HOUR: '100' });
      await expect(service.checkAbuseCeiling('dev-1')).rejects.toThrow(
        HttpException,
      );
      await redisMock.incr.mockResolvedValue(102);
      const error = await service.checkAbuseCeiling('dev-1').catch((e) => e);
      expect(error.getStatus()).toBe(429);
    });

    it('fails open when Redis is down (product must not break)', async () => {
      redisMock.incr.mockRejectedValue(new Error('ECONNREFUSED'));
      const { service } = makeService();
      await expect(service.checkAbuseCeiling('dev-1')).resolves.toBeUndefined();
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
