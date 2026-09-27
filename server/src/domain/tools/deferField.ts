import { isFieldName } from '../fields.ts';
import { hasValue, withField } from '../record.ts';
import type { FieldName, FieldStatus, OnboardingRecord, Outcome, ToolContext } from '../types.ts';
import { isPlainObject } from './input.ts';

export type DeferKind = 'deferred' | 'declined';
export type DeferRejection = 'invalid_input' | 'unknown_field' | 'invalid_kind' | 'already_has_value';

export interface DeferFieldResult {
  tool: 'defer_field';
  ok: boolean;
  field: string | null;
  status: FieldStatus | null;
  mayAskAgain: boolean;
  reason: DeferRejection | null;
}

function rejected(record: OnboardingRecord, field: string | null, reason: DeferRejection): Outcome<DeferFieldResult> {
  return {
    record,
    changed: false,
    result: { tool: 'defer_field', ok: false, field, status: null, mayAskAgain: false, reason },
  };
}

function isDeferKind(value: unknown): value is DeferKind {
  return value === 'deferred' || value === 'declined';
}

function settle(record: OnboardingRecord, field: FieldName, kind: DeferKind, ctx: ToolContext): OnboardingRecord {
  if (field === 'gmail') {
    return withField(record, 'gmail', { ...record.fields.gmail, status: kind, source: ctx.channel }, ctx.now);
  }
  return withField(record, field, { ...record.fields[field], status: kind, source: ctx.channel }, ctx.now);
}

export function deferField(record: OnboardingRecord, input: unknown, ctx: ToolContext): Outcome<DeferFieldResult> {
  if (!isPlainObject(input)) {
    return rejected(record, null, 'invalid_input');
  }
  const field = input['field'];
  const kind = input['kind'] === undefined ? 'deferred' : input['kind'];
  if (!isFieldName(field)) {
    return rejected(record, typeof field === 'string' ? field.slice(0, 64) : null, 'unknown_field');
  }
  if (!isDeferKind(kind)) {
    return rejected(record, field, 'invalid_kind');
  }
  const current = record.fields[field];
  if (hasValue(current)) {
    return rejected(record, field, 'already_has_value');
  }
  if (current.status === kind) {
    return {
      record,
      changed: false,
      result: { tool: 'defer_field', ok: true, field, status: kind, mayAskAgain: false, reason: null },
    };
  }
  return {
    record: settle(record, field, kind, ctx),
    changed: true,
    result: { tool: 'defer_field', ok: true, field, status: kind, mayAskAgain: false, reason: null },
  };
}
