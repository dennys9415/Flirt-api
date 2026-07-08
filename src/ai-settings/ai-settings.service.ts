import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from '../common/crypto.util';
import { DbService } from '../db/db.service';
import {
  USER_SELECTABLE_PROVIDERS,
  UserSelectableProvider,
} from '../ai/providers/provider.factory';

export interface AiSettingsView {
  provider: UserSelectableProvider;
  model: string | null;
  apiKeyMasked: string;
}

export interface ResolvedAiSettings {
  provider: UserSelectableProvider;
  apiKey: string;
  model: string | null;
}

interface Row {
  provider: UserSelectableProvider;
  api_key_ciphertext: string;
  model: string | null;
}

/**
 * BYOK — users store their own AI provider key. Encrypted at rest
 * (AES-256-GCM); the plaintext key only exists in memory while a request
 * to that provider is being made. Never sent back to clients (masked view).
 */
@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly db: DbService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>('API_KEY_ENCRYPTION_SECRET', '');
  }

  private requireAccount(userId: string | null): asserts userId is string {
    if (!userId) {
      throw new ForbiddenException({
        error: {
          code: 'account_required',
          message: 'Create an account to use your own AI key',
        },
      });
    }
  }

  private requireEncryptionConfigured(): void {
    if (!this.encryptionKey) {
      throw new BadRequestException({
        error: {
          code: 'byok_unavailable',
          message: 'Custom AI keys are not enabled on this server',
        },
      });
    }
  }

  async upsert(
    userId: string | null,
    provider: string,
    apiKey: string,
    model?: string,
  ): Promise<AiSettingsView> {
    this.requireAccount(userId);
    this.requireEncryptionConfigured();
    if (!USER_SELECTABLE_PROVIDERS.includes(provider as UserSelectableProvider)) {
      throw new BadRequestException({
        error: {
          code: 'unknown_provider',
          message: `Provider must be one of: ${USER_SELECTABLE_PROVIDERS.join(', ')}`,
        },
      });
    }

    const ciphertext = encryptSecret(apiKey, this.encryptionKey);
    await this.db.query(
      `INSERT INTO user_ai_settings (user_id, provider, api_key_ciphertext, model)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         provider = EXCLUDED.provider,
         api_key_ciphertext = EXCLUDED.api_key_ciphertext,
         model = EXCLUDED.model,
         updated_at = NOW()`,
      [userId, provider, ciphertext, model ?? null],
    );
    this.logger.log(`AI settings updated for user ${userId} (${provider})`);
    return {
      provider: provider as UserSelectableProvider,
      model: model ?? null,
      apiKeyMasked: maskSecret(apiKey),
    };
  }

  async view(userId: string | null): Promise<AiSettingsView | null> {
    this.requireAccount(userId);
    const row = await this.row(userId);
    if (!row) return null;
    return {
      provider: row.provider,
      model: row.model,
      apiKeyMasked: this.safeMask(row.api_key_ciphertext),
    };
  }

  async remove(userId: string | null): Promise<void> {
    this.requireAccount(userId);
    await this.db.query('DELETE FROM user_ai_settings WHERE user_id = $1', [
      userId,
    ]);
  }

  /** Hot path — returns decrypted settings for generation, or null. */
  async resolve(userId: string | null): Promise<ResolvedAiSettings | null> {
    if (!userId || !this.encryptionKey) return null;
    const row = await this.row(userId);
    if (!row) return null;
    try {
      return {
        provider: row.provider,
        apiKey: decryptSecret(row.api_key_ciphertext, this.encryptionKey),
        model: row.model,
      };
    } catch (err) {
      // Wrong/rotated encryption secret — fall back to the system provider
      this.logger.error(`Failed to decrypt AI key for user ${userId}: ${err}`);
      return null;
    }
  }

  private async row(userId: string): Promise<Row | null> {
    const result = await this.db.query<Row>(
      'SELECT provider, api_key_ciphertext, model FROM user_ai_settings WHERE user_id = $1',
      [userId],
    );
    return result.rows[0] ?? null;
  }

  private safeMask(ciphertext: string): string {
    try {
      return maskSecret(decryptSecret(ciphertext, this.encryptionKey));
    } catch {
      return '••••';
    }
  }
}
