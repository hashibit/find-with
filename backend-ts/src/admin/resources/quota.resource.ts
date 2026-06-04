import type { ResourceWithOptions } from 'adminjs';
import type { Repository } from 'typeorm';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity.js';
import { wrapRepo } from '../repository-resource.js';

export function buildQuotaResource(repo: Repository<QuotaUsageCounter>): ResourceWithOptions {
  return {
    resource: wrapRepo(QuotaUsageCounter, repo),
    options: {
      actions: {
        new: { isVisible: false },
        edit: { isVisible: false },
        delete: { isVisible: false },
        bulkDelete: { isVisible: false },
        list: { isVisible: true },
        show: { isVisible: true },
      },
    },
  };
}
