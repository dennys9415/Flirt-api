import { Module } from '@nestjs/common';
import { UsageModule } from '../usage/usage.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { aiProviderFactory } from './providers/provider.factory';

@Module({
  imports: [UsageModule],
  controllers: [AiController],
  providers: [AiService, aiProviderFactory],
})
export class AiModule {}
