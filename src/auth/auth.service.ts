import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { DbService } from '../db/db.service';
import { DeviceAuthDto } from './dto/device-auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

export interface JwtPayload {
  sub: string; // device id
  userId: string | null;
  type: 'access' | 'refresh';
}

interface DeviceRow {
  id: string;
  user_id: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Anonymous device identity — full accounts arrive in v0.3. */
  async authenticateDevice(dto: DeviceAuthDto): Promise<TokenPair> {
    const result = await this.db.query<DeviceRow>(
      `INSERT INTO devices (device_identifier, platform)
       VALUES ($1, $2)
       ON CONFLICT (device_identifier) DO UPDATE SET platform = EXCLUDED.platform
       RETURNING id, user_id`,
      [dto.deviceIdentifier, dto.platform],
    );
    return this.issueTokens(result.rows[0]);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    if (payload.type !== 'refresh') {
      throw new Error('Not a refresh token');
    }
    const result = await this.db.query<DeviceRow>(
      'SELECT id, user_id FROM devices WHERE id = $1',
      [payload.sub],
    );
    if (result.rowCount === 0) {
      throw new Error('Device not found');
    }
    return this.issueTokens(result.rows[0]);
  }

  private async issueTokens(device: DeviceRow): Promise<TokenPair> {
    const base = { sub: device.id, userId: device.user_id };
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '1h');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '30d');
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' },
      { expiresIn: accessTtl } as JwtSignOptions,
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' },
      { expiresIn: refreshTtl } as JwtSignOptions,
    );
    return { accessToken, refreshToken, deviceId: device.id };
  }
}
