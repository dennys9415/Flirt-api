import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { UsageService } from '../usage/usage.service';
import { GenerateRepliesDto, RefineDto } from './dto/generate-replies.dto';
import { AiProvider } from './providers/ai-provider.interface';
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
  ) {}

  async generateReplies(
    deviceId: string,
    userId: string | null,
    dto: GenerateRepliesDto,
  ) {
    await this.usage.checkAbuseCeiling(deviceId);

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

    // Metadata only — message/suggestion text stays out until history opt-in (v0.3)
    await this.persistRequestMetadata(deviceId, userId, dto, latencyMs, result.model);
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
    await this.usage.checkAbuseCeiling(deviceId);

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

  private async persistRequestMetadata(
    deviceId: string,
    userId: string | null,
    dto: GenerateRepliesDto,
    latencyMs: number,
    model: string,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO reply_requests
           (device_id, user_id, tone, intent, input_message, provider, model, latency_ms)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
        // input_message stays NULL until history opt-in ships (v0.3)
        [deviceId, userId, dto.tone, dto.intent, this.provider.name, model, latencyMs],
      );
    } catch (err) {
      this.logger.error(`Failed to persist request metadata: ${err}`);
    }
  }
}
