import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateRepliesDto, RefineDto } from './dto/generate-replies.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('replies')
  generateReplies(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateRepliesDto,
  ) {
    return this.ai.generateReplies(req.auth.sub, req.auth.userId, dto);
  }

  @Post('refine')
  refine(@Req() req: AuthenticatedRequest, @Body() dto: RefineDto) {
    return this.ai.refine(req.auth.sub, req.auth.userId, dto);
  }
}
