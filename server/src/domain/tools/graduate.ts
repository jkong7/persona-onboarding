import { FIELD_META, FIELD_NAMES } from '../fields.ts';
import { hasValue } from '../record.ts';
import type { FieldName, FieldStatus, OnboardingRecord, Outcome, Phase, ToolContext } from '../types.ts';
import { isPlainObject } from './input.ts';

export interface OutstandingField {
  field: FieldName;
  status: FieldStatus;
  blocks: string;
  fallback: string | null;
}

export interface GraduateResult {
  tool: 'graduate';
  ok: boolean;
  phase: Phase;
  alreadyGraduated: boolean;
  grantedBy: 'help_topic' | 'skip_request' | null;
  outstanding: OutstandingField[];
  unconfirmed: FieldName[];
  reason: 'help_topic_missing' | null;
}

export function outstandingFields(record: OnboardingRecord): OutstandingField[] {
  return FIELD_NAMES.filter((field) => !hasValue(record.fields[field])).map((field) => ({
    field,
    status: record.fields[field].status,
    blocks: FIELD_META[field].blocks,
    fallback: FIELD_META[field].fallback,
  }));
}

export function unconfirmedFields(record: OnboardingRecord): FieldName[] {
  return FIELD_NAMES.filter((field) => record.fields[field].status === 'provisional');
}

export function graduationGrant(
  record: OnboardingRecord,
  skipRequested: boolean,
): 'help_topic' | 'skip_request' | null {
  if (hasValue(record.fields.helpTopic)) {
    return 'help_topic';
  }
  if (skipRequested || record.skipRequested) {
    return 'skip_request';
  }
  return null;
}

export function graduate(record: OnboardingRecord, input: unknown, ctx: ToolContext): Outcome<GraduateResult> {
  const skipRequested = isPlainObject(input) && input['userRequestedSkip'] === true;
  const grant = graduationGrant(record, skipRequested);
  const base = {
    tool: 'graduate' as const,
    outstanding: outstandingFields(record),
    unconfirmed: unconfirmedFields(record),
  };
  if (record.phase === 'graduated') {
    return {
      record,
      changed: false,
      result: { ...base, ok: true, phase: 'graduated', alreadyGraduated: true, grantedBy: grant, reason: null },
    };
  }
  if (grant === null) {
    return {
      record,
      changed: false,
      result: {
        ...base,
        ok: false,
        phase: record.phase,
        alreadyGraduated: false,
        grantedBy: null,
        reason: 'help_topic_missing',
      },
    };
  }
  const next: OnboardingRecord = {
    ...record,
    phase: 'graduated',
    skipRequested: record.skipRequested || skipRequested,
    graduatedAt: ctx.now,
    updatedAt: ctx.now,
  };
  return {
    record: next,
    changed: true,
    result: { ...base, ok: true, phase: 'graduated', alreadyGraduated: false, grantedBy: grant, reason: null },
  };
}
