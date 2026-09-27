import { describe, expect, it } from 'vitest';
import { CallEndReporter, type EndReport } from './endReporter.ts';

function reporter(): { sent: EndReport[]; instance: CallEndReporter } {
  const sent: EndReport[] = [];
  return { sent, instance: new CallEndReporter('call_1', (report) => sent.push(report)) };
}

describe('CallEndReporter', () => {
  it('sends the first report', () => {
    const { sent, instance } = reporter();
    expect(instance.done).toBe(false);
    expect(instance.report('user_hangup')).toBe(true);
    expect(sent).toEqual([{ callId: 'call_1', reason: 'user_hangup', transport: 'fetch' }]);
    expect(instance.done).toBe(true);
  });

  it('reports once when the hang up button is followed by the socket closing', () => {
    const { sent, instance } = reporter();
    instance.report('user_hangup');
    expect(instance.report('network_drop')).toBe(false);
    expect(sent.map((report) => report.reason)).toEqual(['user_hangup']);
  });

  it('reports once when the tab closes and the socket drops with it', () => {
    const { sent, instance } = reporter();
    instance.report('tab_closed', 'beacon');
    instance.report('network_drop');
    instance.report('tab_closed', 'beacon');
    expect(sent).toEqual([{ callId: 'call_1', reason: 'tab_closed', transport: 'beacon' }]);
  });

  it('reports once when the agent ends the call and the person also hangs up', () => {
    const { sent, instance } = reporter();
    instance.report('agent_ended');
    instance.report('user_hangup');
    instance.report('network_drop');
    expect(sent).toHaveLength(1);
    expect(instance.reported?.reason).toBe('agent_ended');
  });

  it('reports once when the same signal fires many times in a row', () => {
    const { sent, instance } = reporter();
    const results = Array.from({ length: 20 }, () => instance.report('network_drop'));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('still counts as reported when the sender throws', () => {
    let attempts = 0;
    const instance = new CallEndReporter('call_1', () => {
      attempts += 1;
      throw new Error('offline');
    });
    expect(instance.report('network_drop')).toBe(true);
    expect(instance.report('user_hangup')).toBe(false);
    expect(attempts).toBe(1);
  });

  it('keeps separate calls separate', () => {
    const sent: EndReport[] = [];
    const first = new CallEndReporter('call_1', (report) => sent.push(report));
    const second = new CallEndReporter('call_2', (report) => sent.push(report));
    first.report('user_hangup');
    second.report('network_drop');
    first.report('network_drop');
    expect(sent.map((report) => [report.callId, report.reason])).toEqual([
      ['call_1', 'user_hangup'],
      ['call_2', 'network_drop'],
    ]);
  });
});
