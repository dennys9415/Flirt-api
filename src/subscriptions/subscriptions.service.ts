import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DbService } from '../db/db.service';

export interface VerifyInput {
  transactionId: string;
  productId: string;
  environment: string;
  expiresAt?: string;
}

export interface VerifyResult {
  plan: string;
  status: string;
  expiresAt: string | null;
}

/**
 * v0.4 MVP: local StoreKit-testing transactions cannot be verified against
 * Apple (they're signed with Xcode's local test certs), so in
 * `trust_client` mode we record the claim and upgrade the plan.
 *
 * Before production (v1.0, once the Apple Developer account exists) this
 * gains real verification via the App Store Server API and
 * SUBSCRIPTION_VERIFY_MODE=app_store rejects unverified claims.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly mode: string;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.mode = config.get<string>('SUBSCRIPTION_VERIFY_MODE', 'trust_client');
  }

  async verify(userId: string | null, input: VerifyInput): Promise<VerifyResult> {
    if (!userId) {
      throw new ForbiddenException({
        error: {
          code: 'account_required',
          message: 'Create an account before subscribing',
        },
      });
    }

    if (this.mode !== 'trust_client') {
      // Placeholder for the App Store Server API integration (v1.0)
      throw new BadRequestException({
        error: {
          code: 'verification_unavailable',
          message: 'Real receipt verification is not configured yet',
        },
      });
    }

    const plan = this.planFor(input.productId);
    if (!plan) {
      throw new BadRequestException({
        error: { code: 'unknown_product', message: 'Unknown product id' },
      });
    }

    await this.db.query(
      `INSERT INTO subscriptions
         (user_id, plan, status, original_transaction_id, product_id, environment, expires_at)
       VALUES ($1, $2, 'active', $3, $4, $5, $6)
       ON CONFLICT (original_transaction_id) DO UPDATE SET
         plan = EXCLUDED.plan, status = 'active', expires_at = EXCLUDED.expires_at`,
      [
        userId,
        plan,
        input.transactionId,
        input.productId,
        input.environment,
        input.expiresAt ?? null,
      ],
    );
    await this.db.query('UPDATE users SET plan = $2, updated_at = NOW() WHERE id = $1', [
      userId,
      plan,
    ]);

    this.logger.log(
      `Plan upgraded to ${plan} for user ${userId} (${input.environment}, mode=${this.mode})`,
    );
    return {
      plan,
      status: 'active',
      expiresAt: input.expiresAt ?? null,
    };
  }

  private planFor(productId: string): string | null {
    if (productId.includes('.premium.')) return 'premium';
    if (productId.includes('.pro.')) return 'pro';
    return null;
  }
}
