import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AdminGuard } from '../admin.guard.js';
import { HealthService } from './health.service.js';

@UseGuards(AdminGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('admin/api')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  async getHealth() {
    return this.healthService.getHealth();
  }
}
