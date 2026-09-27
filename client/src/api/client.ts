import { readEventStream } from './sse.ts';
import type {
  CallEndResponse,
  CallStartResponse,
  ClientCallEndReason,
  DeclineResponse,
  DoneEvent,
  OpenResponse,
  SampleResponse,
  Snapshot,
  UiSignal,
} from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: Record<string, unknown>;

  constructor(status: number, code: string, detail: Record<string, unknown> = {}) {
    super(`${status} ${code}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function failure(response: Response): Promise<ApiError> {
  let detail: Record<string, unknown> = {};
  try {
    const parsed: unknown = await response.json();
    if (isRecord(parsed)) {
      detail = parsed;
    }
  } catch {
    detail = {};
  }
  const code = typeof detail['error'] === 'string' ? detail['error'] : 'request_failed';
  return new ApiError(response.status, code, detail);
}

function base(id: string): string {
  return `/api/onboardings/${encodeURIComponent(id)}`;
}

async function postJson<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw await failure(response);
  }
  return (await response.json()) as T;
}

export async function createOnboarding(): Promise<Snapshot> {
  return postJson<Snapshot>('/api/onboardings');
}

export async function fetchSnapshot(id: string, signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch(base(id), signal === undefined ? {} : { signal });
  if (!response.ok) {
    throw await failure(response);
  }
  return (await response.json()) as Snapshot;
}

export async function openThread(id: string): Promise<OpenResponse> {
  return postJson<OpenResponse>(`${base(id)}/open`);
}

export async function declineCall(id: string): Promise<DeclineResponse> {
  return postJson<DeclineResponse>(`${base(id)}/call/decline`);
}

export async function requestSampleInbox(id: string): Promise<SampleResponse> {
  return postJson<SampleResponse>(`${base(id)}/gmail/sample`);
}

export async function startCall(id: string): Promise<CallStartResponse> {
  return postJson<CallStartResponse>(`${base(id)}/call/start`);
}

export async function endCall(id: string, callId: string, reason: ClientCallEndReason): Promise<CallEndResponse> {
  return postJson<CallEndResponse>(`${base(id)}/call/end`, { callId, reason });
}

export function endCallByBeacon(id: string, callId: string, reason: ClientCallEndReason): boolean {
  const url = `${base(id)}/call/end`;
  const payload = JSON.stringify({ callId, reason });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(url, payload)) {
        return true;
      }
    }
  } catch {
    return false;
  }
  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: payload,
      keepalive: true,
    });
    return true;
  } catch {
    return false;
  }
}

export async function reportHeard(id: string, callId: string, playedFraction: number): Promise<void> {
  await postJson<unknown>(`${base(id)}/call/heard`, { callId, playedFraction });
}

export async function reportSilence(id: string, callId: string): Promise<CallEndResponse> {
  return postJson<CallEndResponse>(`${base(id)}/call/silence`, { callId });
}

export async function reportTyped(id: string, callId: string, text: string): Promise<void> {
  await postJson<unknown>(`${base(id)}/call/typed`, { callId, text });
}

export interface MessageStreamHandlers {
  onDelta: (text: string) => void;
  onSignal: (signal: UiSignal) => void;
  onDone: (done: DoneEvent) => void;
}

export async function sendMessage(
  id: string,
  text: string,
  handlers: MessageStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${base(id)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ text }),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) {
    throw await failure(response);
  }
  if (response.body === null) {
    throw new ApiError(502, 'empty_stream');
  }
  let finished = false;
  await readEventStream(response.body, (event) => {
    if (event.event === 'delta' && isRecord(event.data) && typeof event.data['text'] === 'string') {
      handlers.onDelta(event.data['text']);
    } else if (event.event === 'signal' && isRecord(event.data)) {
      handlers.onSignal(event.data as unknown as UiSignal);
    } else if (event.event === 'done' && isRecord(event.data)) {
      finished = true;
      handlers.onDone(event.data as unknown as DoneEvent);
    }
  });
  if (!finished) {
    throw new ApiError(502, 'stream_ended_early');
  }
}

export function eventsUrl(id: string): string {
  return `${base(id)}/events`;
}
