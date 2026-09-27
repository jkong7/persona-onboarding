import type {
  CallSummary,
  FieldName,
  FieldStatus,
  GmailSummary,
  KnownField,
  MissingField,
  Snapshot,
  TranscriptEntry,
} from '../api/types.ts';

const ALL_FIELDS: FieldName[] = ['helpTopic', 'userName', 'gmail', 'agentName'];

export interface SnapshotOptions {
  id?: string;
  version?: number;
  lastSeq?: number;
  phase?: Snapshot['phase'];
  known?: Partial<Record<FieldName, { value: string; status?: FieldStatus }>>;
  missing?: Partial<Record<FieldName, FieldStatus>>;
  gmail?: Partial<GmailSummary>;
  calls?: Partial<CallSummary>;
  transcript?: TranscriptEntry[];
  activeCallId?: string | null;
}

export function entry(
  seq: number,
  role: TranscriptEntry['role'],
  text: string,
  extra: Partial<TranscriptEntry> = {},
): TranscriptEntry {
  return {
    seq,
    role,
    channel: 'text',
    callId: null,
    text,
    fullText: text,
    interrupted: false,
    createdAt: new Date(Date.UTC(2026, 8, 27, 18, 0, seq)).toISOString(),
    ...extra,
  };
}

export function snapshot(options: SnapshotOptions = {}): Snapshot {
  const knownInput = options.known ?? {};
  const known: KnownField[] = (Object.keys(knownInput) as FieldName[]).map((field) => {
    const item = knownInput[field];
    const status = item?.status ?? 'confirmed';
    return {
      field,
      value: item?.value ?? '',
      status,
      source: 'text',
      needsReadBack: status === 'provisional',
    };
  });
  const missing: MissingField[] = ALL_FIELDS.filter((field) => knownInput[field] === undefined).map((field) => {
    const status = options.missing?.[field] ?? 'empty';
    return {
      field,
      status,
      blocks: 'nothing',
      fallback: null,
      asksUsed: 0,
      asksRemaining: status === 'empty' ? 2 : 0,
      mayAsk: status === 'empty',
      doNotAskBecause: status === 'empty' ? null : status,
    };
  });
  const gmail: GmailSummary = {
    connected: knownInput.gmail !== undefined,
    mode: null,
    offered: false,
    failureReason: null,
    ...options.gmail,
  };
  const calls: CallSummary = {
    total: 0,
    unplannedHangups: 0,
    active: options.activeCallId !== undefined && options.activeCallId !== null,
    ringing: false,
    declined: 0,
    mayOfferCall: true,
    callbackRequested: false,
    lastEndReason: null,
    ...options.calls,
  };
  const transcript = options.transcript ?? [];
  const id = options.id ?? 'onb_1';
  const version = options.version ?? 1;
  const phase = options.phase ?? 'onboarding';
  return {
    id,
    version,
    phase,
    state: {
      onboardingId: id,
      version,
      phase,
      known,
      missing,
      askable: missing.filter((item) => item.mayAsk).map((item) => item.field),
      gmail,
      graduation: { allowed: knownInput.helpTopic !== undefined, grantedBy: null },
      calls,
      text: '',
    },
    transcript,
    interface: {
      gmailButtonShown: gmail.offered && gmail.mode !== 'real',
      gmailConnected: gmail.connected,
      gmailMode: gmail.mode,
      ringing: calls.ringing,
      activeCallId: options.activeCallId ?? null,
      mayOfferCall: calls.mayOfferCall,
    },
    lastSeq: options.lastSeq ?? transcript.at(-1)?.seq ?? 0,
  };
}
