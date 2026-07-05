import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai-provider.interface';
import { aiProviderFactory } from './provider.factory';

type Factory = (config: ConfigService) => AiProvider;

function configWith(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('aiProviderFactory', () => {
  const factory = (aiProviderFactory as { useFactory: Factory }).useFactory;

  it('defaults to the fake provider', () => {
    expect(factory(configWith({})).name).toBe('fake');
  });

  it.each([
    ['openai', { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' }],
    ['anthropic', { AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' }],
    ['gemini', { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' }],
    ['fake', { AI_PROVIDER: 'fake' }],
  ])('selects the %s provider from config', (name, env) => {
    expect(factory(configWith(env)).name).toBe(name);
  });

  it('is case-insensitive', () => {
    expect(factory(configWith({ AI_PROVIDER: 'FAKE' })).name).toBe('fake');
  });

  it('rejects unknown providers loudly', () => {
    expect(() => factory(configWith({ AI_PROVIDER: 'skynet' }))).toThrow(
      'Unknown AI_PROVIDER',
    );
  });
});
