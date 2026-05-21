import { resolveApiBaseUrl } from './frontendBase';
import type { SyncProgressEvent, SyncCompleteResult } from '../api/emailAccounts';

function parseSseLines(buffer: string): { events: unknown[]; rest: string } {
  const events: unknown[] = [];
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  for (const part of parts) {
    const line = part.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      /* ignore malformed chunk */
    }
  }
  return { events, rest };
}

export async function syncAccountWithProgress(
  accountId: string,
  handlers: {
    onProgress: (event: SyncProgressEvent) => void;
    onComplete: (result: SyncCompleteResult) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const token = localStorage.getItem('token');
  const response = await fetch(
    `${resolveApiBaseUrl()}/email-accounts/${accountId}/sync`,
    {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (!response.ok) {
    let message = 'Sync fehlgeschlagen';
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      /* ignore */
    }
    handlers.onError(message);
    return;
  }

  if (!response.body) {
    handlers.onError('Keine Antwort vom Server');
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseLines(buffer);
    buffer = rest;

    for (const raw of events) {
      const data = raw as Record<string, unknown>;
      if (data.type === 'error') {
        handlers.onError(String(data.error ?? 'Sync fehlgeschlagen'));
        return;
      }
      if (data.type === 'complete') {
        handlers.onComplete(data as unknown as SyncCompleteResult);
        return;
      }
      if (typeof data.phase === 'string' && typeof data.percent === 'number') {
        handlers.onProgress(data as unknown as SyncProgressEvent);
      }
    }
  }
}
