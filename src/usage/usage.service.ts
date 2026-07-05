import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { DbService } from '../db/db.service';

export type UsageKind = 'reply_generate' | 'refine';

export interface UsageSummary {
  plan: string;
  used: number;
  limit: number | null;
  enforced: boolean;
  resetsAt: string;
}

/**
 * Metering is ON from day one; plan-limit enforcement is OFF during the MVP
 * (powerful-MVP decision — see flirt-docs/COST_MODEL.md). The machinery below
 * is complete so v0.3+ can flip ENFORCE_PLAN_LIMITS=true without code changes.
 * The only always-active ceiling is anti-abuse.
 */
@Injectable()
export class UsageService implements OnModuleDestroy {
  private readonly logger = new Logger(UsageService.name);
  private readonly redis: Redis;
  private readonly abuseCeiling: number;
  private readonly enforcePlanLimits: boolean;
  private readonly freeDailyLimit: number;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      lazyConnect: false,
      maxRetriesPerRequest: 2,
    });
    this.abuseCeiling = config.get<number>('ABUSE_MAX_REQUESTS_PER_HOUR', 100);
    this.enforcePlanLimits =
      config.get<string>('ENFORCE_PLAN_LIMITS', 'false') === 'true';
    this.freeDailyLimit = config.get<number>('FREE_PLAN_DAILY_LIMIT', 20);
  }

  /**
   * Anti-abuse ceiling (always on) + plan limits (behind the flag).
   * Fails open on Redis outage — metering must never take the product down.
   */
  async checkLimits(deviceId: string, plan: string): Promise<void> {
    const hourBucket = new Date().toISOString().slice(0, 13); // yyyy-mm-ddThh
    const abuseKey = `abuse:${deviceId}:${hourBucket}`;
    try {
      const count = await this.redis.incr(abuseKey);
      if (count === 1) {
        await this.redis.expire(abuseKey, 3600);
      }
      if (count > this.abuseCeiling) {
        throw new HttpException(
          { error: { code: 'rate_limited', message: 'Too many requests' } },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      if (this.enforcePlanLimits && plan === 'free') {
        const used = await this.usedToday(deviceId);
        if (used >= this.freeDailyLimit) {
          throw new HttpException(
            {
              error: {
                code: 'plan_limit_reached',
                message: 'Daily free limit reached — upgrade to keep going',
              },
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      this.logger.warn(`Redis unavailable, skipping limit checks: ${err}`);
    }
  }

  /** Durable audit trail + daily counter — feeds analytics and GET /usage. */
  async record(
    deviceId: string,
    userId: string | null,
    kind: UsageKind,
  ): Promise<void> {
    try {
      await this.db.query(
        'INSERT INTO usage_events (device_id, user_id, kind) VALUES ($1, $2, $3)',
        [deviceId, userId, kind],
      );
    } catch (err) {
      this.logger.error(`Failed to record usage event: ${err}`);
    }
    try {
      const key = this.dailyKey(deviceId);
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, 26 * 3600);
      }
    } catch {
      // Redis down — GET /usage falls back to Postgres
    }
  }

  async summary(deviceId: string, plan: string): Promise<UsageSummary> {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    return {
      plan,
      used: await this.usedToday(deviceId),
      limit: plan === 'free' ? this.freeDailyLimit : null,
      enforced: this.enforcePlanLimits,
      resetsAt: tomorrow.toISOString(),
    };
  }

  /** Redis daily counter with a Postgres fallback. */
  private async usedToday(deviceId: string): Promise<number> {
    try {
      const value = await this.redis.get(this.dailyKey(deviceId));
      if (value !== null) return parseInt(value, 10);
    } catch {
      // fall through to Postgres
    }
    const result = await this.db.query<{ count: string }>(
      `SELECT count(*) AS count FROM usage_events
       WHERE device_id = $1 AND created_at >= date_trunc('day', NOW())`,
      [deviceId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  private dailyKey(deviceId: string): string {
    return `usage:${deviceId}:${new Date().toISOString().slice(0, 10)}`;
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
