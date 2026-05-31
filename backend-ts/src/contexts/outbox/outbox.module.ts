import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxPublisher } from './outbox.publisher.js';
import { OutboxEvent } from '../../database/entities/outbox/outbox-event.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxPublisher],
  exports: [OutboxPublisher],
})
export class OutboxModule {}
