import { describe, expect, it } from 'vitest';
import { entry } from '../test/factory.ts';
import {
  agentRepliedAfter,
  buildThread,
  callHeader,
  clock,
  durationLabel,
  unconfirmedPending,
  type CallBlockItem,
} from './thread.ts';

function calls(items: ReturnType<typeof buildThread>): CallBlockItem[] {
  return items.filter((item): item is CallBlockItem => item.kind === 'call');
}

describe('buildThread', () => {
  it('renders texts as bubbles and splits agent text on blank lines', () => {
    const items = buildThread([entry(1, 'agent', 'Hi.\n\nWhat should I call you?'), entry(2, 'user', 'Max')], null);
    expect(items.map((item) => (item.kind === 'bubble' ? [item.role, item.text] : item.kind))).toEqual([
      ['agent', 'Hi.'],
      ['agent', 'What should I call you?'],
      ['user', 'Max'],
    ]);
  });

  it('never splits what the person typed', () => {
    const items = buildThread([entry(1, 'user', 'line one\n\nline two')], null);
    expect(items).toHaveLength(1);
  });

  it('marks the last bubble of each run', () => {
    const items = buildThread(
      [entry(1, 'agent', 'a\n\nb'), entry(2, 'user', 'c'), entry(3, 'agent', 'd')],
      null,
    );
    expect(items.map((item) => (item.kind === 'bubble' ? item.lastOfGroup : null))).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it('groups the messages of one call into one block', () => {
    const items = buildThread(
      [
        entry(1, 'agent', 'Calling you now.'),
        entry(2, 'agent', 'Hey, it is Max.', { channel: 'voice', callId: 'call_1' }),
        entry(3, 'user', 'I am Jonathan', { channel: 'voice', callId: 'call_1' }),
        entry(4, 'agent', 'Jonathan, got it.', { channel: 'voice', callId: 'call_1' }),
        entry(5, 'agent', 'Looks like we got cut off.'),
      ],
      null,
    );
    expect(items.map((item) => item.kind)).toEqual(['bubble', 'call', 'bubble']);
    const [block] = calls(items);
    expect(block?.lines.map((line) => line.text)).toEqual(['Hey, it is Max.', 'I am Jonathan', 'Jonathan, got it.']);
    expect(block?.live).toBe(false);
  });

  it('keeps two calls apart even when they are adjacent', () => {
    const items = buildThread(
      [
        entry(1, 'agent', 'one', { channel: 'voice', callId: 'call_1' }),
        entry(2, 'agent', 'two', { channel: 'voice', callId: 'call_2' }),
      ],
      'call_2',
    );
    const blocks = calls(items);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.live)).toEqual([false, true]);
  });

  it('keeps text typed during a call inside the call block and labels it', () => {
    const items = buildThread(
      [
        entry(1, 'agent', 'What is your name?', { channel: 'voice', callId: 'call_1' }),
        entry(2, 'user', 'Jonathan', { channel: 'text', callId: 'call_1' }),
      ],
      null,
    );
    const [block] = calls(items);
    expect(items).toHaveLength(1);
    expect(block?.lines[1]).toMatchObject({ text: 'Jonathan', typed: true });
  });

  it('shows only what was heard of an interrupted line', () => {
    const items = buildThread(
      [
        entry(1, 'agent', 'I can read your mail', {
          channel: 'voice',
          callId: 'call_1',
          fullText: 'I can read your mail and draft replies. What is your name?',
          interrupted: true,
        }),
      ],
      null,
    );
    const [block] = calls(items);
    expect(block?.lines[0]).toMatchObject({ text: 'I can read your mail', interrupted: true });
  });

  it('measures the length of a call from its first to its last line', () => {
    const items = buildThread(
      [
        entry(0, 'agent', 'start', { channel: 'voice', callId: 'call_1' }),
        entry(59, 'user', 'end', { channel: 'voice', callId: 'call_1', createdAt: '2026-09-27T18:02:10.000Z' }),
      ],
      null,
    );
    const [block] = calls(items);
    expect(block).toBeDefined();
    expect(callHeader(block as CallBlockItem)).toBe('Call, 2 min');
  });
});

describe('labels', () => {
  it('describes short and long calls', () => {
    expect(durationLabel(0)).toBe('under a minute');
    expect(durationLabel(59_000)).toBe('under a minute');
    expect(durationLabel(61_000)).toBe('1 min');
    expect(durationLabel(150_000)).toBe('3 min');
  });

  it('formats the call timer', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65.9)).toBe('1:05');
    expect(clock(-4)).toBe('0:00');
  });
});

describe('unconfirmedPending', () => {
  const pending = [
    { localId: 'a', text: 'hello', baseSeq: 4 },
    { localId: 'b', text: 'hello', baseSeq: 4 },
    { localId: 'c', text: 'other', baseSeq: 4 },
  ];

  it('keeps everything the server has not logged yet', () => {
    expect(unconfirmedPending(pending, [entry(3, 'user', 'hello')]).map((item) => item.localId)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('matches each logged message to one pending message only', () => {
    expect(unconfirmedPending(pending, [entry(5, 'user', 'hello')]).map((item) => item.localId)).toEqual(['b', 'c']);
    expect(
      unconfirmedPending(pending, [entry(5, 'user', 'hello'), entry(7, 'user', ' hello ')]).map(
        (item) => item.localId,
      ),
    ).toEqual(['c']);
  });

  it('ignores agent messages with the same words', () => {
    expect(unconfirmedPending(pending, [entry(5, 'agent', 'hello')])).toHaveLength(3);
  });
});

describe('agentRepliedAfter', () => {
  it('is true only for a later agent text', () => {
    const transcript = [entry(2, 'agent', 'before'), entry(5, 'user', 'x'), entry(6, 'agent', 'after')];
    expect(agentRepliedAfter(transcript, 4)).toBe(true);
    expect(agentRepliedAfter(transcript, 6)).toBe(false);
    expect(agentRepliedAfter([entry(9, 'agent', 'spoken', { channel: 'voice', callId: 'c' })], 4)).toBe(false);
  });
});
