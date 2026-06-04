import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AdminGuard } from '../admin.guard.js';
import { MetricsService } from './metrics.service.js';

@UseGuards(ThrottlerGuard, AdminGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('admin/ops/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  async getOverview() {
    return this.metricsService.getOverview();
  }
}
