import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InfraController } from './infra.controller';
import { TelemetryEvent } from '../../database/entities/telemetry/telemetry-event.entity';
import { IamModule } from '../iam/iam.module';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryEvent]), IamModule],
  controllers: [InfraController],
})
export class InfraModule {}
