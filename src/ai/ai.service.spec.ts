import { BadGatewayException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AiSettingsService } from '../ai-settings/ai-settings.service';
import { DbService } from '../db/db.service';
import { UsageService } from '../usage/usage.service';
import { UsersService } from '../users/users.service';
import { AiService } from './ai.service';
import { AiProvider } from './providers/ai-provider.interface';
import { ModelOutputError } from './providers/parse-suggestions';
import { AI_PROVIDER } from './providers/provider.factory';

describe('AiService', () => {
  let service: AiService;
  let provider: jest.Mocked<AiProvider>;
  let db: { query: jest.Mock };
  let usage: { checkLimits: jest.Mock; record: jest.Mock };
  let users: { flags: jest.Mock };
  let aiSettings: { resolve: jest.Mock };

  beforeEach(async () => {
    provider = {
      name: 'mock',
      generateReplies: jest.fn(),
      refine: jest.fn(),
    };
    db = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'req-1' }] }),
    };
    usage = {
      checkLimits: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(undefined),
    };
    users = {
      flags: jest.fn().mockResolvedValue({ plan: 'free', historyOptIn: false }),
    };
    aiSettings = {
      resolve: jest.fn().mockResolvedValue(null),
    };

    const module = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: AI_PROVIDER, useValue: provider },
        { provide: DbService, useValue: db },
        { provide: UsageService, useValue: usage },
        { provide: UsersService, useValue: users },
        { provide: AiSettingsService, useValue: aiSettings },
      ],
    }).compile();

    service = module.get(AiService);
  });

  const dto = {
    message: 'Hey!',
    tone: 'funny' as const,
    intent: 'reply' as const,
  };

  it('returns suggestions with provider and model metadata', async () => {
    provider.generateReplies.mockResolvedValue({
      suggestions: [{ text: 'Ha!', style: 'playful' }],
      model: 'mock-1',
    });

    const result = await service.generateReplies('dev-1', null, dto);

    expect(result).toEqual({
      tone: 'funny',
      intent: 'reply',
      suggestions: [{ text: 'Ha!', style: 'playful' }],
      provider: 'mock',
      model: 'mock-1',
      keySource: 'system',
    });
  });

  it('uses the user own provider when BYOK settings exist', async () => {
    aiSettings.resolve.mockResolvedValue({
      provider: 'fake', // resolves through createAiProvider — deterministic
      apiKey: 'user-key',
      model: null,
    });

    const result = await service.generateReplies('dev-1', 'user-1', dto);

    expect(result.keySource).toBe('user_key');
    expect(result.provider).toBe('fake');
    // the injected system provider was NOT used
    expect(provider.generateReplies).not.toHaveBeenCalled();
  });

  it('checks limits (with the user plan) before generating', async () => {
    users.flags.mockResolvedValue({ plan: 'pro', historyOptIn: false });
    usage.checkLimits.mockRejectedValue(new Error('rate limited'));
    await expect(service.generateReplies('dev-1', null, dto)).rejects.toThrow(
      'rate limited',
    );
    expect(usage.checkLimits).toHaveBeenCalledWith('dev-1', 'pro');
    expect(provider.generateReplies).not.toHaveBeenCalled();
  });

  it('records usage and request metadata WITHOUT content when not opted in', async () => {
    provider.generateReplies.mockResolvedValue({
      suggestions: [{ text: 'Ha!', style: 'playful' }],
      model: 'mock-1',
    });

    await service.generateReplies('dev-1', 'user-1', dto);

    expect(usage.record).toHaveBeenCalledWith('dev-1', 'user-1', 'reply_generate');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO reply_requests');
    expect(params).toContain(null); // input_message NULL
    expect(params).not.toContain('Hey!'); // privacy: message text stays out
    // no suggestion content rows
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('persists message and suggestions when the user opted into history', async () => {
    users.flags.mockResolvedValue({ plan: 'free', historyOptIn: true });
    provider.generateReplies.mockResolvedValue({
      suggestions: [
        { text: 'One', style: 'playful' },
        { text: 'Two', style: 'curious' },
      ],
      model: 'mock-1',
    });

    await service.generateReplies('dev-1', 'user-1', dto);

    const [, requestParams] = db.query.mock.calls[0];
    expect(requestParams).toContain('Hey!'); // opt-in: message persisted
    // 1 request insert + 2 suggestion inserts
    expect(db.query).toHaveBeenCalledTimes(3);
    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO reply_suggestions');
  });

  it('maps provider failures to a clean 502', async () => {
    provider.generateReplies.mockRejectedValue(new Error('timeout'));
    await expect(service.generateReplies('dev-1', null, dto)).rejects.toThrow(
      BadGatewayException,
    );
    expect(usage.record).not.toHaveBeenCalled();
  });

  it('distinguishes unusable model output from provider outage', async () => {
    provider.generateReplies.mockRejectedValue(
      new ModelOutputError('mock', 'not valid JSON'),
    );
    const error = await service
      .generateReplies('dev-1', null, dto)
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify(error.getResponse())).toContain('unusable response');
  });

  it('refines text and meters it', async () => {
    provider.refine.mockResolvedValue({
      text: 'Shorter!',
      style: 'refined',
      model: 'mock-1',
    });
    const result = await service.refine('dev-1', null, {
      text: 'A long reply',
      action: 'shorter',
    });
    expect(result).toEqual({ text: 'Shorter!', style: 'refined' });
    expect(usage.record).toHaveBeenCalledWith('dev-1', null, 'refine');
  });
});
