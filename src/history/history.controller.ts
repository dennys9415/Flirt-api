import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HistoryService } from './history.service';

@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  /** Only returns entries saved while history opt-in was active. */
  @Get()
  async list(@Req() req: AuthenticatedRequest, @Query('limit') limit?: string) {
    const parsed = Math.min(Math.max(parseInt(limit ?? '20', 10) || 20, 1), 50);
    return {
      entries: await this.history.list(req.auth.sub, req.auth.userId, parsed),
    };
  }
}
