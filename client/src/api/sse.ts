export interface StreamEvent {
  event: string;
  data: unknown;
}

export interface SseParser {
  push: (chunk: string) => StreamEvent[];
  flush: () => StreamEvent[];
}

function parseFrame(frame: string): StreamEvent | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.length === 0 || line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const rawValue = colon === -1 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  try {
    return { event, data: JSON.parse(dataLines.join('\n')) as unknown };
  } catch {
    return null;
  }
}

export function createSseParser(): SseParser {
  let buffer = '';

  const drain = (final: boolean): StreamEvent[] => {
    const events: StreamEvent[] = [];
    buffer = buffer.replace(/\r\n/g, '\n').replace(/\r(?!$)/g, '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const parsed = parseFrame(buffer.slice(0, boundary));
      if (parsed !== null) {
        events.push(parsed);
      }
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (final && buffer.trim().length > 0) {
      const parsed = parseFrame(buffer.replace(/\r$/, ''));
      if (parsed !== null) {
        events.push(parsed);
      }
      buffer = '';
    }
    return events;
  };

  return {
    push: (chunk) => {
      buffer += chunk;
      return drain(false);
    },
    flush: () => drain(true),
  };
}

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const parser = createSseParser();
  const decoder = new TextDecoder();
  const reader = body.getReader();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        onEvent(event);
      }
    }
    for (const event of parser.push(decoder.decode())) {
      onEvent(event);
    }
    for (const event of parser.flush()) {
      onEvent(event);
    }
  } finally {
    reader.releaseLock();
  }
}
