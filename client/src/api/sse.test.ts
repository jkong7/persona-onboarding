import { describe, expect, it } from 'vitest';
import { createSseParser, readEventStream, type StreamEvent } from './sse.ts';

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe('createSseParser', () => {
  it('parses whole frames', () => {
    const parser = createSseParser();
    const events = parser.push(frame('delta', { text: 'Hi' }) + frame('done', { text: 'Hi', ending: 'completed' }));
    expect(events).toEqual([
      { event: 'delta', data: { text: 'Hi' } },
      { event: 'done', data: { text: 'Hi', ending: 'completed' } },
    ]);
  });

  it('waits for the rest of a frame split across chunks', () => {
    const parser = createSseParser();
    const whole = frame('delta', { text: 'Max it is.' });
    expect(parser.push(whole.slice(0, 9))).toEqual([]);
    expect(parser.push(whole.slice(9, 25))).toEqual([]);
    expect(parser.push(whole.slice(25))).toEqual([{ event: 'delta', data: { text: 'Max it is.' } }]);
  });

  it('handles a chunk that ends between the two line breaks', () => {
    const parser = createSseParser();
    expect(parser.push('event: delta\ndata: {"text":"a"}\n')).toEqual([]);
    expect(parser.push('\nevent: delta\ndata: {"text":"b"}\n\n')).toEqual([
      { event: 'delta', data: { text: 'a' } },
      { event: 'delta', data: { text: 'b' } },
    ]);
  });

  it('ignores heartbeat comments and broken data', () => {
    const parser = createSseParser();
    expect(parser.push(': heartbeat\n\n')).toEqual([]);
    expect(parser.push('event: delta\ndata: {not json\n\n')).toEqual([]);
    expect(parser.push(frame('signal', { type: 'ring' }))).toEqual([{ event: 'signal', data: { type: 'ring' } }]);
  });

  it('keeps blank lines that are part of the text', () => {
    const parser = createSseParser();
    const events = parser.push(frame('delta', { text: 'one\n\ntwo' }));
    expect(events).toEqual([{ event: 'delta', data: { text: 'one\n\ntwo' } }]);
  });

  it('accepts windows line endings and unnamed events', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"ok":true}\r\n\r\n')).toEqual([{ event: 'message', data: { ok: true } }]);
  });

  it('returns a last frame that was never terminated', () => {
    const parser = createSseParser();
    expect(parser.push('event: done\ndata: {"text":"x"}')).toEqual([]);
    expect(parser.flush()).toEqual([{ event: 'done', data: { text: 'x' } }]);
    expect(parser.flush()).toEqual([]);
  });
});

describe('readEventStream', () => {
  it('reads events from a byte stream, including split characters', async () => {
    const bytes = new TextEncoder().encode(frame('delta', { text: 'café' }) + frame('done', { text: 'café' }));
    const cut = bytes.indexOf(0xc3) + 1;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut));
        controller.close();
      },
    });
    const seen: StreamEvent[] = [];
    await readEventStream(body, (event) => seen.push(event));
    expect(seen).toEqual([
      { event: 'delta', data: { text: 'café' } },
      { event: 'done', data: { text: 'café' } },
    ]);
  });
});
