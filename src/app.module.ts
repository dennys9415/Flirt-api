import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { HealthModule } from './health/health.module';
import { HistoryModule } from './history/history.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AiModule,
    UsageModule,
    HistoryModule,
  ],
})
export class AppModule {}
