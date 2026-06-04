import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../admin.guard.js';
import { MetricsService } from './metrics.service.js';

@UseGuards(AdminGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('admin/api/metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('overview')
  async getOverview() {
    return this.metricsService.getOverview();
  }
}
