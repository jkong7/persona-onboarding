import Anthropic from '@anthropic-ai/sdk';
import type { Meter } from './meter.ts';
import type { Line, Scenario, Verdict } from './types.ts';

export const SIM_MODEL = 'claude-haiku-4-5';
export const JUDGE_MODEL = 'claude-sonnet-5';
export const DONE = '[[done]]';

const SIM_SYSTEM = `You are playing a real person who is trying out a new AI assistant for the first time. You are not an assistant. Stay in character for the whole conversation.

Write only what this person would type or say next, with no quotation marks, no stage directions and no explanation.

- In a text thread, write like a person texting: short, casual, sometimes lower case, sometimes with a typo.
- On a call, write what they would say out loud, with the hesitations and restarts of real speech.
- Give only the information the character would give at this point. Do not volunteer everything at once unless the character would.
- Follow the character description even when that makes you unhelpful.
- If the character would have nothing more to say and would simply stop replying, write exactly ${DONE}`;

export function renderLines(lines: readonly Line[]): string {
  return lines
    .map((line) => {
      if (line.who === 'event') {
        return `[${line.text}]`;
      }
      const speaker = line.who === 'agent' ? 'ASSISTANT' : 'PERSON';
      const how = line.channel === 'voice' ? 'on the call' : 'by text';
      return `${speaker} (${how}): ${line.text}`;
    })
    .join('\n');
}

function usageOf(message: Anthropic.Message): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

export class SimulatedPerson {
  readonly #client: Anthropic;
  readonly #meter: Meter;

  constructor(client: Anthropic, meter: Meter) {
    this.#client = client;
    this.#meter = meter;
  }

  async next(scenario: Scenario, lines: readonly Line[], onCall: boolean, screen: string[]): Promise<string> {
    const message = await this.#client.messages.create({
      model: SIM_MODEL,
      max_tokens: 300,
      system: `${SIM_SYSTEM}\n\nThe character:\n${scenario.persona}`,
      messages: [
        {
          role: 'user',
          content: [
            `Conversation so far:\n${lines.length === 0 ? '(nothing yet)' : renderLines(lines)}`,
            `Right now the person is ${onCall ? 'on a voice call with the assistant' : 'in the text thread'}.`,
            screen.length === 0 ? '' : `On their screen: ${screen.join('; ')}.`,
            'Write their next message.',
          ]
            .filter((part) => part.length > 0)
            .join('\n\n'),
        },
      ],
    });
    this.#meter.add(SIM_MODEL, usageOf(message));
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')
      .trim();
    return text.length === 0 ? DONE : text;
  }
}

const VERDICT_TOOL: Anthropic.Tool = {
  name: 'submit_verdict',
  description: 'Record the verdict on this conversation.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['natural', 'notFormLike', 'steering', 'handledCurveball', 'reasked', 'pass', 'problems', 'summary'],
    properties: {
      natural: { type: 'integer', description: '1 to 5. Does the assistant sound like a capable friend?' },
      notFormLike: { type: 'integer', description: '1 to 5. 5 means it never felt like filling in a form.' },
      steering: {
        type: 'integer',
        description: '1 to 5. 5 means it kept things on track gently, without nagging or lecturing.',
      },
      handledCurveball: {
        type: 'integer',
        description: '1 to 5. How well it handled the difficult thing this scenario is about.',
      },
      reasked: {
        type: 'boolean',
        description: 'True if the assistant asked for something the person had already given.',
      },
      pass: { type: 'boolean', description: 'True only if every criterion in the list is met.' },
      problems: {
        type: 'array',
        items: { type: 'string' },
        description: 'Each concrete problem, quoting the assistant line it refers to. Empty if none.',
      },
      summary: { type: 'string', description: 'Two sentences at most.' },
    },
  },
};

const JUDGE_SYSTEM = `You review conversations between an AI assistant and a person meeting it for the first time. The assistant's job is to get the person set up without it ever feeling like setup: it should learn what to call itself, what to call the person, what they want help with, and connect an inbox, while being useful and good company.

You are a strict reviewer. A conversation passes only if every listed criterion is met. Judge the assistant, never the person: the person may be rude, unhelpful or adversarial on purpose.

Lines in square brackets are events, such as a call connecting or dropping. "On the call" lines were spoken aloud, so they should be short and plain.

Do not penalise the assistant for saying it cannot send email, cancel things or make purchases: in this build it cannot, and saying so is correct.`;

function clampScore(value: unknown): number {
  const parsed = typeof value === 'number' ? Math.round(value) : 0;
  return Math.min(5, Math.max(1, parsed));
}

export class Judge {
  readonly #client: Anthropic;
  readonly #meter: Meter;

  constructor(client: Anthropic, meter: Meter) {
    this.#client = client;
    this.#meter = meter;
  }

  async review(scenario: Scenario, lines: readonly Line[], finalState: string): Promise<Verdict | null> {
    const message = await this.#client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: 2000,
      system: JUDGE_SYSTEM,
      tools: [VERDICT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_verdict' },
      messages: [
        {
          role: 'user',
          content: [
            `Scenario: ${scenario.title}`,
            `Criteria:\n${scenario.rubric.map((item, index) => `${index + 1}. ${item}`).join('\n')}`,
            `Conversation:\n${renderLines(lines)}`,
            `What the assistant had saved at the end:\n${finalState}`,
          ].join('\n\n'),
        },
      ],
    });
    this.#meter.add(JUDGE_MODEL, usageOf(message));
    const call = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
    if (call === undefined || typeof call.input !== 'object' || call.input === null) {
      return null;
    }
    const input = call.input as Record<string, unknown>;
    const problems = Array.isArray(input['problems'])
      ? input['problems'].filter((item): item is string => typeof item === 'string')
      : [];
    return {
      natural: clampScore(input['natural']),
      notFormLike: clampScore(input['notFormLike']),
      steering: clampScore(input['steering']),
      handledCurveball: clampScore(input['handledCurveball']),
      reasked: input['reasked'] === true,
      pass: input['pass'] === true,
      problems,
      summary: typeof input['summary'] === 'string' ? input['summary'].replace(/<\/?[a-z_]+>[\s\S]*$/i, '').trim() : '',
    };
  }
}
