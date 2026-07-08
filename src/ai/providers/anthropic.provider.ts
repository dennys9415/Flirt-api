import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { buildRefinePrompt, buildUserPrompt, SYSTEM_PROMPT } from '../prompts';
import {
  AiProvider,
  GenerateRepliesInput,
  GenerateRepliesResult,
  RefineInput,
  RefineResult,
  SUGGESTIONS_SCHEMA,
} from './ai-provider.interface';
import { ModelOutputError, parseSuggestions } from './parse-suggestions';

@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string | undefined, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-opus-4-8';
  }

  async generateReplies(
    input: GenerateRepliesInput,
  ): Promise<GenerateRepliesResult> {
    const raw = await this.complete(buildUserPrompt(input));
    return {
      suggestions: parseSuggestions(this.name, raw, input.count),
      model: this.model,
    };
  }

  async refine(input: RefineInput): Promise<RefineResult> {
    const raw = await this.complete(
      buildRefinePrompt(input.text, input.action),
    );
    const [suggestion] = parseSuggestions(this.name, raw, 1);
    return { ...suggestion, model: this.model };
  }

  private async complete(userPrompt: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      // Structured outputs: the model must return JSON matching our schema
      output_config: {
        format: { type: 'json_schema', schema: SUGGESTIONS_SCHEMA },
      },
      messages: [{ role: 'user', content: userPrompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (response.stop_reason === 'refusal') {
      throw new ModelOutputError(this.name, 'model refused the request');
    }
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      throw new ModelOutputError(this.name, 'no text block in response');
    }
    return text.text;
  }
}
