/**
 * Multi-provider AI abstraction — see flirt-docs/ARCHITECTURE.md.
 * Provider and model are config-driven; call sites never reference a vendor.
 */

export type Tone =
  | 'light_flirt'
  | 'deep_flirt'
  | 'funny'
  | 'confident'
  | 'professional';

export type Intent = 'reply' | 'rewrite' | 'refine';

export type RefineAction = 'shorter' | 'funnier' | 'more_direct';

export interface Suggestion {
  text: string;
  style: string;
}

export interface GenerateRepliesInput {
  message: string;
  tone: Tone;
  intent: Intent;
  appHint?: string;
  personalityTraits?: string[];
  count: number;
}

export interface GenerateRepliesResult {
  suggestions: Suggestion[];
  /** Resolved model id, returned for observability (see AI_PROMPTS.md). */
  model: string;
}

export interface RefineInput {
  text: string;
  action: RefineAction;
}

export interface RefineResult {
  text: string;
  style: string;
  model: string;
}

export interface AiProvider {
  readonly name: string;
  generateReplies(input: GenerateRepliesInput): Promise<GenerateRepliesResult>;
  refine(input: RefineInput): Promise<RefineResult>;
}

/** JSON schema every provider must make the model conform to. */
export const SUGGESTIONS_SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          style: { type: 'string' },
        },
        required: ['text', 'style'],
        additionalProperties: false,
      },
    },
  },
  required: ['suggestions'],
  additionalProperties: false,
} as const;
