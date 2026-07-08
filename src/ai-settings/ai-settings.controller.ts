import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiSettingsService } from './ai-settings.service';

class UpsertAiSettingsDto {
  @IsIn(['openai', 'anthropic', 'gemini'])
  provider: string;

  @IsString()
  @Length(8, 500)
  apiKey: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  model?: string;
}

@Controller('users/ai-settings')
@UseGuards(JwtAuthGuard)
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService) {}

  @Get()
  async view(@Req() req: AuthenticatedRequest) {
    return { settings: await this.settings.view(req.auth.userId) };
  }

  @Put()
  async upsert(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpsertAiSettingsDto,
  ) {
    return this.settings.upsert(
      req.auth.userId,
      dto.provider,
      dto.apiKey,
      dto.model,
    );
  }

  @Delete()
  @HttpCode(204)
  async remove(@Req() req: AuthenticatedRequest) {
    await this.settings.remove(req.auth.userId);
  }
}
