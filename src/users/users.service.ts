import { ForbiddenException, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  plan: string;
  personality: Record<string, unknown> | null;
  historyOptIn: boolean;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  plan: string;
  personality: Record<string, unknown> | null;
  history_opt_in: boolean;
}

export interface UpdateProfileInput {
  displayName?: string;
  personality?: Record<string, unknown>;
  historyOptIn?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly db: DbService) {}

  async findById(userId: string): Promise<UserProfile | null> {
    const result = await this.db.query<UserRow>(
      `SELECT id, email, display_name, plan, personality, history_opt_in
       FROM users WHERE id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? this.toProfile(row) : null;
  }

  /** Plan + history flag in one query — used on the hot generation path. */
  async flags(
    userId: string | null,
  ): Promise<{ plan: string; historyOptIn: boolean }> {
    if (!userId) return { plan: 'free', historyOptIn: false };
    const result = await this.db.query<{
      plan: string;
      history_opt_in: boolean;
    }>('SELECT plan, history_opt_in FROM users WHERE id = $1', [userId]);
    const row = result.rows[0];
    return {
      plan: row?.plan ?? 'free',
      historyOptIn: row?.history_opt_in ?? false,
    };
  }

  async updateProfile(
    userId: string | null,
    input: UpdateProfileInput,
  ): Promise<UserProfile> {
    if (!userId) {
      throw new ForbiddenException({
        error: {
          code: 'account_required',
          message: 'Create an account to edit your profile',
        },
      });
    }
    const result = await this.db.query<UserRow>(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         personality = COALESCE($3, personality),
         history_opt_in = COALESCE($4, history_opt_in),
         updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, plan, personality, history_opt_in`,
      [
        userId,
        input.displayName ?? null,
        input.personality ? JSON.stringify(input.personality) : null,
        input.historyOptIn ?? null,
      ],
    );
    return this.toProfile(result.rows[0]);
  }

  private toProfile(row: UserRow): UserProfile {
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      plan: row.plan,
      personality: row.personality,
      historyOptIn: row.history_opt_in,
    };
  }
}
