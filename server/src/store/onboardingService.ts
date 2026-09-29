import { randomUUID } from 'node:crypto';
import {
  cancelHangup,
  cancelRing,
  declineCall,
  endCall,
  startCall,
  type DeclineResult,
  type EndCallOutcome,
  type StartCallResult,
} from '../domain/calls.ts';
import { describeState, type StateDescription } from '../domain/describe.ts';
import type {
  MessageRole,
  OAuthAction,
  OnboardingEvent,
  StoredEvent,
  TranscriptEntry,
} from '../domain/events.ts';
import { applyGmailTransition, type GmailTransition, type GmailTransitionResult } from '../domain/gmail.ts';
import { resolveHeard } from '../domain/heard.ts';
import { createRecord } from '../domain/record.ts';
import { runTool, type ToolResult } from '../domain/tools/index.ts';
import { refundAsk } from '../domain/tools/recordAsk.ts';
import type { CallEndReason, Channel, FieldName, OnboardingRecord, Outcome } from '../domain/types.ts';
import { inTransaction, type Database } from './database.ts';
import { EventLog } from './eventLog.ts';
import { EventTargetError, VersionConflictError } from './errors.ts';
import { RecordStore } from './recordStore.ts';

export interface ServiceOptions {
  clock?: () => string;
  newId?: () => string;
}

export interface WriteOptions {
  expectedVersion?: number;
}

export interface Committed<R> {
  record: OnboardingRecord;
  result: R;
  changed: boolean;
  state: StateDescription;
  events: StoredEvent[];
}

export interface ToolCallRequest {
  name: string;
  input: unknown;
  channel: Channel;
  expectedVersion?: number;
}

export interface MessageInput {
  role: MessageRole;
  channel: Channel;
  text: string;
  callId?: string | null;
  heardText?: string | null;
  playedFraction?: number | null;
}

export interface HeardInput {
  messageSeq: number;
  heardText?: string | null;
  playedFraction?: number | null;
}

export interface EndCallRequest {
  callId: string;
  reason: CallEndReason;
  callbackRequested?: boolean;
}

function oauthAction(transition: GmailTransition): OAuthAction {
  if (transition.type === 'connected') {
    return 'connected';
  }
  return transition.type === 'failed' ? 'failed' : 'disconnected';
}

export class OnboardingService {
  readonly #db: Database;
  readonly #records: RecordStore;
  readonly #events: EventLog;
  readonly #clock: () => string;
  readonly #newId: () => string;

  constructor(db: Database, options: ServiceOptions = {}) {
    this.#db = db;
    this.#records = new RecordStore(db);
    this.#events = new EventLog(db);
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#newId = options.newId ?? randomUUID;
  }

  create(): OnboardingRecord {
    return inTransaction(this.#db, () => this.#records.insert(createRecord(this.#newId(), this.#clock())));
  }

  find(id: string): OnboardingRecord | null {
    return this.#records.find(id);
  }

  get(id: string): OnboardingRecord {
    return this.#records.require(id);
  }

  describe(id: string, channel?: Channel): StateDescription {
    return describeState(this.get(id), channel === undefined ? {} : { channel });
  }

  events(id: string, afterSeq = 0): StoredEvent[] {
    return this.#events.list(id, afterSeq);
  }

  transcript(id: string): TranscriptEntry[] {
    return this.#events.transcript(id);
  }

  callTool(id: string, request: ToolCallRequest): Committed<ToolResult> {
    const now = this.#clock();
    return this.#commit(
      id,
      request.channel,
      request,
      (record) => runTool(record, request.name, request.input, { channel: request.channel, now }),
      (outcome, saved) => {
        const events: OnboardingEvent[] = [
          {
            type: 'tool_call',
            name: request.name.slice(0, 64),
            channel: request.channel,
            input: request.input ?? null,
            result: outcome.result,
            changed: outcome.changed,
            recordVersion: saved.version,
          },
        ];
        const result = outcome.result;
        if (result.tool === 'offer_gmail_connect' && result.ok === true) {
          events.push({
            type: 'oauth',
            action: 'offered',
            mode: null,
            reason: null,
            recordVersion: saved.version,
          });
        }
        if (result.tool === 'use_sample_inbox' && result.ok === true && outcome.changed) {
          events.push({
            type: 'oauth',
            action: 'connected',
            mode: 'sample',
            reason: null,
            recordVersion: saved.version,
          });
        }
        if (result.tool === 'place_call' && result.ok === true) {
          events.push({ type: 'call_offered', userRequested: result.userRequested });
        }
        return events;
      },
      now,
    );
  }

  startCall(id: string, callId: string, options: WriteOptions = {}): Committed<StartCallResult> {
    const now = this.#clock();
    return this.#commit(
      id,
      'voice',
      options,
      (record) => startCall(record, callId, now),
      (outcome) => {
        if (!outcome.result.started) {
          return [];
        }
        const events: OnboardingEvent[] = [];
        if (outcome.result.supersededCallId !== null) {
          events.push({
            type: 'call_ended',
            callId: outcome.result.supersededCallId,
            reason: 'network_drop',
            unplanned: true,
            callbackRequested: false,
          });
        }
        events.push({
          type: 'call_started',
          callId,
          callNumber: outcome.result.callNumber,
          supersededCallId: outcome.result.supersededCallId,
        });
        return events;
      },
      now,
    );
  }

  endCall(id: string, request: EndCallRequest, options: WriteOptions = {}): Committed<EndCallOutcome> {
    const now = this.#clock();
    return this.#commit(
      id,
      'voice',
      options,
      (record) => endCall(record, request, now),
      (outcome) => {
        if (!outcome.result.ended || outcome.result.callId === null || outcome.result.reason === null) {
          return [];
        }
        return [
          {
            type: 'call_ended',
            callId: outcome.result.callId,
            reason: outcome.result.reason,
            unplanned: outcome.result.unplanned,
            callbackRequested: outcome.result.callbackRequested,
          },
        ];
      },
      now,
    );
  }

  refundAsk(id: string, field: FieldName, options: WriteOptions = {}): Committed<{ refunded: boolean }> {
    const now = this.#clock();
    return this.#commit(
      id,
      'system',
      options,
      (record) => refundAsk(record, field, now),
      (outcome) =>
        outcome.result.refunded
          ? [{ type: 'note', kind: 'ask_unanswered', detail: `The call ended before they could answer about ${field}.` }]
          : [],
      now,
    );
  }

  cancelHangup(id: string, options: WriteOptions = {}): Committed<{ cancelled: boolean }> {
    const now = this.#clock();
    return this.#commit(id, 'system', options, (record) => cancelHangup(record, now), () => [], now);
  }

  cancelRing(id: string, options: WriteOptions = {}): Committed<{ cancelled: boolean }> {
    const now = this.#clock();
    return this.#commit(id, 'system', options, (record) => cancelRing(record, now), () => [], now);
  }

  declineCall(id: string, options: WriteOptions = {}): Committed<DeclineResult> {
    const now = this.#clock();
    return this.#commit(
      id,
      'system',
      options,
      (record) => declineCall(record, now),
      (outcome) =>
        outcome.result.declined ? [{ type: 'call_declined', declinedCount: outcome.result.declinedCount }] : [],
      now,
    );
  }

  logLookup(
    id: string,
    lookup: { name: string; channel: Channel; input: unknown; ok: boolean; reason: string | null },
  ): StoredEvent {
    const now = this.#clock();
    return inTransaction(this.#db, () => {
      const record = this.#records.require(id);
      return this.#events.append(
        id,
        {
          type: 'tool_call',
          name: lookup.name.slice(0, 64),
          channel: lookup.channel,
          input: lookup.input ?? null,
          result: { tool: lookup.name.slice(0, 64), ok: lookup.ok, reason: lookup.reason },
          changed: false,
          recordVersion: record.version,
        },
        now,
      );
    });
  }

  logNote(id: string, kind: string, detail: string | null = null): StoredEvent {
    const now = this.#clock();
    return inTransaction(this.#db, () => {
      this.#records.require(id);
      return this.#events.append(
        id,
        { type: 'note', kind: kind.slice(0, 64), detail: detail === null ? null : detail.slice(0, 500) },
        now,
      );
    });
  }

  applyGmail(id: string, transition: GmailTransition, options: WriteOptions = {}): Committed<GmailTransitionResult> {
    const now = this.#clock();
    return this.#commit(
      id,
      'system',
      options,
      (record) => applyGmailTransition(record, transition, now),
      (outcome, saved) => {
        if (!outcome.result.applied) {
          return [];
        }
        return [
          {
            type: 'oauth',
            action: oauthAction(transition),
            mode: transition.type === 'connected' ? transition.mode : outcome.result.mode,
            reason: transition.type === 'failed' ? transition.reason : null,
            recordVersion: saved.version,
          },
        ];
      },
      now,
    );
  }

  logMessage(id: string, message: MessageInput): StoredEvent {
    const now = this.#clock();
    return inTransaction(this.#db, () => {
      this.#records.require(id);
      const truncates =
        message.role === 'agent' &&
        (typeof message.heardText === 'string' || typeof message.playedFraction === 'number');
      const heard = truncates
        ? resolveHeard({
            text: message.text,
            heardText: message.heardText ?? null,
            playedFraction: message.playedFraction ?? null,
          })
        : null;
      return this.#events.append(
        id,
        {
          type: 'message',
          role: message.role,
          channel: message.channel,
          text: message.text,
          heard: heard === message.text ? null : heard,
          callId: message.callId ?? null,
        },
        now,
      );
    });
  }

  supersedeMessage(id: string, messageSeq: number): StoredEvent {
    const now = this.#clock();
    return inTransaction(this.#db, () => {
      const target = this.#events.find(id, messageSeq);
      if (target === null || target.event.type !== 'message') {
        throw new EventTargetError(`event ${messageSeq} is not a message of ${id}`);
      }
      return this.#events.append(id, { type: 'message_superseded', messageSeq }, now);
    });
  }

  markHeard(id: string, input: HeardInput): StoredEvent {
    const now = this.#clock();
    return inTransaction(this.#db, () => {
      const target = this.#events.find(id, input.messageSeq);
      if (target === null || target.event.type !== 'message' || target.event.role !== 'agent') {
        throw new EventTargetError(`event ${input.messageSeq} is not an agent message of ${id}`);
      }
      const heard = resolveHeard({
        text: target.event.text,
        heardText: input.heardText ?? null,
        playedFraction: input.playedFraction ?? null,
      });
      return this.#events.append(id, { type: 'message_heard', messageSeq: input.messageSeq, heard }, now);
    });
  }

  #commit<R>(
    id: string,
    channel: Channel,
    options: WriteOptions,
    rule: (record: OnboardingRecord) => Outcome<R>,
    eventsFor: (outcome: Outcome<R>, saved: OnboardingRecord) => OnboardingEvent[],
    now: string,
  ): Committed<R> {
    return inTransaction(this.#db, () => {
      const current = this.#records.require(id);
      if (options.expectedVersion !== undefined && options.expectedVersion !== current.version) {
        throw new VersionConflictError(id, options.expectedVersion, current.version);
      }
      const outcome = rule(current);
      const saved = outcome.changed ? this.#records.save(outcome.record, current.version) : current;
      const events = eventsFor(outcome, saved).map((event) => this.#events.append(id, event, now));
      return {
        record: saved,
        result: outcome.result,
        changed: outcome.changed,
        state: describeState(saved, { channel }),
        events,
      };
    });
  }
}
