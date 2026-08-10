import { getToken } from './auth.js';
import { API_V1 as API_BASE } from './config.js';
import { bgMsgToRequest } from '../lib/api-routes';

export type BgMsg =
  | { type: 'JOB_CAPTURE'; payload: JobCapturePayload }
  | { type: 'EMAIL_CAPTURE'; payload: EmailCapturePayload }
  | { type: 'EASY_APPLY_FORM'; payload: { fields: any[] } }
  | { type: 'EASY_APPLY_SUBMITTED' }
  | { type: 'EASY_APPLY_START_FILL'; payload: { planId: string; fields: Array<{ label: string; value: string }> } }
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
  | { type: 'APPLY_RECORD'; payload: { radarItemId: string; resumeSnapshotId?: string } }
  // Deep analysis on demand
  | { type: 'JOB_ANALYZE'; payload: { captureId: string } };

/** Messages from the website (extension-callback) to the extension via chrome.runtime.onMessageExternal */
export type ExternalMsg =
  | { type: 'AUTH_NONCE'; nonce: string }
  | { type: 'AUTH_SESSION_TOKEN'; sessionToken: string; expires_at: number; user_id: string }
  | { type: 'ENTITLEMENTS_INVALIDATE' };

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

// Track the tab ID where LinkedIn Easy Apply is open
let easyApplyTabId: number | null = null;

export async function handleMessage(
  msg: BgMsg,
  sender: chrome.runtime.MessageSender,
  navPorts: Set<chrome.runtime.Port>,
): Promise<any> {
  switch (msg.type) {
    case 'JOB_CAPTURE': {
      const captureResult = await handleJobCapture(msg.payload);
      if (!captureResult.error && captureResult.quickMatch) {
        const ambientText = formatAmbientMessage(
          captureResult.capture?.capturedText ?? '',
          captureResult.quickMatch,
        );
        navPorts.forEach((port) =>
          port.postMessage({
            type: 'QUINN_AMBIENT_MESSAGE',
            text: ambientText,
            captureId: captureResult.capture?.id,
          }),
        );
      }
      return captureResult;
    }
    case 'EMAIL_CAPTURE':
      return handleEmailCapture(msg.payload);
    case 'EASY_APPLY_FORM':
      // Remember which tab has the Easy Apply modal open
      if (sender.tab?.id) easyApplyTabId = sender.tab.id;
      return { received: true };
    case 'EASY_APPLY_START_FILL':
      // Forward fill instructions to the content script in the LinkedIn tab
      if (easyApplyTabId !== null) {
        try {
          await chrome.tabs.sendMessage(easyApplyTabId, {
            type: 'EASY_APPLY_FILL',
            payload: msg.payload,
          });
        } catch (e) {
          return { error: 'could not reach content script: ' + String(e) };
        }
      }
      return { sent: true };
    case 'EASY_APPLY_SUBMITTED':
      easyApplyTabId = null;
      navPorts.forEach((port) =>
        port.postMessage({ type: 'EASY_APPLY_SUBMITTED' }),
      );
      return { received: true };
    case 'OPEN_SIDEPANEL':
      if (sender.tab?.windowId) {
        await chrome.sidePanel.open({ windowId: sender.tab.windowId });
      }
      // Notify all connected sidepanel ports to navigate.
      navPorts.forEach((port) => {
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

interface QuickMatch {
  score: number;
  matchedSkills: string[];
  missingKeywords: string[];
}

function formatAmbientMessage(capturedText: string, qm: QuickMatch): string {
  // capturedText format: "Title — Company\n\nDescription..."
  const firstLine = capturedText.split('\n')[0] ?? '';
  const dashIdx = firstLine.indexOf(' — ');
  const title = dashIdx >= 0 ? firstLine.slice(0, dashIdx).trim() : firstLine.trim();
  const company = dashIdx >= 0 ? firstLine.slice(dashIdx + 3).trim() : '';

  const jobLabel = [title, company].filter(Boolean).join(' @ ') || '这个岗位';

  let text = `看到你在看 ${jobLabel}。`;
  text += `\n\n粗略扫了一眼 JD，和你背景大概有 ${qm.score}% 的关键词重叠`;
  if (qm.matchedSkills.length) {
    text += `——${qm.matchedSkills.join('、')} 都能对上`;
  }
  text += '。';
  if (qm.missingKeywords.length) {
    text += ` JD 里提到了 ${qm.missingKeywords.join('、')}，你档案里没有这几个词。`;
  }
  text += '\n\n要我做深度分析吗？（完整解析 JD、研究公司背景、算三层匹配度）';
  return text;
}