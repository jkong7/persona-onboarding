import { ASK_BUDGET, isFieldName } from '../fields.ts';
import { asksRemaining, hasValue, isSettled, withField } from '../record.ts';
import type { FieldName, FieldState, OnboardingRecord, Outcome, ToolContext } from '../types.ts';
import { isPlainObject } from './input.ts';

export type AskRejection =
  | 'invalid_input'
  | 'unknown_field'
  | 'already_known'
  | 'deferred'
  | 'declined'
  | 'ask_budget_spent';

export interface RecordAskResult {
  tool: 'record_ask';
  ok: boolean;
  field: string | null;
  askCount: number;
  asksRemaining: number;
  lastAllowedAsk: boolean;
  reason: AskRejection | null;
}

function result(
  field: string | null,
  state: FieldState | null,
  ok: boolean,
  reason: AskRejection | null,
): RecordAskResult {
  const askCount = state?.askCount ?? 0;
  const remaining = state ? asksRemaining(state) : 0;
  return {
    tool: 'record_ask',
    ok,
    field,
    askCount,
    asksRemaining: remaining,
    lastAllowedAsk: ok && remaining === 0,
    reason,
  };
}

function patch(record: OnboardingRecord, field: FieldName, changes: Partial<FieldState>, now: string): OnboardingRecord {
  if (field === 'gmail') {
    return withField(record, 'gmail', { ...record.fields.gmail, ...changes }, now);
  }
  return withField(record, field, { ...record.fields[field], ...changes }, now);
}

export function askBlockedBy(state: FieldState): AskRejection | null {
  if (hasValue(state)) {
    return 'already_known';
  }
  if (isSettled(state)) {
    return state.status === 'declined' ? 'declined' : 'deferred';
  }
  if (state.askCount >= ASK_BUDGET) {
    return 'ask_budget_spent';
  }
  return null;
}

export function recordAsk(record: OnboardingRecord, input: unknown, ctx: ToolContext): Outcome<RecordAskResult> {
  if (!isPlainObject(input)) {
    return { record, changed: false, result: result(null, null, false, 'invalid_input') };
  }
  const field = input['field'];
  if (!isFieldName(field)) {
    const label = typeof field === 'string' ? field.slice(0, 64) : null;
    return { record, changed: false, result: result(label, null, false, 'unknown_field') };
  }
  const current = record.fields[field];
  const blocked = askBlockedBy(current);
  if (blocked === 'ask_budget_spent') {
    const next = patch(record, field, { status: 'deferred', source: 'system' }, ctx.now);
    return { record: next, changed: true, result: result(field, next.fields[field], false, blocked) };
  }
  if (blocked !== null) {
    return { record, changed: false, result: result(field, current, false, blocked) };
  }
  const next = patch(record, field, { askCount: current.askCount + 1 }, ctx.now);
  return { record: next, changed: true, result: result(field, next.fields[field], true, null) };
}
