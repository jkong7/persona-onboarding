import { FIELD_LIMITS, isNameField, isProfileFieldName } from '../fields.ts';
import { historyWithCurrent, withField } from '../record.ts';
import { looksMisheard } from '../names.ts';
import { sanitizeValue } from '../sanitize.ts';
import type {
  Channel,
  FieldState,
  FieldStatus,
  OnboardingRecord,
  Outcome,
  ProfileFieldName,
  ToolContext,
} from '../types.ts';
import { isPlainObject } from './input.ts';

export type UpdateOutcome = 'recorded' | 'corrected' | 'confirmed' | 'cleared' | 'unchanged' | 'rejected';

export type UpdateRejection =
  | 'invalid_update'
  | 'unknown_field'
  | 'gmail_is_set_by_google_only'
  | 'invalid_op'
  | 'not_a_string'
  | 'empty_value'
  | 'nothing_to_confirm'
  | 'value_mismatch'
  | 'nothing_to_clear';

export interface UpdateEntryResult {
  field: string | null;
  op: string;
  outcome: UpdateOutcome;
  value: string | null;
  status: FieldStatus | null;
  needsReadBack: boolean;
  possiblyMisheard: boolean;
  truncated: boolean;
  replacedConfirmed: boolean;
  reason: UpdateRejection | null;
}

export interface UpdateProfileResult {
  tool: 'update_profile';
  ok: boolean;
  reason: 'invalid_input' | null;
  applied: UpdateEntryResult[];
  rejected: UpdateEntryResult[];
}

interface Step {
  record: OnboardingRecord;
  entry: UpdateEntryResult;
}

function reject(record: OnboardingRecord, field: string | null, op: string, reason: UpdateRejection): Step {
  return {
    record,
    entry: {
      field,
      op,
      outcome: 'rejected',
      value: null,
      status: null,
      needsReadBack: false,
      possiblyMisheard: false,
      truncated: false,
      replacedConfirmed: false,
      reason,
    },
  };
}

function accept(
  record: OnboardingRecord,
  field: ProfileFieldName,
  op: string,
  outcome: UpdateOutcome,
  extras: { truncated?: boolean; replacedConfirmed?: boolean } = {},
): Step {
  const state = record.fields[field];
  return {
    record,
    entry: {
      field,
      op,
      outcome,
      value: state.value,
      status: state.status,
      needsReadBack: state.status === 'provisional',
      possiblyMisheard:
        field === 'userName' &&
        state.status === 'provisional' &&
        state.value !== null &&
        looksMisheard(state.value),
      truncated: extras.truncated ?? false,
      replacedConfirmed: extras.replacedConfirmed ?? false,
      reason: null,
    },
  };
}

function statusFor(field: ProfileFieldName, channel: Channel): FieldStatus {
  if (channel === 'text') {
    return 'confirmed';
  }
  if (channel === 'system') {
    return 'provisional';
  }
  return isNameField(field) ? 'provisional' : 'confirmed';
}

function capitalised(name: string): string {
  if (name !== name.toLowerCase() || !/^\p{L}[\p{L}\s'’-]*$/u.test(name)) {
    return name;
  }
  return name.replace(/(^|[\s-])(\p{Ll})/gu, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

function applySet(
  record: OnboardingRecord,
  field: ProfileFieldName,
  raw: unknown,
  ctx: ToolContext,
  confirmed = false,
): Step {
  const clean = sanitizeValue(raw, FIELD_LIMITS[field]);
  if (!clean.ok) {
    return reject(record, field, 'set', clean.reason);
  }
  const current = record.fields[field];
  const typedName = ctx.channel === 'text' && isNameField(field);
  const value = typedName ? capitalised(clean.value) : clean.value;
  const heard = ctx.channel === 'voice' && isNameField(field);
  const firstHeard = heard && current.value === null;
  const doubtful = heard && field === 'userName' && looksMisheard(clean.value) && current.value !== value;
  const incoming = confirmed && !firstHeard && !doubtful ? 'confirmed' : statusFor(field, ctx.channel);
  if (current.value === value) {
    if (current.status === 'provisional' && incoming === 'confirmed') {
      const confirmed: FieldState = { ...current, status: 'confirmed', source: ctx.channel };
      return accept(withField(record, field, confirmed, ctx.now), field, 'set', 'confirmed', {
        truncated: clean.truncated,
      });
    }
    return accept(record, field, 'set', 'unchanged', { truncated: clean.truncated });
  }
  const next: FieldState = {
    ...current,
    value,
    status: incoming,
    source: ctx.channel,
    history: historyWithCurrent(current, ctx.now),
  };
  return accept(
    withField(record, field, next, ctx.now),
    field,
    'set',
    current.value === null ? 'recorded' : 'corrected',
    {
      truncated: clean.truncated,
      replacedConfirmed: current.value !== null && current.status === 'confirmed',
    },
  );
}

function applyConfirm(record: OnboardingRecord, field: ProfileFieldName, raw: unknown, ctx: ToolContext): Step {
  const current = record.fields[field];
  if (current.value === null) {
    return reject(record, field, 'confirm', 'nothing_to_confirm');
  }
  if (raw !== undefined && raw !== null) {
    const clean = sanitizeValue(raw, FIELD_LIMITS[field]);
    if (!clean.ok || clean.value !== current.value) {
      return reject(record, field, 'confirm', 'value_mismatch');
    }
  }
  if (current.status === 'confirmed') {
    return accept(record, field, 'confirm', 'unchanged');
  }
  const confirmed: FieldState = { ...current, status: 'confirmed' };
  return accept(withField(record, field, confirmed, ctx.now), field, 'confirm', 'confirmed');
}

function applyClear(record: OnboardingRecord, field: ProfileFieldName, ctx: ToolContext): Step {
  const current = record.fields[field];
  if (current.value === null) {
    return reject(record, field, 'clear', 'nothing_to_clear');
  }
  const cleared: FieldState = {
    ...current,
    value: null,
    status: 'empty',
    source: null,
    history: historyWithCurrent(current, ctx.now),
  };
  return accept(withField(record, field, cleared, ctx.now), field, 'clear', 'cleared');
}

function applyOne(record: OnboardingRecord, update: unknown, ctx: ToolContext): Step {
  if (!isPlainObject(update)) {
    return reject(record, null, 'unknown', 'invalid_update');
  }
  const field = update['field'];
  if (update['op'] === undefined && typeof update['confirmed'] === 'boolean') {
    const label = typeof field === 'string' ? field.slice(0, 64) : null;
    if (field === 'gmail') {
      return reject(record, 'gmail', 'set', 'gmail_is_set_by_google_only');
    }
    if (!isProfileFieldName(field)) {
      return reject(record, label, 'set', 'unknown_field');
    }
    const value = update['value'];
    if (value === null || (typeof value === 'string' && value.trim().length === 0)) {
      return applyClear(record, field, ctx);
    }
    return applySet(record, field, value, ctx, update['confirmed']);
  }
  const op = update['op'] === undefined ? 'set' : update['op'];
  const fieldLabel = typeof field === 'string' ? field.slice(0, 64) : null;
  const opLabel = typeof op === 'string' ? op.slice(0, 32) : 'unknown';
  if (field === 'gmail') {
    return reject(record, 'gmail', opLabel, 'gmail_is_set_by_google_only');
  }
  if (!isProfileFieldName(field)) {
    return reject(record, fieldLabel, opLabel, 'unknown_field');
  }
  if (op === 'set') {
    return applySet(record, field, update['value'], ctx);
  }
  if (op === 'confirm') {
    return applyConfirm(record, field, update['value'], ctx);
  }
  if (op === 'clear') {
    return applyClear(record, field, ctx);
  }
  return reject(record, field, opLabel, 'invalid_op');
}

export function updateProfile(
  record: OnboardingRecord,
  input: unknown,
  ctx: ToolContext,
): Outcome<UpdateProfileResult> {
  const updates = isPlainObject(input) ? input['updates'] : undefined;
  if (!Array.isArray(updates) || updates.length === 0) {
    return {
      record,
      changed: false,
      result: { tool: 'update_profile', ok: false, reason: 'invalid_input', applied: [], rejected: [] },
    };
  }
  let current = record;
  const applied: UpdateEntryResult[] = [];
  const rejected: UpdateEntryResult[] = [];
  for (const update of updates) {
    const step = applyOne(current, update, ctx);
    current = step.record;
    if (step.entry.outcome === 'rejected') {
      rejected.push(step.entry);
    } else {
      applied.push(step.entry);
    }
  }
  return {
    record: current,
    changed: current !== record,
    result: { tool: 'update_profile', ok: applied.length > 0, reason: null, applied, rejected },
  };
}
