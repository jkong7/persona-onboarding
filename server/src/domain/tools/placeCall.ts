import { mayOfferCall, ringCall, type RingRejection } from '../calls.ts';
import type { OnboardingRecord, Outcome, ToolContext } from '../types.ts';
import { isPlainObject } from './input.ts';

export interface PlaceCallResult {
  tool: 'place_call';
  ok: boolean;
  ringing: boolean;
  userRequested: boolean;
  mayOfferAgain: boolean;
  reason: RingRejection | null;
}

export function placeCall(record: OnboardingRecord, input: unknown, ctx: ToolContext): Outcome<PlaceCallResult> {
  const userRequested = isPlainObject(input) && input['userRequested'] === true;
  const outcome = ringCall(record, userRequested, ctx.now);
  return {
    record: outcome.record,
    changed: outcome.changed,
    result: {
      tool: 'place_call',
      ok: outcome.changed,
      ringing: outcome.result.ringing,
      userRequested,
      mayOfferAgain: mayOfferCall(outcome.record),
      reason: outcome.result.reason,
    },
  };
}
