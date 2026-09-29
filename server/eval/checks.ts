import type { StoredEvent } from '../src/domain/events.ts';
import { ASK_BUDGET, FIELD_NAMES } from '../src/domain/fields.ts';
import { hasValue } from '../src/domain/record.ts';
import type { OnboardingRecord } from '../src/domain/types.ts';
import type { Finding, Scenario } from './types.ts';

const INTERNAL_TERMS = [
  'update_profile',
  'record_ask',
  'defer_field',
  'offer_gmail_connect',
  'use_sample_inbox',
  'place_call',
  'search_inbox',
  'read_email',
  'helpTopic',
  'userName',
  'agentName',
  '<state>',
  '<event',
  '<user_message',
  'tool_use',
];

const VOICE_SENTENCE_LIMIT = 5;
const QUESTION_LIMIT = 2;

interface AgentLine {
  text: string;
  channel: string;
}

function agentLines(events: readonly StoredEvent[]): AgentLine[] {
  return events.flatMap((stored) =>
    stored.event.type === 'message' && stored.event.role === 'agent'
      ? [{ text: stored.event.text, channel: stored.event.channel }]
      : [],
  );
}

const THREAD_CLAIM =
  /\b(i've|i have|i just|just)\s+(put|sent|dropped|popped|added|updated|texted|left)\b[^.?!]{0,60}\b(thread|text|messages)\b|\b(is|are|it's|that's|they're)\s+(now\s+|already\s+)?(in|on)\s+(the|your)\s+thread\b/i;

export function unbackedThreadClaims(events: readonly StoredEvent[]): string[] {
  const claims: string[] = [];
  let pending: string[] = [];
  let wrote = false;
  const close = (): void => {
    if (!wrote) {
      claims.push(...pending);
    }
    pending = [];
    wrote = false;
  };
  for (const stored of events) {
    const event = stored.event;
    if (event.type !== 'message') {
      continue;
    }
    if (event.role === 'user') {
      close();
      continue;
    }
    if (event.channel === 'text') {
      wrote = true;
      continue;
    }
    if (event.channel === 'voice' && THREAD_CLAIM.test(event.text)) {
      pending.push(event.text);
    }
  }
  close();
  return claims;
}

export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
}

function finding(check: string, ok: boolean, detail: string): Finding {
  return { check, ok, detail };
}

function quote(text: string): string {
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
}

export function universalChecks(record: OnboardingRecord, events: readonly StoredEvent[]): Finding[] {
  const findings: Finding[] = [];
  const lines = agentLines(events);

  const errors = events.filter((stored) => stored.event.type === 'note' && stored.event.kind === 'model_error');
  findings.push(
    finding('no failed turns', errors.length === 0, errors.length === 0 ? 'none' : `${errors.length} failed turns`),
  );

  const overAsked = FIELD_NAMES.filter((field) => record.fields[field].askCount > ASK_BUDGET);
  findings.push(
    finding(
      'asks within budget',
      overAsked.length === 0,
      FIELD_NAMES.map((field) => `${field} ${record.fields[field].askCount}`).join(', '),
    ),
  );

  const reasked = events.filter((stored) => {
    if (stored.event.type !== 'tool_call' || stored.event.name !== 'record_ask') {
      return false;
    }
    const result = stored.event.result as { reason?: unknown } | null;
    return result?.reason === 'already_known';
  });
  findings.push(
    finding(
      'never asked for something already known',
      reasked.length === 0,
      reasked.length === 0 ? 'none' : `${reasked.length} asks for a known item`,
    ),
  );

  findings.push(
    finding(
      'no real Gmail connection without Google',
      record.fields.gmail.mode !== 'real',
      `mode ${record.fields.gmail.mode ?? 'none'}`,
    ),
  );

  const leaks = lines.filter((line) => INTERNAL_TERMS.some((term) => line.text.includes(term)));
  findings.push(
    finding(
      'no internal terms in replies',
      leaks.length === 0,
      leaks.length === 0 ? 'none' : quote(leaks[0]!.text),
    ),
  );

  const long = lines.filter((line) => line.channel === 'voice' && countSentences(line.text) > VOICE_SENTENCE_LIMIT);
  findings.push(
    finding(
      `spoken replies are ${VOICE_SENTENCE_LIMIT} sentences or fewer`,
      long.length === 0,
      long.length === 0
        ? `${lines.filter((line) => line.channel === 'voice').length} spoken replies checked`
        : `${long.length} too long, for example: ${quote(long[0]!.text)}`,
    ),
  );

  const dashes = lines.filter((line) => /[\u2012\u2013\u2014\u2015]|\S[^\S\n]+-{1,3}[^\S\n]+/.test(line.text));
  findings.push(
    finding('no dashes used as punctuation', dashes.length === 0, dashes.length === 0 ? 'none' : quote(dashes[0]!.text)),
  );

  const claims = unbackedThreadClaims(events);
  findings.push(
    finding(
      'never claims to have put something in the thread without doing it',
      claims.length === 0,
      claims.length === 0 ? 'none' : quote(claims[0]!),
    ),
  );

  const crowded = lines.filter(
    (line) => line.channel === 'voice' && (line.text.match(/\?/g) ?? []).length > QUESTION_LIMIT,
  );
  findings.push(
    finding(
      `no spoken reply asks more than ${QUESTION_LIMIT} questions`,
      crowded.length === 0,
      crowded.length === 0 ? 'none' : quote(crowded[0]!.text),
    ),
  );

  return findings;
}

export function expectationChecks(
  scenario: Scenario,
  record: OnboardingRecord,
  events: readonly StoredEvent[],
): Finding[] {
  const findings: Finding[] = [];
  const expect = scenario.expect;

  if (expect.phase !== undefined) {
    findings.push(finding(`phase is ${expect.phase}`, record.phase === expect.phase, `phase ${record.phase}`));
  }
  if (expect.gmailMode !== undefined) {
    findings.push(
      finding(
        `inbox is ${expect.gmailMode ?? 'not connected'}`,
        record.fields.gmail.mode === expect.gmailMode,
        `mode ${record.fields.gmail.mode ?? 'none'}`,
      ),
    );
  }
  for (const wanted of expect.fields ?? []) {
    const field = record.fields[wanted.field];
    const value = (field.value ?? '').toLowerCase();
    const detail = `${wanted.field} = ${JSON.stringify(field.value)} (${field.status})`;
    if (wanted.empty === true) {
      findings.push(finding(`${wanted.field} was not recorded`, !hasValue(field), detail));
    }
    if (wanted.includes !== undefined) {
      findings.push(
        finding(`${wanted.field} contains "${wanted.includes}"`, value.includes(wanted.includes.toLowerCase()), detail),
      );
    }
    if (wanted.excludes !== undefined) {
      findings.push(
        finding(
          `${wanted.field} does not contain "${wanted.excludes}"`,
          !value.includes(wanted.excludes.toLowerCase()),
          detail,
        ),
      );
    }
    if (wanted.status !== undefined) {
      findings.push(
        finding(`${wanted.field} status is ${wanted.status.join(' or ')}`, wanted.status.includes(field.status), detail),
      );
    }
  }
  if (expect.maxUnplannedHangups !== undefined) {
    findings.push(
      finding(
        `at most ${expect.maxUnplannedHangups} unplanned hangups`,
        record.calls.unplannedHangups <= expect.maxUnplannedHangups,
        `${record.calls.unplannedHangups} recorded`,
      ),
    );
  }
  if (expect.minUnplannedHangups !== undefined) {
    findings.push(
      finding(
        `at least ${expect.minUnplannedHangups} unplanned hangups`,
        record.calls.unplannedHangups >= expect.minUnplannedHangups,
        `${record.calls.unplannedHangups} recorded`,
      ),
    );
  }
  if (expect.lastCallEnd !== undefined) {
    findings.push(
      finding(
        `last call ended by ${expect.lastCallEnd.join(' or ')}`,
        record.calls.lastEndReason !== null && expect.lastCallEnd.includes(record.calls.lastEndReason),
        `ended by ${record.calls.lastEndReason ?? 'nothing'}`,
      ),
    );
  }
  if (expect.noUnpromptedCallAfterLimit === true) {
    let hangups = 0;
    let offended = 0;
    for (const stored of events) {
      if (stored.event.type === 'call_ended' && stored.event.unplanned) {
        hangups += 1;
      }
      if (stored.event.type === 'call_offered' && !stored.event.userRequested && hangups >= 2) {
        offended += 1;
      }
    }
    findings.push(
      finding(
        'no unprompted call after two dropped calls',
        offended === 0,
        `${hangups} dropped calls, ${offended} unprompted calls afterwards`,
      ),
    );
  }
  for (const phrase of expect.agentNever ?? []) {
    const hit = agentLines(events).find((line) => line.text.toLowerCase().includes(phrase.toLowerCase()));
    findings.push(
      finding(`agent never says "${phrase}"`, hit === undefined, hit === undefined ? 'never said' : quote(hit.text)),
    );
  }
  return findings;
}

export function sameFields(before: OnboardingRecord, after: OnboardingRecord): Finding {
  const changed = FIELD_NAMES.filter((field) => {
    const left = before.fields[field];
    const right = after.fields[field];
    if (!hasValue(left)) {
      return false;
    }
    if (field === 'helpTopic') {
      return !hasValue(right);
    }
    return left.value !== right.value || !hasValue(right);
  });
  return finding(
    'nothing was lost across the dropped call',
    changed.length === 0,
    changed.length === 0 ? 'every saved value survived' : `changed: ${changed.join(', ')}`,
  );
}
