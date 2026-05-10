/**
 * MV3 SSE implementation using fetch + ReadableStream.
 * EventSource is NOT available in ServiceWorkerGlobalScope.
 */

interface SseEvent {
  id?: string;
  event?: string;
  data: string;
}

type SseHandler = (event: SseEvent) => void;

export async function openSseStream(
  url: string,
  token: string,
  onEvent: SseHandler,
  lastEventId?: string,
): Promise<AbortController> {
  const ctrl = new AbortController();

  const headers: HeadersInit = {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`,
  };
  if (lastEventId) {
    headers['Last-Event-ID'] = lastEventId;
  }

  const resp = await fetch(url, {
    headers,
    signal: ctrl.signal,
  });

  if (!resp.ok || !resp.body) {
    throw new Error(`SSE open failed: ${resp.status}`);
  }

  const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';

  (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += value;
        let idx: number;

        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const ev = parseSseBlock(block);
          if (ev) {
            if (ev.id) {
              await chrome.storage.session.set({ lastEventId: ev.id });
            }
            onEvent(ev);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error('[SSE] stream error:', e);
      }
    }
  })();

  return ctrl;
}

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split('\n');
  let id: string | undefined;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(':')) continue; // comment

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const field = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1).trimStart();

    switch (field) {
      case 'id':
        id = value;
        break;
      case 'event':
        event = value;
        break;
      case 'data':
        dataLines.push(value);
        break;
    }
  }

  if (dataLines.length === 0) return null;

  return { id, event, data: dataLines.join('\n') };
}
