import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { UsageService } from './usage.service';

@Controller('usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(
    private readonly usage: UsageService,
    private readonly users: UsersService,
  ) {}

  @Get()
  async summary(@Req() req: AuthenticatedRequest) {
    const plan = req.auth.userId
      ? ((await this.users.findById(req.auth.userId))?.plan ?? 'free')
      : 'free';
    return this.usage.summary(req.auth.sub, plan);
  }
}
