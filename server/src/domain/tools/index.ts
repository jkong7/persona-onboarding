import type { OnboardingRecord, Outcome, ToolContext } from '../types.ts';
import { deferField, type DeferFieldResult } from './deferField.ts';
import { endCallTool, type EndCallResult } from './endCall.ts';
import { graduate, type GraduateResult } from './graduate.ts';
import { offerGmailConnect, type OfferGmailConnectResult } from './offerGmailConnect.ts';
import { placeCall, type PlaceCallResult } from './placeCall.ts';
import { recordAsk, type RecordAskResult } from './recordAsk.ts';
import { updateProfile, type UpdateProfileResult } from './updateProfile.ts';
import { useSampleInbox, type UseSampleInboxResult } from './useSampleInbox.ts';

export const TOOL_NAMES = [
  'update_profile',
  'defer_field',
  'record_ask',
  'offer_gmail_connect',
  'use_sample_inbox',
  'graduate',
  'place_call',
  'end_call',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface UnknownToolResult {
  tool: string;
  ok: false;
  reason: 'unknown_tool';
}

export type ToolResult =
  | UpdateProfileResult
  | DeferFieldResult
  | RecordAskResult
  | OfferGmailConnectResult
  | UseSampleInboxResult
  | GraduateResult
  | PlaceCallResult
  | EndCallResult
  | UnknownToolResult;

type ToolRule = (record: OnboardingRecord, input: unknown, ctx: ToolContext) => Outcome<ToolResult>;

const RULES: Record<ToolName, ToolRule> = {
  update_profile: updateProfile,
  defer_field: deferField,
  record_ask: recordAsk,
  offer_gmail_connect: offerGmailConnect,
  use_sample_inbox: useSampleInbox,
  graduate,
  place_call: placeCall,
  end_call: endCallTool,
};

export function isToolName(name: unknown): name is ToolName {
  return typeof name === 'string' && (TOOL_NAMES as readonly string[]).includes(name);
}

export function runTool(
  record: OnboardingRecord,
  name: string,
  input: unknown,
  ctx: ToolContext,
): Outcome<ToolResult> {
  if (!isToolName(name)) {
    return {
      record,
      changed: false,
      result: { tool: name.slice(0, 64), ok: false, reason: 'unknown_tool' },
    };
  }
  return RULES[name](record, input, ctx);
}

export {
  deferField,
  endCallTool,
  graduate,
  offerGmailConnect,
  placeCall,
  recordAsk,
  updateProfile,
  useSampleInbox,
};
export type {
  DeferFieldResult,
  EndCallResult,
  GraduateResult,
  OfferGmailConnectResult,
  PlaceCallResult,
  RecordAskResult,
  UpdateProfileResult,
  UseSampleInboxResult,
};
