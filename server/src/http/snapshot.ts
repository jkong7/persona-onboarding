import { mayOfferCall } from '../domain/calls.ts';
import type { StateDescription } from '../domain/describe.ts';
import type { TranscriptEntry } from '../domain/events.ts';
import { hasValue } from '../domain/record.ts';
import type { GmailMode, Phase } from '../domain/types.ts';
import type { OnboardingService } from '../store/onboardingService.ts';

export interface InterfaceFlags {
  gmailButtonShown: boolean;
  gmailConnected: boolean;
  gmailMode: GmailMode | null;
  ringing: boolean;
  activeCallId: string | null;
  hangupRequested: boolean;
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

export function buildSnapshot(service: OnboardingService, id: string): Snapshot {
  const record = service.get(id);
  const events = service.events(id);
  const gmail = record.fields.gmail;
  return {
    id: record.id,
    version: record.version,
    phase: record.phase,
    state: service.describe(id),
    transcript: service.transcript(id),
    interface: {
      gmailButtonShown:
        gmail.offered && gmail.mode !== 'real' && gmail.status !== 'deferred' && gmail.status !== 'declined',
      gmailConnected: hasValue(gmail),
      gmailMode: gmail.mode,
      ringing: record.calls.ringing,
      activeCallId: record.calls.activeCallId,
      hangupRequested: record.calls.activeCallId !== null && record.calls.hangupIntent !== null,
      mayOfferCall: mayOfferCall(record),
    },
    lastSeq: events.at(-1)?.seq ?? 0,
  };
}
