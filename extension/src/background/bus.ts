export type BgMsg =
  | { type: 'JOB_CAPTURE'; payload: any }
  | { type: 'EMAIL_CAPTURE'; payload: any }
  | { type: 'EASY_APPLY_FORM'; payload: { fields: any[] } }
  | { type: 'OPEN_SIDEPANEL'; payload: { route?: string } }
  | { type: 'SSE_EVENT'; payload: any };

export async function handleMessage(msg: BgMsg, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (msg.type) {
    case 'JOB_CAPTURE':
      return handleJobCapture(msg.payload);
    case 'EMAIL_CAPTURE':
      return handleEmailCapture(msg.payload);
    case 'EASY_APPLY_FORM':
      return { received: true };
    case 'OPEN_SIDEPANEL':
      if (sender.tab?.windowId) {
        await chrome.sidePanel.open({ windowId: sender.tab.windowId });
      }
      return { opened: true };
    default:
      return { error: 'unknown message type' };
  }
}

async function handleJobCapture(payload: any) {
  const { getToken } = await import('./auth');
  const token = await getToken();
  if (!token) return { error: 'not_authenticated' };

  const idempotencyKey = await digestMessage(`${payload.source_url}|${new Date().toISOString().slice(0, 10)}`);

  try {
    const resp = await fetch('http://localhost:8000/v1/jobs/captures', {
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

async function handleEmailCapture(payload: any) {
  const { getToken } = await import('./auth');
  const token = await getToken();
  if (!token) return { error: 'not_authenticated' };

  try {
    const resp = await fetch('http://localhost:8000/v1/followup/emails', {
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
