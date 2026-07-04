import { Injectable } from '@nestjs/common';
import {
  AiProvider,
  GenerateRepliesInput,
  GenerateRepliesResult,
  RefineInput,
  RefineResult,
} from './ai-provider.interface';

/**
 * Deterministic provider for local development and tests.
 * No API key, no network, instant responses.
 */
@Injectable()
export class FakeProvider implements AiProvider {
  readonly name = 'fake';

  async generateReplies(
    input: GenerateRepliesInput,
  ): Promise<GenerateRepliesResult> {
    const suggestions = Array.from({ length: input.count }, (_, i) => ({
      text: `[${input.tone}] Fake reply ${i + 1} to: "${input.message.slice(0, 40)}"`,
      style: ['playful', 'curious', 'confident'][i % 3],
    }));
    return { suggestions, model: 'fake-model-v1' };
  }

  async refine(input: RefineInput): Promise<RefineResult> {
    return {
      text: `[${input.action}] ${input.text}`,
      style: 'refined',
      model: 'fake-model-v1',
    };
  }
}
