export type ProfileFieldName = 'agentName' | 'userName' | 'helpTopic';
export type FieldName = ProfileFieldName | 'gmail';

export type FieldStatus = 'empty' | 'provisional' | 'confirmed' | 'deferred' | 'declined';
export type Channel = 'voice' | 'text' | 'system';
export type Phase = 'onboarding' | 'graduated';

export type GmailMode = 'real' | 'sample';
export type GmailFailureReason =
  | 'popup_closed'
  | 'popup_blocked'
  | 'access_denied'
  | 'not_allowlisted'
  | 'scope_missing'
  | 'exchange_failed';

export type CallEndReason =
  | 'user_hangup'
  | 'tab_closed'
  | 'network_drop'
  | 'silence_timeout'
  | 'agent_ended';

export interface FieldHistoryEntry {
  value: string;
  status: FieldStatus;
  source: Channel | null;
  replacedAt: string;
}

export interface FieldState {
  value: string | null;
  status: FieldStatus;
  source: Channel | null;
  askCount: number;
  history: FieldHistoryEntry[];
  updatedAt: string | null;
}

export interface GmailFieldState extends FieldState {
  mode: GmailMode | null;
  failureReason: GmailFailureReason | null;
  offered: boolean;
}

export interface OnboardingFields {
  agentName: FieldState;
  userName: FieldState;
  helpTopic: FieldState;
  gmail: GmailFieldState;
}

export interface CallBookkeeping {
  total: number;
  unplannedHangups: number;
  declined: number;
  ringing: boolean;
  activeCallId: string | null;
  lastEndReason: CallEndReason | null;
  callbackRequested: boolean;
}

export interface OnboardingRecord {
  id: string;
  version: number;
  phase: Phase;
  skipRequested: boolean;
  fields: OnboardingFields;
  calls: CallBookkeeping;
  createdAt: string;
  updatedAt: string;
  graduatedAt: string | null;
}

export interface ToolContext {
  channel: Channel;
  now: string;
}

export interface Outcome<R> {
  record: OnboardingRecord;
  result: R;
  changed: boolean;
}
