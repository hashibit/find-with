import type { ResourceWithOptions } from 'adminjs';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';

export function buildUserResource(): ResourceWithOptions {
  return {
    resource: IamUser,
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
        clerkUserId: { isVisible: { list: true, show: true, edit: false, filter: true } },
        email: { isVisible: { list: true, show: true, edit: false, filter: true } },
        fullName: { isVisible: { list: true, show: true, edit: false, filter: false } },
        isActive: { isVisible: { list: true, show: true, edit: false, filter: true } },
        deletedAt: { isVisible: { list: true, show: true, edit: false, filter: false } },
        createdAt: { isVisible: { list: true, show: true, edit: false, filter: false } },
        updatedAt: { isVisible: { list: false, show: true, edit: false, filter: false } },
      },
    },
  };
}
