import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @IsOptional()
  @IsObject()
  personality?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  historyOptIn?: boolean;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Returns { user: null } for anonymous devices — the app renders both states. */
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const user = req.auth.userId
      ? await this.users.findById(req.auth.userId)
      : null;
    return { user };
  }

  @Patch('profile')
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(req.auth.userId, dto);
  }
}
