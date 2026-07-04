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

/**
 * Metering is ON from day one; plan-limit enforcement is OFF during the MVP
 * (powerful-MVP decision — see flirt-docs/COST_MODEL.md). The only active
 * ceiling is anti-abuse: absurdly high for a human, low for a bot.
 */
@Injectable()
export class UsageService implements OnModuleDestroy {
  private readonly logger = new Logger(UsageService.name);
  private readonly redis: Redis;
  private readonly abuseCeiling: number;
  private readonly enforcePlanLimits: boolean;

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
  }

  /** Throws 429 only past the anti-abuse ceiling. Fails open on Redis outage. */
  async checkAbuseCeiling(deviceId: string): Promise<void> {
    const hourBucket = new Date().toISOString().slice(0, 13); // yyyy-mm-ddThh
    const key = `abuse:${deviceId}:${hourBucket}`;
    try {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.expire(key, 3600);
      }
      if (count > this.abuseCeiling) {
        throw new HttpException(
          { error: { code: 'rate_limited', message: 'Too many requests' } },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // Redis down must never take the product down — log and continue.
      this.logger.warn(`Redis unavailable, skipping abuse check: ${err}`);
    }

    if (this.enforcePlanLimits) {
      // Plan limits land in v0.3 — flag stays false during the MVP.
      this.logger.warn('ENFORCE_PLAN_LIMITS=true but not implemented yet');
    }
  }

  /** Durable audit trail — feeds analytics and future plan design. */
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
      // Metering failure must not break the user-facing request.
      this.logger.error(`Failed to record usage event: ${err}`);
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}
