export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export type SendEvent = (event: string, data: unknown) => void;

export interface SseChannel {
  send: SendEvent;
  comment: (text: string) => void;
  close: () => void;
  isOpen: () => boolean;
}

export interface SseOptions {
  onOpen: (channel: SseChannel) => void;
  onClose?: () => void;
}

export function formatEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseStream(options: SseOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let open = true;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const shut = (): void => {
    if (!open) {
      return;
    }
    open = false;
    options.onClose?.();
  };

  const write = (chunk: string): void => {
    if (!open || controllerRef === null) {
      return;
    }
    try {
      controllerRef.enqueue(encoder.encode(chunk));
    } catch {
      shut();
    }
  };

  const channel: SseChannel = {
    send: (event, data) => write(formatEvent(event, data)),
    comment: (text) => write(`: ${text}\n\n`),
    isOpen: () => open,
    close: () => {
      if (!open) {
        return;
      }
      const controller = controllerRef;
      shut();
      try {
        controller?.close();
      } catch {
        return;
      }
    },
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      options.onOpen(channel);
    },
    cancel() {
      shut();
    },
  });
}
