import { endCall } from '../calls.ts';
import type { OnboardingRecord, Outcome, ToolContext } from '../types.ts';
import { isPlainObject } from './input.ts';

export type EndCallIntent = 'completed' | 'callback_later' | 'switch_to_text';

export interface EndCallResult {
  tool: 'end_call';
  ok: boolean;
  intent: EndCallIntent;
  callId: string | null;
  callbackRequested: boolean;
  reason: 'no_active_call' | null;
}

function parseIntent(input: unknown): EndCallIntent {
  const intent = isPlainObject(input) ? input['intent'] : undefined;
  if (intent === 'callback_later' || intent === 'switch_to_text') {
    return intent;
  }
  return 'completed';
}

export function endCallTool(record: OnboardingRecord, input: unknown, ctx: ToolContext): Outcome<EndCallResult> {
  const intent = parseIntent(input);
  const outcome = endCall(
    record,
    { callId: null, reason: 'agent_ended', callbackRequested: intent === 'callback_later' },
    ctx.now,
  );
  return {
    record: outcome.record,
    changed: outcome.changed,
    result: {
      tool: 'end_call',
      ok: outcome.result.ended,
      intent,
      callId: outcome.result.callId,
      callbackRequested: outcome.result.callbackRequested,
      reason: outcome.result.ended ? null : 'no_active_call',
    },
  };
}
