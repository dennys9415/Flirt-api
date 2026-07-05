import { BadGatewayException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { UsageService } from '../usage/usage.service';
import { AiService } from './ai.service';
import { AiProvider } from './providers/ai-provider.interface';
import { ModelOutputError } from './providers/parse-suggestions';
import { AI_PROVIDER } from './providers/provider.factory';

describe('AiService', () => {
  let service: AiService;
  let provider: jest.Mocked<AiProvider>;
  let db: { query: jest.Mock };
  let usage: { checkAbuseCeiling: jest.Mock; record: jest.Mock };

  beforeEach(async () => {
    provider = {
      name: 'mock',
      generateReplies: jest.fn(),
      refine: jest.fn(),
    };
    db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    usage = {
      checkAbuseCeiling: jest.fn().mockResolvedValue(undefined),
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: AI_PROVIDER, useValue: provider },
        { provide: DbService, useValue: db },
        { provide: UsageService, useValue: usage },
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
    });
  });

  it('checks the abuse ceiling before generating', async () => {
    usage.checkAbuseCeiling.mockRejectedValue(new Error('rate limited'));
    await expect(service.generateReplies('dev-1', null, dto)).rejects.toThrow(
      'rate limited',
    );
    expect(provider.generateReplies).not.toHaveBeenCalled();
  });

  it('records usage and request metadata without message content', async () => {
    provider.generateReplies.mockResolvedValue({
      suggestions: [{ text: 'Ha!', style: 'playful' }],
      model: 'mock-1',
    });

    await service.generateReplies('dev-1', 'user-1', dto);

    expect(usage.record).toHaveBeenCalledWith('dev-1', 'user-1', 'reply_generate');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO reply_requests');
    expect(sql).toContain('NULL'); // input_message never persisted in MVP
    expect(params).not.toContain('Hey!'); // privacy: message text stays out
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
