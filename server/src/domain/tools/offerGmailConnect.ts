import { asksRemaining, hasValue, withField } from '../record.ts';
import type { GmailFieldState, GmailMode, OnboardingRecord, Outcome, ToolContext } from '../types.ts';
import { askBlockedBy } from './recordAsk.ts';
import { isPlainObject } from './input.ts';

export type OfferRejection = 'already_connected' | 'deferred' | 'declined' | 'ask_budget_spent';

export interface OfferGmailConnectResult {
  tool: 'offer_gmail_connect';
  ok: boolean;
  showConnectButton: boolean;
  connected: boolean;
  mode: GmailMode | null;
  asksRemaining: number;
  sampleInboxAvailable: boolean;
  reason: OfferRejection | null;
}

function build(gmail: GmailFieldState, ok: boolean, reason: OfferRejection | null): OfferGmailConnectResult {
  const connected = hasValue(gmail);
  return {
    tool: 'offer_gmail_connect',
    ok,
    showConnectButton: ok,
    connected,
    mode: gmail.mode,
    asksRemaining: asksRemaining(gmail),
    sampleInboxAvailable: !connected,
    reason,
  };
}

export function offerGmailConnect(
  record: OnboardingRecord,
  input: unknown,
  ctx: ToolContext,
): Outcome<OfferGmailConnectResult> {
  const gmail = record.fields.gmail;
  const userRequested = isPlainObject(input) && input['userRequested'] === true;
  if (hasValue(gmail) && gmail.mode === 'real') {
    return { record, changed: false, result: build(gmail, false, 'already_connected') };
  }
  if (userRequested) {
    const reopened: GmailFieldState = {
      ...gmail,
      offered: true,
      status: hasValue(gmail) ? gmail.status : 'empty',
    };
    const next = withField(record, 'gmail', reopened, ctx.now);
    return { record: next, changed: true, result: build(next.fields.gmail, true, null) };
  }
  if (hasValue(gmail)) {
    return { record, changed: false, result: build(gmail, false, 'already_connected') };
  }
  const blocked = askBlockedBy(gmail);
  if (blocked === 'ask_budget_spent') {
    const settled: GmailFieldState = { ...gmail, status: 'deferred', source: 'system' };
    const next = withField(record, 'gmail', settled, ctx.now);
    return { record: next, changed: true, result: build(next.fields.gmail, false, blocked) };
  }
  if (blocked === 'deferred' || blocked === 'declined') {
    return { record, changed: false, result: build(gmail, false, blocked) };
  }
  const offered: GmailFieldState = { ...gmail, offered: true, askCount: gmail.askCount + 1 };
  const next = withField(record, 'gmail', offered, ctx.now);
  return { record: next, changed: true, result: build(next.fields.gmail, true, null) };
}
