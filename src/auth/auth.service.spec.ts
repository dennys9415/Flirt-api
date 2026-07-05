import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DbService } from '../db/db.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let db: { query: jest.Mock };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  beforeEach(async () => {
    db = { query: jest.fn() };
    jwt = {
      signAsync: jest.fn().mockResolvedValue('signed-token'),
      verifyAsync: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DbService, useValue: db },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: { get: (_: string, fallback?: string) => fallback },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('upserts the device and issues a token pair', async () => {
    db.query.mockResolvedValue({
      rows: [{ id: 'device-1', user_id: null }],
      rowCount: 1,
    });

    const pair = await service.authenticateDevice({
      deviceIdentifier: 'ABCDEF123456',
      platform: 'ios',
    });

    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT');
    expect(pair.deviceId).toBe('device-1');
    expect(pair.accessToken).toBe('signed-token');
    // access + refresh
    expect(jwt.signAsync).toHaveBeenCalledTimes(2);
    expect(jwt.signAsync.mock.calls[0][0]).toMatchObject({
      sub: 'device-1',
      type: 'access',
    });
    expect(jwt.signAsync.mock.calls[1][0]).toMatchObject({ type: 'refresh' });
  });

  it('refreshes with a valid refresh token', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'device-1',
      userId: null,
      type: 'refresh',
    });
    db.query.mockResolvedValue({
      rows: [{ id: 'device-1', user_id: null }],
      rowCount: 1,
    });

    const pair = await service.refresh('some-refresh-token');
    expect(pair.deviceId).toBe('device-1');
  });

  it('rejects an access token used as refresh token', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'device-1',
      userId: null,
      type: 'access',
    });
    await expect(service.refresh('an-access-token')).rejects.toThrow(
      'Not a refresh token',
    );
  });

  it('rejects refresh for an unknown device', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'ghost',
      userId: null,
      type: 'refresh',
    });
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(service.refresh('token')).rejects.toThrow('Device not found');
  });
});
