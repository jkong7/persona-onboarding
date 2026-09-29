import { describe, expect, it } from 'vitest';
import { describeState } from '../src/domain/describe.ts';
import { recordAsk, refundAsk, unansweredAsks } from '../src/domain/tools/recordAsk.ts';
import { updateProfile } from '../src/domain/tools/updateProfile.ts';
import { ctx, freshRecord, memoryService, T2 } from './helpers.ts';

describe('an ask the person never got to answer', () => {
  it('is given back', () => {
    const asked = recordAsk(freshRecord(), { field: 'helpTopic' }, ctx('voice'));
    const refunded = refundAsk(asked.record, 'helpTopic', T2);
    expect(refunded.result.refunded).toBe(true);
    expect(refunded.record.fields.helpTopic.askCount).toBe(0);
  });

  it('reopens an item that had run out of asks', () => {
    let record = freshRecord();
    record = recordAsk(record, { field: 'helpTopic' }, ctx('voice')).record;
    record = recordAsk(record, { field: 'helpTopic' }, ctx('voice')).record;
    record = recordAsk(record, { field: 'helpTopic' }, ctx('voice')).record;
    expect(describeState(record).askable).not.toContain('helpTopic');
    const refunded = refundAsk(record, 'helpTopic', T2);
    expect(refunded.record.fields.helpTopic).toMatchObject({ askCount: 1, status: 'empty' });
    expect(describeState(refunded.record).askable).toContain('helpTopic');
  });

  it('is not given back for something already known or never asked', () => {
    const known = updateProfile(freshRecord(), { updates: [{ field: 'helpTopic', value: 'taxes' }] }, ctx('text'));
    expect(refundAsk(known.record, 'helpTopic', T2).result.refunded).toBe(false);
    expect(refundAsk(freshRecord(), 'userName', T2).result.refunded).toBe(false);
  });

  it('is found from the log of the call', () => {
    const { service } = memoryService();
    const id = service.create().id;
    service.startCall(id, 'call_1');
    service.callTool(id, { name: 'record_ask', input: { field: 'userName' }, channel: 'voice' });
    service.logMessage(id, { role: 'agent', channel: 'voice', text: 'What should I call you?', callId: 'call_1' });
    service.logMessage(id, { role: 'user', channel: 'voice', text: 'Marcus', callId: 'call_1' });
    service.callTool(id, { name: 'record_ask', input: { field: 'helpTopic' }, channel: 'voice' });
    service.logMessage(id, { role: 'agent', channel: 'voice', text: 'What can I take off your plate?', callId: 'call_1' });
    expect(unansweredAsks(service.events(id), 'call_1')).toEqual(['helpTopic']);
    expect(unansweredAsks(service.events(id), 'another_call')).toEqual([]);

    service.logMessage(id, { role: 'user', channel: 'voice', text: 'my power bill', callId: 'call_1' });
    expect(unansweredAsks(service.events(id), 'call_1')).toEqual([]);
  });
});
