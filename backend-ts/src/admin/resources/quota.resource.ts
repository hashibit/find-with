import type { ResourceWithOptions } from 'adminjs';
import { QuotaUsageCounter } from '../../database/entities/quota/quota-counter.entity.js';

export function buildQuotaResource(): ResourceWithOptions {
  return {
    resource: QuotaUsageCounter,
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
