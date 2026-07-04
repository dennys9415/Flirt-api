import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai-provider.interface';
import { AnthropicProvider } from './anthropic.provider';
import { FakeProvider } from './fake.provider';
import { GeminiProvider } from './gemini.provider';
import { OpenAiProvider } from './openai.provider';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

/**
 * Config-driven provider selection (AI_PROVIDER env var).
 * Swapping vendors is a config change, never a code change — see CLAUDE.md #2.
 */
export const aiProviderFactory: Provider = {
  provide: AI_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AiProvider => {
    const name = config.get<string>('AI_PROVIDER', 'fake').toLowerCase();
    switch (name) {
      case 'openai':
        return new OpenAiProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'gemini':
        return new GeminiProvider(config);
      case 'fake':
        return new FakeProvider();
      default:
        throw new Error(
          `Unknown AI_PROVIDER "${name}" — expected fake | openai | anthropic | gemini`,
        );
    }
  },
};
