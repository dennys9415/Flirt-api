import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

export interface HistoryEntry {
  id: string;
  message: string;
  tone: string;
  suggestions: { text: string; style: string }[];
  createdAt: string;
}

interface HistoryRow {
  id: string;
  input_message: string;
  tone: string;
  created_at: Date;
  suggestions: { text: string; style: string; position: number }[] | null;
}

@Injectable()
export class HistoryService {
  constructor(private readonly db: DbService) {}

  /**
   * History is scoped to the account when logged in (any device), otherwise
   * to the calling device. Only rows with persisted content (opt-in) appear.
   */
  async list(
    deviceId: string,
    userId: string | null,
    limit: number,
  ): Promise<HistoryEntry[]> {
    const scope = userId ? 'r.user_id = $1' : 'r.device_id = $1';
    const result = await this.db.query<HistoryRow>(
      `SELECT r.id, r.input_message, r.tone, r.created_at,
              json_agg(
                json_build_object('text', s.text, 'style', s.style, 'position', s.position)
                ORDER BY s.position
              ) FILTER (WHERE s.id IS NOT NULL) AS suggestions
       FROM reply_requests r
       LEFT JOIN reply_suggestions s ON s.request_id = r.id
       WHERE ${scope} AND r.input_message IS NOT NULL
       GROUP BY r.id
       ORDER BY r.created_at DESC
       LIMIT $2`,
      [userId ?? deviceId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      message: row.input_message,
      tone: row.tone,
      suggestions: (row.suggestions ?? []).map(({ text, style }) => ({
        text,
        style,
      })),
      createdAt: row.created_at.toISOString(),
    }));
  }
}
