import type { ResourceWithOptions, ActionContext } from 'adminjs';
import type { Repository } from 'typeorm';
import { AccountPurgeSaga } from '../../database/entities/iam/account-purge-saga.entity.js';
import { AuditLog } from '../../database/entities/admin/audit-log.entity.js';
import { ulid } from 'ulid';

export function buildPurgeSagaResource(
  sagaRepo: Repository<AccountPurgeSaga>,
  auditLogRepo: Repository<AuditLog>,
): ResourceWithOptions {
  return {
    resource: AccountPurgeSaga,
    options: {
      actions: {
        new: { isVisible: false },
        edit: { isVisible: false },
        delete: { isVisible: false },
        bulkDelete: { isVisible: false },
        list: { isVisible: true },
        show: { isVisible: true },
        'retry-purge': {
          actionType: 'record',
          isVisible: true,
          label: 'Retry Purge',
          icon: 'Reset',
          handler: async (_request: unknown, _response: unknown, context: ActionContext) => {
            const record = context.record;
            if (!record) {
              return { notice: { message: 'No record found', type: 'error' } };
            }
            const saga = await sagaRepo.findOneOrFail({ where: { id: record.id() } });
            if (saga.step !== 'DEAD_LETTER') {
              return {
                notice: { message: 'Only DEAD_LETTER sagas can be reset', type: 'error' },
              };
            }
            await sagaRepo.update(saga.id, {
              step: 'INITIATED',
              expiresAt: new Date(Date.now() - 1000),
              errorMessage: null,
              deadLetterRunbookUrl: null,
            });
            await auditLogRepo.save(
              auditLogRepo.create({
                id: ulid(),
                action: 'retry-purge',
                targetId: saga.userId,
                note: `saga ${saga.id} reset`,
              }),
            );
            return { notice: { message: 'Saga reset to INITIATED', type: 'success' } };
          },
          component: false,
        },
      },
    },
  };
}
