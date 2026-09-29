import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databasePath } from '../../src/config.ts';
import { countSentences } from '../checks.ts';
import { Caller } from './caller.ts';
import { CALLS, type CallScript } from './calls.ts';

interface Row {
  payload: string;
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

function parseArgs(argv: readonly string[]): { only: string[]; base: string; list: boolean } {
  const options = { only: [] as string[], base: 'http://localhost:8787', list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--only' && value !== undefined) {
      options.only = value.split(',').map((item) => item.trim());
      index += 1;
    } else if (arg === '--base' && value !== undefined) {
      options.base = value;
      index += 1;
    } else if (arg === '--list') {
      options.list = true;
    }
  }
  return options;
}

function eventsFor(id: string): Record<string, unknown>[] {
  const db = new DatabaseSync(databasePath(), { readOnly: true });
  try {
    const rows = db
      .prepare('SELECT payload FROM events WHERE onboarding_id = ? ORDER BY seq')
      .all(id) as unknown as Row[];
    return rows.map((row) => JSON.parse(row.payload) as Record<string, unknown>);
  } finally {
    db.close();
  }
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function checksFor(events: readonly Record<string, unknown>[]): Check[] {
  const spoken = events.filter((event) => event['type'] === 'message' && event['role'] === 'agent' && event['channel'] === 'voice');
  const all = events.filter((event) => event['type'] === 'message' && event['role'] === 'agent');
  const text = (event: Record<string, unknown>): string => String(event['text']);
  const long = spoken.filter((event) => countSentences(text(event)) > 5);
  const spelled = spoken.filter((event) => /\b\p{L}(?:[-. ]\p{L}){2,}\b(?![\p{L}'])/u.test(text(event).replace(/\b\p{L}{2,}\b/gu, '#')));
  const trailing = spoken.filter((event) => /\?["')\]]*\s+\S/.test(text(event)));
  const dashes = all.filter((event) => /[‒–—―]|\S[^\S\n]+-{1,3}[^\S\n]+/.test(text(event)));
  const doubled = spoken.filter((event) => (text(event).match(/\?/g) ?? []).length > 1);
  const fallbacks = all.filter((event) => /lost my thread|something went wrong on my side/.test(text(event)));
  const errors = events.filter((event) => event['type'] === 'note' && event['kind'] === 'model_error');
  const rejected = events.filter((event) => {
    if (event['type'] !== 'tool_call') {
      return false;
    }
    const result = event['result'] as { ok?: unknown } | null;
    return result?.ok !== true;
  });
  return [
    { name: 'no failed turns', ok: errors.length === 0, detail: `${errors.length}` },
    { name: 'no fallback lines', ok: fallbacks.length === 0, detail: fallbacks.map(text).join(' | ') || 'none' },
    { name: 'spoken replies are 5 sentences or fewer', ok: long.length === 0, detail: long.map(text).join(' | ') || 'none' },
    { name: 'names are never spelled out letter by letter', ok: spelled.length === 0, detail: spelled.map(text).join(' | ') || 'none' },
    { name: 'nothing is said after a question', ok: trailing.length === 0, detail: trailing.map(text).join(' | ') || 'none' },
    { name: 'spoken replies ask one question at most', ok: doubled.length === 0, detail: doubled.map(text).join(' | ') || 'none' },
    { name: 'no dashes', ok: dashes.length === 0, detail: dashes.map(text).join(' | ') || 'none' },
    {
      name: 'rejected tool calls',
      ok: true,
      detail:
        rejected
          .map((event) => `${String(event['name'])} (${String((event['result'] as { reason?: unknown })?.reason)})`)
          .join(', ') || 'none',
    },
  ];
}

async function runCall(script: CallScript, base: string): Promise<string> {
  const lines: string[] = [];
  const caller = new Caller({
    baseUrl: base,
    deepgramKey: process.env['DEEPGRAM_API_KEY'] ?? '',
    voice: script.voice ?? 'aura-2-orion-en',
    noise: script.noise ?? 0,
    log: (line) => {
      lines.push(line);
      console.log(`  ${line}`);
    },
  });
  console.log(`\n=== ${script.id}: ${script.title}`);
  let failure: string | null = null;
  try {
    await script.run(caller);
  } catch (error) {
    failure = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
    console.log(`  ERROR ${failure}`);
    try {
      await caller.hangUp('network_drop');
    } catch {
      failure = `${failure} (and the hangup failed)`;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const snapshot = await caller.snapshot();
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base);
  const events: Record<string, unknown>[] = local
    ? eventsFor(caller.onboardingId)
    : snapshot.transcript.map((entry) => ({
        type: 'message',
        role: entry.role,
        channel: entry.channel,
        text: entry.fullText,
      }));
  const checks = checksFor(events);
  const tools = events
    .filter((event) => event['type'] === 'tool_call')
    .map((event) => {
      const result = event['result'] as { ok?: unknown; reason?: unknown } | null;
      return `${String(event['channel'])} ${String(event['name'])} ${result?.ok === true ? 'ok' : `rejected (${String(result?.reason)})`}`;
    });

  const report = [
    `## ${script.id}: ${script.title}`,
    '',
    failure === null ? '' : `Error: ${failure}`,
    `Time to first reply audio: median ${median(caller.latencies)} ms, worst ${Math.max(0, ...caller.latencies)} ms, over ${caller.latencies.length} replies`,
    '',
    'Checks:',
    ...checks.map((check) => `- ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}`),
    '',
    'Tools:',
    ...tools.map((tool) => `- ${tool}`),
    '',
    'Saved at the end:',
    '```',
    snapshot.state.text,
    '```',
    '',
    'Timeline:',
    '```',
    ...lines,
    '```',
    '',
    'Thread as the person sees it:',
    '```',
    ...snapshot.transcript.map(
      (entry) =>
        `${entry.role === 'agent' ? 'AGENT ' : 'PERSON'} [${entry.channel}] ${entry.text}${entry.interrupted ? `   (cut off; the full line was: ${entry.fullText})` : ''}`,
    ),
    '```',
    '',
  ].join('\n');

  console.log(`  first reply audio: median ${median(caller.latencies)} ms, worst ${Math.max(0, ...caller.latencies)} ms`);
  for (const check of checks) {
    if (!check.ok) {
      console.log(`  FAIL ${check.name}: ${check.detail}`);
    }
  }
  console.log(`  saved: ${snapshot.state.text.split('\n').filter((line) => line.startsWith('- ')).join(' ')}`);
  return report;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.list) {
    for (const call of CALLS) {
      console.log(`${call.id}: ${call.title}`);
    }
    return;
  }
  const chosen = CALLS.filter((call) => options.only.length === 0 || options.only.includes(call.id));
  const reports: string[] = [];
  for (const call of chosen) {
    reports.push(await runCall(call, options.base));
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join('eval-results', `voice-${stamp}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.md'), `# Live call results\n\n${reports.join('\n')}`);
  console.log(`\nreport at ${join(dir, 'report.md')}`);
  process.exit(0);
}

await main();
