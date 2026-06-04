import type { ResourceWithOptions } from 'adminjs';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';

export function buildSubscriptionResource(): ResourceWithOptions {
  return {
    resource: BillingSubscription,
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
            return {
              notice: {
                message: 'Not implemented in v0.1',
                type: 'info',
              },
            };
          },
          component: false,
        },
      },
    },
  };
}
