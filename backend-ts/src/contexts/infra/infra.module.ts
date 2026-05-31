import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { InfraController } from './infra.controller.js';
import { TelemetryEvent } from '../../database/entities/telemetry/telemetry-event.entity.js';
import { IamWebhookEvent } from '../../database/entities/iam/webhook-event.entity.js';
import { IamModule } from '../iam/iam.module.js';
import { MEMORY_QUEUE } from '../memory/memory.constants.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelemetryEvent, IamWebhookEvent]),
    BullModule.registerQueue({ name: MEMORY_QUEUE }),
    IamModule,
  ],
  controllers: [InfraController],
})
export class InfraModule {}
