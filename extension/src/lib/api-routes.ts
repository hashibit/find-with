import type { BgMsg } from '../background/bus';

export interface ApiRequest {
  path: string;
  method: string;
  body?: unknown;
}

/**
 * Maps a BgMsg to a REST request descriptor.
 * Returns null for messages that require special handling (JOB_CAPTURE, EMAIL_CAPTURE, OPEN_SIDEPANEL, etc.).
 * This is the single source of truth for BgMsg → REST path mapping.
 */
export function bgMsgToRequest(msg: BgMsg): ApiRequest | null {
  switch (msg.type) {
    // Conversation
    case 'CONVERSATION_CREATE':
      return { path: 'conversations', method: 'POST', body: msg.payload };
    case 'CONVERSATION_LIST':
      return { path: 'conversations', method: 'GET' };
    case 'CONVERSATION_GET':
      return { path: `conversations/${msg.payload.conversationId}`, method: 'GET' };
    case 'CONVERSATION_CLOSE':
      return { path: `conversations/${msg.payload.conversationId}/close`, method: 'POST' };

    // Radar
    case 'RADAR_FETCH':
      return { path: 'jobs/radar', method: 'GET' };
    case 'RADAR_UPDATE':
      return { path: `jobs/${msg.payload.id}/radar`, method: 'PATCH', body: { status: msg.payload.status, note: msg.payload.note } };

    // Profile
    case 'PROFILE_FETCH':
      return { path: 'profile', method: 'GET' };
    case 'MATERIALS_FETCH':
      return { path: 'profile/materials', method: 'GET' };
    case 'MATERIALS_CREATE':
      return { path: 'profile/materials', method: 'POST', body: msg.payload };
    case 'MATERIALS_UPDATE':
      return { path: `profile/materials/${msg.payload.id}`, method: 'PATCH', body: msg.payload };
    case 'MATERIALS_DELETE':
      return { path: `profile/materials/${msg.payload.id}`, method: 'DELETE' };
    case 'BASE_RESUMES_FETCH':
      return { path: 'profile/base-resumes', method: 'GET' };
    case 'BASE_RESUMES_CREATE':
      return { path: 'profile/base-resumes', method: 'POST', body: msg.payload };

    // Tailoring
    case 'TAILORING_START':
      return { path: 'tailoring', method: 'POST', body: msg.payload };
    case 'TAILORING_GET':
      return { path: `tailoring/${msg.payload.id}`, method: 'GET' };
    case 'TAILORING_EDIT_BULLET':
      return { path: `tailoring/${msg.payload.id}/bullets/${msg.payload.bulletId}`, method: 'PATCH', body: { text: msg.payload.text, kind: msg.payload.kind } };
    case 'TAILORING_REAPPLY_MATERIAL':
      return { path: `tailoring/${msg.payload.id}/bullets/${msg.payload.bulletId}/source`, method: 'POST', body: { materialId: msg.payload.materialId } };
    case 'TAILORING_EXPORT':
      return { path: `tailoring/${msg.payload.id}/export`, method: 'GET' };

    // Apply
    case 'APPLY_PLAN':
      return { path: 'apply/plan', method: 'POST', body: msg.payload };
    case 'APPLY_APPROVE':
      return { path: `apply/plan/${msg.payload.planId}/approve`, method: 'PATCH' };
    case 'APPLY_RECORD':
      return { path: 'apply/submit', method: 'POST', body: msg.payload };

    // Jobs
    case 'JOB_ANALYZE':
      return { path: `jobs/${msg.payload.captureId}/analyze`, method: 'POST' };

    // Special-cased in bus.ts / not applicable from sidepanel
    default:
      return null;
  }
}
