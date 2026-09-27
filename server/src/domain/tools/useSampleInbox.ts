import { applyGmailTransition } from '../gmail.ts';
import { hasValue } from '../record.ts';
import type { GmailMode, OnboardingRecord, Outcome, ToolContext } from '../types.ts';

export interface UseSampleInboxResult {
  tool: 'use_sample_inbox';
  ok: boolean;
  connected: boolean;
  mode: GmailMode | null;
  label: string | null;
  reason: 'real_account_connected' | null;
}

export function useSampleInbox(
  record: OnboardingRecord,
  _input: unknown,
  ctx: ToolContext,
): Outcome<UseSampleInboxResult> {
  const gmail = record.fields.gmail;
  if (hasValue(gmail) && gmail.mode === 'real') {
    return {
      record,
      changed: false,
      result: {
        tool: 'use_sample_inbox',
        ok: false,
        connected: true,
        mode: 'real',
        label: null,
        reason: 'real_account_connected',
      },
    };
  }
  if (hasValue(gmail) && gmail.mode === 'sample') {
    return {
      record,
      changed: false,
      result: {
        tool: 'use_sample_inbox',
        ok: true,
        connected: true,
        mode: 'sample',
        label: gmail.value,
        reason: null,
      },
    };
  }
  const outcome = applyGmailTransition(record, { type: 'connected', mode: 'sample' }, ctx.now);
  return {
    record: outcome.record,
    changed: outcome.changed,
    result: {
      tool: 'use_sample_inbox',
      ok: true,
      connected: true,
      mode: 'sample',
      label: outcome.result.account,
      reason: null,
    },
  };
}
