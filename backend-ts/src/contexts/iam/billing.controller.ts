import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator.js';
import { BillingService } from './billing.service.js';

class CreateCheckoutDto extends createZodDto(
  z.object({
    priceId: z.string(),
    successUrl: z.string(),
    cancelUrl: z.string(),
  }),
) {}

class CreatePortalDto extends createZodDto(z.object({ returnUrl: z.string() })) {}

@ApiTags('billing')
@ApiBearerAuth()
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
    return this.service.createCheckoutSession(
      user.userId,
      dto.priceId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @Post('portal')
  @ApiOperation({ summary: 'Create Stripe billing portal session' })
  async portal(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePortalDto) {
    return this.service.createPortalSession(user.userId, dto.returnUrl);
  }
}
