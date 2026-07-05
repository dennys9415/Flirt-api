import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { UsageService } from '../usage/usage.service';
import { UsersService } from '../users/users.service';
import { GenerateRepliesDto, RefineDto } from './dto/generate-replies.dto';
import { AiProvider, Suggestion } from './providers/ai-provider.interface';
import { ModelOutputError } from './providers/parse-suggestions';
import { AI_PROVIDER } from './providers/provider.factory';

const SUGGESTION_COUNT = 3;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly db: DbService,
    private readonly usage: UsageService,
    private readonly users: UsersService,
  ) {}

  async generateReplies(
    deviceId: string,
    userId: string | null,
    dto: GenerateRepliesDto,
  ) {
    const { plan, historyOptIn } = await this.users.flags(userId);
    await this.usage.checkLimits(deviceId, plan);

    const started = Date.now();
    let result;
    try {
      result = await this.provider.generateReplies({
        message: dto.message,
        tone: dto.tone,
        intent: dto.intent,
        appHint: dto.context?.appHint,
        count: SUGGESTION_COUNT,
      });
    } catch (err) {
      this.logger.error(`Generation failed (${this.provider.name}): ${err}`);
      throw new BadGatewayException({
        error: {
          code: 'generation_failed',
          message:
            err instanceof ModelOutputError
              ? 'The AI returned an unusable response, please retry'
              : 'AI provider unavailable, please retry',
        },
      });
    }
    const latencyMs = Date.now() - started;

    // Content (message + suggestions) is stored ONLY with explicit opt-in;
    // otherwise the row keeps metadata only. See flirt-docs/DATABASE_SCHEMA.md.
    await this.persistRequest(
      deviceId,
      userId,
      dto,
      latencyMs,
      result.model,
      historyOptIn ? result.suggestions : null,
    );
    await this.usage.record(deviceId, userId, 'reply_generate');

    return {
      tone: dto.tone,
      intent: dto.intent,
      suggestions: result.suggestions,
      provider: this.provider.name,
      model: result.model,
    };
  }

  async refine(deviceId: string, userId: string | null, dto: RefineDto) {
    const { plan } = await this.users.flags(userId);
    await this.usage.checkLimits(deviceId, plan);

    try {
      const result = await this.provider.refine({
        text: dto.text,
        action: dto.action,
      });
      await this.usage.record(deviceId, userId, 'refine');
      return { text: result.text, style: result.style };
    } catch (err) {
      this.logger.error(`Refine failed (${this.provider.name}): ${err}`);
      throw new BadGatewayException({
        error: {
          code: 'generation_failed',
          message: 'AI provider unavailable, please retry',
        },
      });
    }
  }

  private async persistRequest(
    deviceId: string,
    userId: string | null,
    dto: GenerateRepliesDto,
    latencyMs: number,
    model: string,
    suggestionsForHistory: Suggestion[] | null,
  ): Promise<void> {
    try {
      const request = await this.db.query<{ id: string }>(
        `INSERT INTO reply_requests
           (device_id, user_id, tone, intent, input_message, provider, model, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          deviceId,
          userId,
          dto.tone,
          dto.intent,
          suggestionsForHistory ? dto.message : null,
          this.provider.name,
          model,
          latencyMs,
        ],
      );

      if (suggestionsForHistory) {
        const requestId = request.rows[0].id;
        for (const [index, suggestion] of suggestionsForHistory.entries()) {
          await this.db.query(
            `INSERT INTO reply_suggestions (request_id, text, style, position)
             VALUES ($1, $2, $3, $4)`,
            [requestId, suggestion.text, suggestion.style, index],
          );
        }
      }
    } catch (err) {
      this.logger.error(`Failed to persist request: ${err}`);
    }
  }
}
