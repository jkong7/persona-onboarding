import type { FieldName, FieldStatus, GmailMode, Phase } from '../src/domain/types.ts';

export type CallEnd = 'user_hangup' | 'tab_closed' | 'network_drop';

export type Beat =
  | { do: 'open' }
  | { do: 'say'; text: string }
  | { do: 'converse'; turns: number; until?: 'graduated' | 'ringing' | 'call_over' }
  | { do: 'accept_call' }
  | { do: 'decline_call' }
  | { do: 'hangup'; reason: CallEnd }
  | { do: 'silence' }
  | { do: 'type_in_call'; text: string }
  | { do: 'gmail_sample' }
  | { do: 'gmail_outcome'; outcome: 'popup_closed' | 'popup_blocked' | 'access_denied' }
  | { do: 'wait'; minutes: number };

export interface FieldExpectation {
  field: FieldName;
  status?: FieldStatus[];
  includes?: string;
  excludes?: string;
  empty?: boolean;
}

export interface Expectations {
  phase?: Phase;
  gmailMode?: GmailMode | null;
  fields?: FieldExpectation[];
  maxUnplannedHangups?: number;
  minUnplannedHangups?: number;
  noUnpromptedCallAfterLimit?: boolean;
  lastCallEnd?: string[];
  agentNever?: string[];
}

export interface Scenario {
  id: string;
  title: string;
  persona: string;
  onRing: 'accept' | 'decline' | 'ignore';
  beats: Beat[];
  expect: Expectations;
  rubric: string[];
}

export interface Line {
  who: 'user' | 'agent' | 'event';
  channel: 'text' | 'voice' | 'system';
  text: string;
}

export interface Finding {
  check: string;
  ok: boolean;
  detail: string;
}

export interface Verdict {
  natural: number;
  notFormLike: number;
  steering: number;
  handledCurveball: number;
  reasked: boolean;
  pass: boolean;
  problems: string[];
  summary: string;
}

export interface ScenarioResult {
  id: string;
  title: string;
  run: number;
  lines: Line[];
  findings: Finding[];
  verdict: Verdict | null;
  passed: boolean;
  agentTurns: number;
  firstWordsMs: number[];
  costUsd: number;
  usage: Record<string, unknown>;
  tools: string[];
  error: string | null;
}
