import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicModel, modelOptionsFromEnv } from '../src/agent/anthropicModel.ts';
import { createApp } from '../src/http/app.ts';
import { TurnQueue } from '../src/http/turnQueue.ts';
import { openDatabase } from '../src/store/database.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';
import { CallTokens } from '../src/voice/callToken.ts';
import type { VoiceProvider } from '../src/voice/deepgram.ts';
import { BRAIN_PATH } from '../src/voice/deepgram.ts';
import { expectationChecks, universalChecks } from './checks.ts';
import { Driver, type Clock } from './driver.ts';
import { Meter, metered } from './meter.ts';
import { Judge, renderLines, SimulatedPerson } from './people.ts';
import { SCENARIOS } from './scenarios.ts';
import type { Scenario, ScenarioResult } from './types.ts';

interface Options {
  only: string[];
  runs: number;
  judge: boolean;
  parallel: number;
  list: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { only: [], runs: 1, judge: true, parallel: 3, list: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === '--only' && value !== undefined) {
      options.only = value.split(',').map((item) => item.trim());
      index += 1;
    } else if (arg === '--runs' && value !== undefined) {
      options.runs = Math.max(1, Number(value) || 1);
      index += 1;
    } else if (arg === '--parallel' && value !== undefined) {
      options.parallel = Math.max(1, Number(value) || 1);
      index += 1;
    } else if (arg === '--no-judge') {
      options.judge = false;
    } else if (arg === '--list') {
      options.list = true;
    }
  }
  return options;
}

const stubVoice: VoiceProvider = {
  grantToken: async () => ({ token: 'not-a-real-token', expiresIn: 120 }),
  buildSettings: (input) => ({
    type: 'Settings',
    agent: {
      greeting: input.greeting,
      think: {
        endpoint: {
          url: `https://eval.invalid${BRAIN_PATH}`,
          headers: { authorization: `Bearer ${input.brainToken}` },
        },
      },
    },
  }),
};

async function runOne(scenario: Scenario, run: number, options: Options, client: Anthropic): Promise<ScenarioResult> {
  const meter = new Meter();
  const clock: Clock = { ms: Date.now() };
  const now = (): Date => new Date(clock.ms);
  const service = new OnboardingService(openDatabase(':memory:'), { clock: () => now().toISOString() });
  const turns = new TurnQueue();
  const text = modelOptionsFromEnv();
  const voiceModel = process.env['AGENT_VOICE_MODEL']?.trim() || text.model;
  const app = createApp({
    service,
    now,
    models: {
      text: metered(new AnthropicModel(text), text.model, meter),
      voice: metered(new AnthropicModel({ ...text, model: voiceModel }), voiceModel, meter),
    },
    voice: { ok: true, provider: stubVoice },
    tokens: new CallTokens(),
    turns,
  });
  const driver = new Driver(app, service, clock, scenario, new SimulatedPerson(client, meter), turns);
  const base: ScenarioResult = {
    id: scenario.id,
    title: scenario.title,
    run,
    lines: driver.lines,
    findings: [],
    verdict: null,
    passed: false,
    agentTurns: 0,
    firstWordsMs: [],
    costUsd: 0,
    usage: {},
    tools: [],
    error: null,
  };

  try {
    await driver.run();
    const record = driver.record();
    const events = service.events(driver.onboardingId);
    const findings = [
      ...universalChecks(record, events),
      ...expectationChecks(scenario, record, events),
      ...driver.findings,
    ];
    const verdict = options.judge
      ? await new Judge(client, meter).review(scenario, driver.lines, service.describe(driver.onboardingId).text)
      : null;
    const checksPass = findings.every((finding) => finding.ok);
    return {
      ...base,
      findings,
      verdict,
      passed: checksPass && (verdict === null ? !options.judge : verdict.pass),
      agentTurns: driver.lines.filter((line) => line.who === 'agent').length,
      firstWordsMs: meter.firstWordsMs,
      costUsd: meter.costUsd,
      usage: meter.byModel,
      tools: events.flatMap((stored) => {
        if (stored.event.type !== 'tool_call') {
          return [];
        }
        const result = stored.event.result as { ok?: unknown; reason?: unknown } | null;
        return [
          `${stored.event.channel} ${stored.event.name} ${result?.ok === true ? 'ok' : `rejected (${String(result?.reason ?? 'unknown')})`}`,
        ];
      }),
    };
  } catch (error) {
    return {
      ...base,
      firstWordsMs: meter.firstWordsMs,
      costUsd: meter.costUsd,
      usage: meter.byModel,
      error: error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error',
    };
  }
}

async function pool<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function report(results: readonly ScenarioResult[], options: Options): string {
  const byScenario = new Map<string, ScenarioResult[]>();
  for (const result of results) {
    byScenario.set(result.id, [...(byScenario.get(result.id) ?? []), result]);
  }
  const everyRun = [...byScenario.values()].filter((runs) => runs.every((run) => run.passed)).length;
  const cost = results.reduce((sum, result) => sum + result.costUsd, 0);
  const lines: string[] = [
    '# Scenario results',
    '',
    `- Scenarios: ${byScenario.size}, runs each: ${options.runs}`,
    `- Passed every run: ${everyRun} of ${byScenario.size}`,
    `- Runs passed: ${results.filter((result) => result.passed).length} of ${results.length}`,
    `- Median time to first words: ${median(results.flatMap((result) => result.firstWordsMs))} ms`,
    `- Model cost: $${cost.toFixed(2)}`,
    '',
    '| Scenario | Run | Result | Checks failed | Natural | Not form-like | Steering | Curveball | Turns |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  for (const result of results) {
    const failed = result.findings.filter((finding) => !finding.ok).length;
    const verdict = result.verdict;
    lines.push(
      `| ${result.id} | ${result.run} | ${result.error !== null ? 'error' : result.passed ? 'pass' : 'fail'} | ${failed} | ${verdict?.natural ?? '-'} | ${verdict?.notFormLike ?? '-'} | ${verdict?.steering ?? '-'} | ${verdict?.handledCurveball ?? '-'} | ${result.agentTurns} |`,
    );
  }
  for (const result of results) {
    lines.push('', `## ${result.id}, run ${result.run}: ${result.title}`, '');
    if (result.error !== null) {
      lines.push(`Error: ${result.error}`, '');
    }
    const failed = result.findings.filter((finding) => !finding.ok);
    if (failed.length > 0) {
      lines.push('Failed checks:', '', ...failed.map((finding) => `- ${finding.check}: ${finding.detail}`), '');
    }
    if (result.verdict !== null) {
      lines.push(`Reviewer: ${result.verdict.pass ? 'pass' : 'fail'}. ${result.verdict.summary}`, '');
      if (result.verdict.problems.length > 0) {
        lines.push('Problems raised:', '', ...result.verdict.problems.map((problem) => `- ${problem}`), '');
      }
    }
    lines.push('```', renderLines(result.lines), '```');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.list) {
    for (const scenario of SCENARIOS) {
      console.log(`${scenario.id}: ${scenario.title}`);
    }
    return;
  }
  const chosen = SCENARIOS.filter((scenario) => options.only.length === 0 || options.only.includes(scenario.id));
  if (chosen.length === 0) {
    console.log('no scenarios matched');
    return;
  }
  const client = new Anthropic();
  const jobs = chosen.flatMap((scenario) =>
    Array.from({ length: options.runs }, (_, index) => ({ scenario, run: index + 1 })),
  );
  console.log(`running ${jobs.length} runs of ${chosen.length} scenarios, ${options.parallel} at a time`);
  const results = await pool(jobs, options.parallel, async (job) => {
    const result = await runOne(job.scenario, job.run, options, client);
    const failed = result.findings.filter((finding) => !finding.ok).map((finding) => finding.check);
    if (process.env['EVAL_USAGE'] === '1') {
      console.log(JSON.stringify(result.usage));
    }
    console.log(
      `${result.error !== null ? 'ERROR' : result.passed ? 'pass ' : 'FAIL '} ${result.id} #${result.run} ($${result.costUsd.toFixed(3)})${failed.length > 0 ? ` checks: ${failed.join('; ')}` : ''}${result.verdict !== null && !result.verdict.pass ? ` reviewer: ${result.verdict.problems.length} problems` : ''}${result.error !== null ? ` ${result.error}` : ''}`,
    );
    return result;
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join('eval-results', stamp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
  writeFileSync(join(dir, 'report.md'), report(results, options));
  const cost = results.reduce((sum, result) => sum + result.costUsd, 0);
  console.log(
    `\n${results.filter((result) => result.passed).length} of ${results.length} runs passed; cost $${cost.toFixed(2)}; report at ${join(dir, 'report.md')}`,
  );
}

await main();
