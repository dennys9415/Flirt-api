import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

/**
 * Raw pg pool — schema is owned by Flyway migrations (Flirt-api/migrations),
 * never by application code. Signalix-style data layer.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  private pool!: Pool;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('DATABASE_URL');
    this.pool = url
      ? new Pool({ connectionString: url })
      : new Pool({
          host: this.config.get<string>('DATABASE_HOST', 'localhost'),
          port: this.config.get<number>('DATABASE_PORT', 5432),
          user: this.config.get<string>('DATABASE_USER', 'flirt'),
          password: this.config.get<string>(
            'DATABASE_PASSWORD',
            'flirt_dev_password',
          ),
          database: this.config.get<string>('DATABASE_NAME', 'flirt'),
        });
    this.pool.on('error', (err) => {
      this.logger.error(`Unexpected pg pool error: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }
}
