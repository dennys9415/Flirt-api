import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DbService } from '../db/db.service';
import { DeviceAuthDto } from './dto/device-auth.dto';
import { LoginDto, RegisterDto } from './dto/email-auth.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
  user?: { id: string; email: string; username: string | null; plan: string };
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

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  plan: string;
  password_hash: string | null;
}

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Anonymous device identity — the pre-account entry point. */
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

  /** Create an account (email + optional username) linked to the device. */
  async register(dto: RegisterDto): Promise<TokenPair> {
    const email = dto.email.toLowerCase().trim();
    const username = dto.username?.toLowerCase().trim() || null;

    const emailTaken = await this.db.query(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    if ((emailTaken.rowCount ?? 0) > 0) {
      throw new ConflictException({
        error: { code: 'email_taken', message: 'Email already registered' },
      });
    }
    if (username) {
      const usernameTaken = await this.db.query(
        'SELECT id FROM users WHERE username = $1',
        [username],
      );
      if ((usernameTaken.rowCount ?? 0) > 0) {
        throw new ConflictException({
          error: { code: 'username_taken', message: 'Username already taken' },
        });
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.db.query<UserRow>(
      `INSERT INTO users (email, username, password_hash) VALUES ($1, $2, $3)
       RETURNING id, email, username, plan, password_hash`,
      [email, username, passwordHash],
    );
    const device = await this.linkDevice(dto.deviceIdentifier, user.rows[0].id);
    return this.issueTokens(device, user.rows[0]);
  }

  /** Login with email OR username; links the calling device. */
  async login(dto: LoginDto): Promise<TokenPair> {
    const byEmail = !!dto.email;
    const identifier = (dto.email ?? dto.username ?? '').toLowerCase().trim();
    const result = await this.db.query<UserRow>(
      `SELECT id, email, username, plan, password_hash FROM users
       WHERE ${byEmail ? 'email' : 'username'} = $1`,
      [identifier],
    );
    const user = result.rows[0];
    const valid =
      user?.password_hash != null &&
      (await bcrypt.compare(dto.password, user.password_hash));
    if (!valid) {
      throw new UnauthorizedException({
        error: { code: 'invalid_credentials', message: 'Wrong email or password' },
      });
    }
    const device = await this.linkDevice(dto.deviceIdentifier, user.id);
    return this.issueTokens(device, user);
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

  private async linkDevice(
    deviceIdentifier: string,
    userId: string,
  ): Promise<DeviceRow> {
    const result = await this.db.query<DeviceRow>(
      `INSERT INTO devices (device_identifier, user_id)
       VALUES ($1, $2)
       ON CONFLICT (device_identifier) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id, user_id`,
      [deviceIdentifier, userId],
    );
    return result.rows[0];
  }

  private async issueTokens(
    device: DeviceRow,
    user?: UserRow,
  ): Promise<TokenPair> {
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
    return {
      accessToken,
      refreshToken,
      deviceId: device.id,
      ...(user
        ? {
            user: {
              id: user.id,
              email: user.email,
              username: user.username,
              plan: user.plan,
            },
          }
        : {}),
    };
  }
}
