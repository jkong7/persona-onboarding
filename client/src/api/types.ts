export type FieldName = 'agentName' | 'userName' | 'helpTopic' | 'gmail';
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

export type CallEndReason = 'user_hangup' | 'tab_closed' | 'network_drop' | 'silence_timeout' | 'agent_ended';
export type ClientCallEndReason = Exclude<CallEndReason, 'silence_timeout'>;

export interface KnownField {
  field: FieldName;
  value: string;
  status: FieldStatus;
  source: Channel | null;
  needsReadBack: boolean;
}

export interface MissingField {
  field: FieldName;
  status: FieldStatus;
  blocks: string;
  fallback: string | null;
  asksUsed: number;
  asksRemaining: number;
  mayAsk: boolean;
  doNotAskBecause: string | null;
}

export interface GmailSummary {
  connected: boolean;
  mode: GmailMode | null;
  offered: boolean;
  failureReason: GmailFailureReason | null;
}

export interface CallSummary {
  total: number;
  unplannedHangups: number;
  active: boolean;
  ringing: boolean;
  declined: number;
  mayOfferCall: boolean;
  callbackRequested: boolean;
  lastEndReason: CallEndReason | null;
}

export interface StateDescription {
  onboardingId: string;
  version: number;
  phase: Phase;
  known: KnownField[];
  missing: MissingField[];
  askable: FieldName[];
  gmail: GmailSummary;
  graduation: { allowed: boolean; grantedBy: 'help_topic' | 'skip_request' | null };
  calls: CallSummary;
  text: string;
}

export type MessageRole = 'user' | 'agent';

export interface TranscriptEntry {
  seq: number;
  role: MessageRole;
  channel: Channel;
  callId: string | null;
  text: string;
  fullText: string;
  interrupted: boolean;
  createdAt: string;
}

export interface InterfaceFlags {
  gmailButtonShown: boolean;
  gmailConnected: boolean;
  gmailMode: GmailMode | null;
  ringing: boolean;
  activeCallId: string | null;
  mayOfferCall: boolean;
}

export interface Snapshot {
  id: string;
  version: number;
  phase: Phase;
  state: StateDescription;
  transcript: TranscriptEntry[];
  interface: InterfaceFlags;
  lastSeq: number;
}

export type TurnEnding = 'completed' | 'interrupted' | 'refused' | 'failed' | 'step_limit';

export type UiSignal =
  | { type: 'show_gmail_connect' }
  | { type: 'ring' }
  | { type: 'graduated' }
  | { type: 'end_call'; intent: 'completed' | 'callback_later' | 'switch_to_text' };

export interface Reply {
  text: string;
  ending: TurnEnding;
  signals: UiSignal[];
  spoken?: boolean;
}

export interface ActionResponse {
  snapshot: Snapshot;
  reply: Reply | null;
}

export interface OpenResponse extends ActionResponse {
  opened: string;
}

export interface DeclineResponse extends ActionResponse {
  declined: boolean;
}

export interface SampleResponse extends ActionResponse {
  applied: boolean;
  reason: 'real_account_connected' | 'already_on_sample' | null;
}

export interface AudioFormat {
  encoding?: string;
  sample_rate?: number;
  container?: string;
  bitrate?: number;
}

export interface VoiceSettings {
  type: 'Settings';
  audio?: { input?: AudioFormat; output?: AudioFormat };
  agent?: unknown;
  [key: string]: unknown;
}

export interface CallStartResponse {
  callId: string;
  token: string;
  expiresIn: number;
  settings: VoiceSettings;
  greeting: string;
}

export interface CallEndResponse {
  ended: boolean;
  reply: Reply | null;
  snapshot: Snapshot | null;
}

export interface DoneEvent {
  text: string;
  ending: TurnEnding;
  signals: UiSignal[];
  snapshot: Snapshot | null;
}
