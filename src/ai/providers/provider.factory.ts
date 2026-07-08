import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { FakeProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export const USER_SELECTABLE_PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
] as const;
export type UserSelectableProvider =
  (typeof USER_SELECTABLE_PROVIDERS)[number];

/**
 * Build a provider from explicit credentials. Used for BYOK (per-user keys)
 * and by the system factory below.
 */
export function createAiProvider(
  name: string,
  apiKey: string | undefined,
  model?: string,
): AiProvider {
  switch (name.toLowerCase()) {
    case 'openai':
      return new OpenAiProvider(apiKey, model);
    case 'anthropic':
      return new AnthropicProvider(apiKey, model);
    case 'gemini':
      return new GeminiProvider(apiKey, model);
    case 'fake':
      return new FakeProvider();
    default:
      throw new Error(
        `Unknown AI provider "${name}" — expected fake | openai | anthropic | gemini`,
      );
  }
}

/**
 * System default provider — config-driven (AI_PROVIDER env var). Used for
 * every request from users without their own key. See CLAUDE.md #2.
 */
export const aiProviderFactory: Provider = {
  provide: AI_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AiProvider => {
    const name = config.get<string>('AI_PROVIDER', 'fake').toLowerCase();
    const model = config.get<string>('AI_MODEL') || undefined;
    const keys: Record<string, string | undefined> = {
      openai: config.get<string>('OPENAI_API_KEY'),
      anthropic: config.get<string>('ANTHROPIC_API_KEY'),
      gemini: config.get<string>('GEMINI_API_KEY'),
      fake: undefined,
    };
    if (!(name in keys)) {
      throw new Error(
        `Unknown AI_PROVIDER "${name}" — expected fake | openai | anthropic | gemini`,
      );
    }
    return createAiProvider(name, keys[name], model);
  },
};
