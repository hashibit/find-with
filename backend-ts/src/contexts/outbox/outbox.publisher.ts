import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';

import { OutboxEvent } from '../../database/entities/outbox/outbox-event.entity.js';

/**
 * OutboxPublisher handles publishing domain events from the outbox table.
 * Uses FOR UPDATE SKIP LOCKED pattern for concurrent worker processing.
 */
@Injectable()
export class OutboxPublisher {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
  ) {}

  /**
   * Publish events for a specific consumer group using SKIP LOCKED pattern.
   * This ensures concurrent workers don't process the same event.
   * Returns the list of published event IDs.
   */
  async publishConsumerGroup(consumerGroup: string, limit: number = 10): Promise<string[]> {
    const query = `
      WITH locked AS (
        SELECT id
        FROM outbox_events
        WHERE "consumerGroup" = $1
          AND "dispatchedAt" IS NULL
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT $2
      )
      UPDATE outbox_events
      SET "dispatchedAt" = NOW()
      WHERE id IN (SELECT id FROM locked)
      RETURNING outbox_events.id, event_type, payload, "consumerGroup"
    `;

    const result = await this.outboxRepo.query(query, [consumerGroup, limit]);

    const publishedEvents = result as Array<{
      id: string;
      eventType: string;
      payload: Record<string, unknown>;
      consumerGroup: string;
    }>;

    this.logPublishedEvents(publishedEvents);

    return publishedEvents.map((e) => e.id);
  }

  /**
   * Publish all pending events across all consumer groups.
   * Useful for draining the outbox during shutdown or maintenance.
   */
  async publishAllPending(limit: number = 100): Promise<{ [consumerGroup: string]: string[] }> {
    const results: { [consumerGroup: string]: string[] } = {};

    // Get unique consumer groups with pending events
    const groupsResult = await this.outboxRepo.query(`
      SELECT DISTINCT "consumerGroup"
      FROM outbox_events
      WHERE "dispatchedAt" IS NULL
      LIMIT 10
    `);

    const groups = (groupsResult as Array<{ consumerGroup: string }>).map(
      (r) => r.consumerGroup,
    );

    for (const group of groups) {
      const published = await this.publishConsumerGroup(group, limit);
      if (published.length > 0) {
        results[group] = published;
      }
    }

    return results;
  }

  /**
   * Queue a new event for later publishing.
   * This is the entry point for domain events.
   */
  async enqueueEvent(
    eventType: string,
    payload: Record<string, unknown> | null,
    consumerGroup: string,
  ): Promise<OutboxEvent> {
    const event = this.outboxRepo.create({
      id: ulid(),
      eventType,
      payload,
      consumerGroup,
    });
    await this.outboxRepo.save(event);
    return event;
  }

  /**
   * Get count of pending events for a consumer group.
   */
  async countPending(consumerGroup: string): Promise<number> {
    return this.outboxRepo.count({
      where: { consumerGroup, dispatchedAt: undefined },
    });
  }

  private logPublishedEvents(events: Array<{ id: string; eventType: string }>): void {
    if (events.length === 0) return;
    const msg = events.map((e) => `[${e.eventType}] ${e.id}`).join(', ');
    console.log(`[OutboxPublisher] Published events: ${msg}`);
  }
}
