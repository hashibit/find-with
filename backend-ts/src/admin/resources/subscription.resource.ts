import type { ResourceWithOptions } from 'adminjs';
import type { Repository } from 'typeorm';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { wrapRepo } from '../repository-resource.js';

export function buildSubscriptionResource(repo: Repository<BillingSubscription>): ResourceWithOptions {
  return {
    resource: wrapRepo(BillingSubscription, repo),
    options: {
      actions: {
        new: { isVisible: false },
        edit: { isVisible: false },
        delete: { isVisible: false },
        bulkDelete: { isVisible: false },
        list: { isVisible: true },
        show: { isVisible: true },
        'force-dormant': {
          actionType: 'record',
          isVisible: true,
          label: 'Force Dormant',
          icon: 'Pause',
          handler: async (_request: unknown, _response: unknown, _context: unknown) => {
            return { notice: { message: 'Not implemented in v0.1', type: 'info' } };
          },
          component: false,
        },
      },
    },
  };
}
