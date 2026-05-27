import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ClerkAuthGuard } from '../../common/guards/clerk-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';

class CreateCheckoutDto {
  @IsString() priceId: string;
  @IsString() successUrl: string;
  @IsString() cancelUrl: string;
}

class CreatePortalDto {
  @IsString() returnUrl: string;
}

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(ClerkAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('subscription')
  @ApiOperation({ summary: 'Get subscription status' })
  async getSubscription(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getSubscription(user.userId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Create Stripe checkout session' })
  async checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCheckoutDto) {
    return this.service.createCheckoutSession(user.userId, dto.priceId, dto.successUrl, dto.cancelUrl);
  }

  @Post('portal')
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  async portal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePortalDto) {
    return this.service.createPortalSession(user.userId, dto.returnUrl);
  }
}
