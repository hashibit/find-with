import type { ResourceWithOptions } from 'adminjs';
import type { Repository } from 'typeorm';
import { OutboxEvent } from '../../database/entities/outbox/outbox-event.entity.js';
import { wrapRepo } from '../repository-resource.js';

export function buildOutboxEventResource(repo: Repository<OutboxEvent>): ResourceWithOptions {
  return {
    resource: wrapRepo(OutboxEvent, repo),
    options: {
      actions: {
        new: { isVisible: false },
        edit: { isVisible: false },
        delete: { isVisible: false },
        bulkDelete: { isVisible: false },
        list: { isVisible: true },
        show: { isVisible: true },
      },
      properties: {
        id: { isVisible: { list: true, show: true, edit: false, filter: true } },
        eventType: { isVisible: { list: true, show: true, edit: false, filter: true } },
        consumerGroup: { isVisible: { list: true, show: true, edit: false, filter: true } },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: false } },
        dispatchedAt: { isVisible: { list: true, show: true, edit: false, filter: true } },
        payload: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
      sort: { direction: 'desc', sortBy: 'createdAt' },
    },
  };
}
