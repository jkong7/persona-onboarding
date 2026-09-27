import type { CallEndReason, FieldName, ProfileFieldName } from './types.ts';

export const PROFILE_FIELD_NAMES = ['agentName', 'userName', 'helpTopic'] as const satisfies readonly ProfileFieldName[];
export const FIELD_NAMES = ['agentName', 'userName', 'helpTopic', 'gmail'] as const satisfies readonly FieldName[];

export const ASK_BUDGET = 2;
export const UNPLANNED_HANGUP_LIMIT = 2;
export const CALL_DECLINE_LIMIT = 2;
export const DEFAULT_AGENT_NAME = 'Persona';
export const SAMPLE_INBOX_LABEL = 'Sample inbox';
export const MAX_RAW_INPUT_LENGTH = 4096;
export const GMAIL_ACCOUNT_LIMIT = 254;

export const FIELD_LIMITS: Record<ProfileFieldName, number> = {
  agentName: 40,
  userName: 40,
  helpTopic: 280,
};

export const NAME_FIELDS: readonly ProfileFieldName[] = ['agentName', 'userName'];

export interface FieldMeta {
  blocks: string;
  fallback: string | null;
}

export const FIELD_META: Record<FieldName, FieldMeta> = {
  helpTopic: { blocks: 'the first task in the main experience', fallback: null },
  gmail: { blocks: 'only tasks that need email', fallback: 'sample inbox' },
  userName: { blocks: 'nothing', fallback: 'neutral address' },
  agentName: { blocks: 'nothing', fallback: DEFAULT_AGENT_NAME },
};

export const ASK_PRIORITY: readonly FieldName[] = ['helpTopic', 'userName', 'gmail', 'agentName'];

export const UNPLANNED_END_REASONS: readonly CallEndReason[] = ['user_hangup', 'tab_closed', 'network_drop'];

export function isFieldName(value: unknown): value is FieldName {
  return typeof value === 'string' && (FIELD_NAMES as readonly string[]).includes(value);
}

export function isProfileFieldName(value: unknown): value is ProfileFieldName {
  return typeof value === 'string' && (PROFILE_FIELD_NAMES as readonly string[]).includes(value);
}

export function isNameField(field: ProfileFieldName): boolean {
  return NAME_FIELDS.includes(field);
}
