import type { ResourceWithOptions } from 'adminjs';
import { IamWebhookEvent } from '../../database/entities/iam/webhook-event.entity.js';

export function buildWebhookEventResource(): ResourceWithOptions {
  return {
    resource: IamWebhookEvent,
    options: {
      actions: {
        new: { isVisible: false },
        edit: { isVisible: false },
        delete: { isVisible: false },
        bulkDelete: { isVisible: false },
        list: { isVisible: true },
        show: { isVisible: true },
        'replay-webhook': {
          actionType: 'record',
          isVisible: true,
          label: 'Replay Webhook',
          icon: 'Refresh',
          handler: async (_request: unknown, _response: unknown, _context: unknown) => {
            return {
              notice: {
                message: 'Not implemented - add InfraService.replayWebhook in follow-up PR',
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
