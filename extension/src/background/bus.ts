import { getToken } from './auth.js';
import { API_V1 as API_BASE } from './config.js';
import { bgMsgToRequest } from '../lib/api-routes';

export type BgMsg =
  | { type: 'JOB_CAPTURE'; payload: JobCapturePayload }
  | { type: 'EMAIL_CAPTURE'; payload: EmailCapturePayload }
  | { type: 'EASY_APPLY_FORM'; payload: { fields: any[] } }
  | { type: 'EASY_APPLY_SUBMITTED' }
  | { type: 'OPEN_SIDEPANEL'; payload: { route?: string } }
  | { type: 'SSE_EVENT'; payload: any }
  // Conversation
  | { type: 'CONVERSATION_CREATE'; payload: { kind: string; anchorId?: string } }
  | { type: 'CONVERSATION_GET'; payload: { conversationId: string } }
  | { type: 'CONVERSATION_CLOSE'; payload: { conversationId: string } }
  // Radar
  | { type: 'RADAR_FETCH' }
  | { type: 'RADAR_UPDATE'; payload: { id: string; status: string; note?: string } }
  // Profile
  | { type: 'PROFILE_FETCH' }
  | { type: 'MATERIALS_FETCH' }
  | { type: 'MATERIALS_CREATE'; payload: CreateMaterialPayload }
  | { type: 'MATERIALS_UPDATE'; payload: { id: string; shiningText?: string; rationale?: string; tags?: string[]; status?: string } }
  | { type: 'MATERIALS_DELETE'; payload: { id: string } }
  | { type: 'BASE_RESUMES_FETCH' }
  | { type: 'BASE_RESUMES_CREATE'; payload: { name: string; selectedMaterialIds?: string[] } }
  // Tailoring
  | { type: 'TAILORING_START'; payload: { baseResumeId: string; parsedJdId: string } }
  | { type: 'TAILORING_GET'; payload: { id: string } }
  | { type: 'TAILORING_EDIT_BULLET'; payload: { id: string; bulletId: string; text: string; kind?: string } }
  | { type: 'TAILORING_REAPPLY_MATERIAL'; payload: { id: string; bulletId: string; materialId: string } }
  | { type: 'TAILORING_EXPORT'; payload: { id: string; fmt?: string } }
  // Apply
  | { type: 'APPLY_PLAN'; payload: { radarItemId: string } }
  | { type: 'APPLY_APPROVE'; payload: { planId: string } }
  | { type: 'APPLY_RECORD'; payload: { radarItemId: string; resumeSnapshotId?: string } };

interface JobCapturePayload {
  source: string;
  sourceUrl: string;
  sourceJobId?: string;
  capturedHtml?: string;
  capturedText?: string;
}

interface EmailCapturePayload {
  subject: string;
  from: string;
  date: string;
  snippet: string;
  source: string;
}

interface CreateMaterialPayload {
  rawText?: string;
  shiningText?: string;
  rationale?: string;
  tags?: string[];
  provenanceKind: string;
}

export async function handleMessage(
  msg: BgMsg,
  sender: chrome.runtime.MessageSender,
  connectedPorts: Set<chrome.runtime.Port>,
): Promise<any> {
  switch (msg.type) {
    case 'JOB_CAPTURE':
      return handleJobCapture(msg.payload);
    case 'EMAIL_CAPTURE':
      return handleEmailCapture(msg.payload);
    case 'EASY_APPLY_FORM':
      return { received: true };
    case 'EASY_APPLY_SUBMITTED':
      connectedPorts.forEach((port) =>
        port.postMessage({ type: 'EASY_APPLY_SUBMITTED' }),
      );
      return { received: true };
    case 'OPEN_SIDEPANEL':
      if (sender.tab?.windowId) {
        await chrome.sidePanel.open({ windowId: sender.tab.windowId });
      }
      // Notify all connected sidepanel ports (e.g. the NavBus 'nav' port) to navigate.
      connectedPorts.forEach((port) => {
        port.postMessage({ type: 'NAVIGATE', route: msg.payload.route ?? '/onboarding' });
      });
      return { opened: true };

    default: {
      const route = bgMsgToRequest(msg);
      if (route) return handleApiCall(route.path, route.method, route.body);
      return { error: 'unknown message type' };
    }
  }
}

async function handleApiCall(path: string, method: string, body?: any): Promise<any> {
  const token = await getToken();
  if (!token) return { error: 'not_authenticated' };

  try {
    const resp = await fetch(`${API_BASE}/${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { error: text || `${resp.status}` };
    }
    return await resp.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function handleJobCapture(payload: JobCapturePayload) {
  const token = await getToken();
  if (!token) return { error: 'not_authenticated' };

  const idempotencyKey = await digestMessage(
    `${payload.sourceUrl}|${new Date().toISOString().slice(0, 10)}`,
  );

  try {
    const resp = await fetch(`${API_BASE}/jobs/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    return await resp.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function handleEmailCapture(payload: EmailCapturePayload) {
  const token = await getToken();
  if (!token) return { error: 'not_authenticated' };

  try {
    const resp = await fetch(`${API_BASE}/followup/emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return await resp.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function digestMessage(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}