import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsISO8601, IsOptional, IsString, Length } from 'class-validator';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionsService } from './subscriptions.service';

class VerifyDto {
  @IsString()
  @Length(1, 128)
  transactionId: string;

  @IsString()
  @Length(1, 200)
  productId: string;

  @IsIn(['storekit_test', 'sandbox', 'production'])
  environment: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Post('verify')
  verify(@Req() req: AuthenticatedRequest, @Body() dto: VerifyDto) {
    return this.subscriptions.verify(req.auth.userId, dto);
  }
}
