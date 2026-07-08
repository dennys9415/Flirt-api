import { Module } from '@nestjs/common';
import { AiSettingsModule } from '../ai-settings/ai-settings.module';
import { UsageModule } from '../usage/usage.module';
import { UsersModule } from '../users/users.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { aiProviderFactory } from './providers/provider.factory';

@Module({
  imports: [UsageModule, UsersModule, AiSettingsModule],
  controllers: [AiController],
  providers: [AiService, aiProviderFactory],
})
export class AiModule {}
