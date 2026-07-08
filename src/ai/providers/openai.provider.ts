import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
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
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string | undefined, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model || 'gpt-4o-mini';
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
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      // OpenAI structured outputs — JSON schema enforced server-side
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'suggestions',
          strict: true,
          schema: SUGGESTIONS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new ModelOutputError(this.name, 'empty completion');
    }
    return content;
  }
}
