import { GoogleGenAI } from '@google/genai';
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
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(apiKey: string | undefined, model?: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model || 'gemini-flash-latest';
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
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        // Structured output: enforce our suggestions JSON schema
        responseJsonSchema: SUGGESTIONS_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new ModelOutputError(this.name, 'empty completion');
    }
    return text;
  }
}
