import { describe, expect, it } from 'vitest';
import { resolveHeard, truncateToFraction } from '../src/domain/heard.ts';
import { EventTargetError } from '../src/store/errors.ts';
import { memoryService } from './helpers.ts';

describe('event log', () => {
  it('returns events in the order they were appended', () => {
    const { service } = memoryService();
    const { id } = service.create();

    service.logMessage(id, { role: 'agent', channel: 'text', text: 'What should I go by?' });
    service.logMessage(id, { role: 'user', channel: 'text', text: 'Moss' });
    service.callTool(id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', value: 'Moss' }] },
      channel: 'text',
    });
    service.startCall(id, 'call_1');
    service.logMessage(id, { role: 'agent', channel: 'voice', text: 'Moss here. Who is this?', callId: 'call_1' });
    service.callTool(id, { name: 'offer_gmail_connect', input: {}, channel: 'voice' });
    service.applyGmail(id, { type: 'failed', reason: 'popup_closed' });
    service.applyGmail(id, { type: 'connected', mode: 'sample' });
    service.endCall(id, { callId: 'call_1', reason: 'user_hangup' });

    const events = service.events(id);
    const seqs = events.map((stored) => stored.seq);
    const stamps = events.map((stored) => stored.createdAt);

    expect(events.map((stored) => stored.event.type)).toEqual([
      'message',
      'message',
      'tool_call',
      'call_started',
      'message',
      'tool_call',
      'oauth',
      'oauth',
      'oauth',
      'call_ended',
    ]);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    expect(stamps).toEqual([...stamps].sort());
  });

  it('keeps each onboarding separate and supports reading after a sequence number', () => {
    const { service } = memoryService();
    const a = service.create();
    const b = service.create();

    const first = service.logMessage(a.id, { role: 'user', channel: 'text', text: 'one' });
    service.logMessage(b.id, { role: 'user', channel: 'text', text: 'other' });
    service.logMessage(a.id, { role: 'user', channel: 'text', text: 'two' });

    expect(service.transcript(a.id).map((entry) => entry.text)).toEqual(['one', 'two']);
    expect(service.transcript(b.id).map((entry) => entry.text)).toEqual(['other']);
    expect(service.events(a.id, first.seq).map((stored) => stored.seq)).toHaveLength(1);
  });

  it('records tool calls with their input, result and resulting version', () => {
    const { service } = memoryService();
    const { id } = service.create();
    const input = { updates: [{ field: 'userName', value: 'Jon' }] };
    const committed = service.callTool(id, { name: 'update_profile', input, channel: 'voice' });
    const stored = service.events(id)[0];

    expect(stored?.event).toEqual({
      type: 'tool_call',
      name: 'update_profile',
      channel: 'voice',
      input,
      result: committed.result,
      changed: true,
      recordVersion: 2,
    });
  });

  it('records why each call ended', () => {
    const { service } = memoryService();
    const { id } = service.create();

    service.startCall(id, 'call_1');
    service.endCall(id, { callId: 'call_1', reason: 'tab_closed' });
    service.endCall(id, { callId: 'call_1', reason: 'network_drop' });
    service.startCall(id, 'call_2');
    service.callTool(id, { name: 'end_call', input: { intent: 'callback_later' }, channel: 'voice' });
    service.endCall(id, { callId: 'call_2', reason: 'agent_ended' });

    const ended = service
      .events(id)
      .map((stored) => stored.event)
      .filter((event) => event.type === 'call_ended');

    expect(ended).toEqual([
      { type: 'call_ended', callId: 'call_1', reason: 'tab_closed', unplanned: true, callbackRequested: false },
      { type: 'call_ended', callId: 'call_2', reason: 'agent_ended', unplanned: false, callbackRequested: true },
    ]);
    expect(service.get(id).calls.unplannedHangups).toBe(1);
  });

  it('closes a superseded call in the log before starting the new one', () => {
    const { service } = memoryService();
    const { id } = service.create();

    service.startCall(id, 'call_1');
    service.startCall(id, 'call_2');

    expect(service.events(id).map((stored) => stored.event)).toEqual([
      { type: 'call_started', callId: 'call_1', callNumber: 1, supersededCallId: null },
      { type: 'call_ended', callId: 'call_1', reason: 'network_drop', unplanned: true, callbackRequested: false },
      { type: 'call_started', callId: 'call_2', callNumber: 2, supersededCallId: 'call_1' },
    ]);
  });

  it('refuses to update or delete events', () => {
    const { db, service } = memoryService();
    const { id } = service.create();
    service.logMessage(id, { role: 'user', channel: 'text', text: 'hello' });

    expect(() => db.exec("UPDATE events SET payload = '{}'")).toThrow(/append-only/);
    expect(() => db.exec('DELETE FROM events')).toThrow(/append-only/);
    expect(service.transcript(id).map((entry) => entry.text)).toEqual(['hello']);
  });
});

describe('heard portion of agent speech', () => {
  it('cuts agent speech at the last whole word the user heard', () => {
    const text = 'Got it. And what is on your plate this week?';

    expect(truncateToFraction(text, 1)).toBe(text);
    expect(truncateToFraction(text, 0)).toBe('');
    expect(truncateToFraction(text, 0.5)).toBe('Got it. And what is on');
    expect(truncateToFraction(text, 0.2)).toBe('Got it.');
    expect(truncateToFraction(text, 0.05)).toBe('');
    expect(truncateToFraction(text, 7)).toBe(text);
    expect(truncateToFraction(text, Number.NaN)).toBe(text);
  });

  it('prefers the heard text a voice vendor reports', () => {
    const text = 'Got it. And what is on your plate this week?';

    expect(resolveHeard({ text, heardText: 'Got it. And what' })).toBe('Got it. And what');
    expect(resolveHeard({ text, playedFraction: 0.2 })).toBe('Got it.');
    expect(resolveHeard({ text })).toBe(text);
    expect(resolveHeard({ text: 'Hi', heardText: 'Hi there, a much longer string' })).toBe('Hi');
  });

  it('stores what was heard when the message is logged after an interruption', () => {
    const { service } = memoryService();
    const { id } = service.create();

    service.logMessage(id, {
      role: 'agent',
      channel: 'voice',
      text: 'Nice to meet you. Can I connect to your Gmail so I can find that invoice?',
      heardText: 'Nice to meet you. Can I',
      callId: 'call_1',
    });
    const entry = service.transcript(id)[0];

    expect(entry).toMatchObject({
      role: 'agent',
      text: 'Nice to meet you. Can I',
      fullText: 'Nice to meet you. Can I connect to your Gmail so I can find that invoice?',
      interrupted: true,
    });
  });

  it('applies a later truncation without rewriting the original event', () => {
    const { service } = memoryService();
    const { id } = service.create();
    const full = 'Nice to meet you. Can I connect to your Gmail so I can find that invoice?';

    const spoken = service.logMessage(id, { role: 'agent', channel: 'voice', text: full, callId: 'call_1' });
    expect(service.transcript(id)[0]).toMatchObject({ text: full, interrupted: false });

    service.markHeard(id, { messageSeq: spoken.seq, playedFraction: 0.25 });
    const events = service.events(id);

    expect(events.map((stored) => stored.event.type)).toEqual(['message', 'message_heard']);
    expect(events[0]?.event).toMatchObject({ text: full, heard: null });
    expect(service.transcript(id)).toHaveLength(1);
    expect(service.transcript(id)[0]).toMatchObject({
      text: 'Nice to meet you.',
      fullText: full,
      interrupted: true,
    });
  });

  it('uses the latest truncation when more than one arrives', () => {
    const { service } = memoryService();
    const { id } = service.create();
    const spoken = service.logMessage(id, { role: 'agent', channel: 'voice', text: 'One two three four five' });

    service.markHeard(id, { messageSeq: spoken.seq, heardText: 'One two three' });
    service.markHeard(id, { messageSeq: spoken.seq, heardText: 'One two' });

    expect(service.transcript(id)[0]?.text).toBe('One two');
  });

  it('records a message the user never heard as empty', () => {
    const { service } = memoryService();
    const { id } = service.create();
    service.logMessage(id, { role: 'agent', channel: 'voice', text: 'What is your name?', playedFraction: 0 });

    expect(service.transcript(id)[0]).toMatchObject({ text: '', interrupted: true });
  });

  it('never truncates what the user said', () => {
    const { service } = memoryService();
    const { id } = service.create();
    const said = service.logMessage(id, {
      role: 'user',
      channel: 'voice',
      text: 'My name is Jon',
      heardText: 'My name',
    });

    expect(service.transcript(id)[0]).toMatchObject({ text: 'My name is Jon', interrupted: false });
    expect(() => service.markHeard(id, { messageSeq: said.seq, heardText: 'My' })).toThrow(EventTargetError);
    expect(() => service.markHeard(id, { messageSeq: 9999, heardText: 'My' })).toThrow(EventTargetError);
  });
});
