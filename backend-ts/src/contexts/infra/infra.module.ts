import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InfraController } from './infra.controller.js';
import { TelemetryEvent } from '../../database/entities/telemetry/telemetry-event.entity.js';
import { IamModule } from '../iam/iam.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryEvent]), IamModule],
  controllers: [InfraController],
})
export class InfraModule {}
