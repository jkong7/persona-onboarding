import { AnthropicModel } from '../src/agent/anthropicModel.ts';
import { runTurn } from '../src/agent/turn.ts';
import { serverConfig } from '../src/http/server.ts';
import { SampleInbox } from '../src/inbox/provider.ts';
import { openDatabase } from '../src/store/database.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';

const modelId = process.argv[2] ?? 'claude-haiku-4-5';
const model = new AnthropicModel(
  process.argv[3] === 'server'
    ? serverConfig({ ...process.env, AGENT_VOICE_MODEL: modelId }).voice
    : {
        model: modelId,
        effort: 'low',
        thinking: process.argv[3] === 'adaptive' || process.argv[3] === 'disabled' ? process.argv[3] : 'unset',
        maxTokens: 1000,
      },
);
if (process.argv[3] === 'server') {
  const { model: name, effort, thinking, maxTokens, fallbackModel } = serverConfig({ ...process.env, AGENT_VOICE_MODEL: modelId }).voice;
  console.log(JSON.stringify({ name, effort, thinking, maxTokens, fallbackModel }));
}
const raw = process.env['PROBE_RAW'] === '1';
const watched = {
  respond: async (request: Parameters<AnthropicModel['respond']>[0]) => {
    const response = await model.respond(request);
    if (raw) {
      const parts = response.content.map((block) =>
        block.type === 'text' ? `text(${JSON.stringify(block.text)})` : block.type === 'tool_use' ? `tool(${block.name})` : block.type,
      );
      console.log(`  raw: ${parts.join(' ')}`);
    }
    return response;
  },
};
const SCRIPTS: Record<string, string[]> = {
  inbox: [
    "It's Jonathan.",
    'Honestly I keep missing emails from recruiters, they get buried.',
    'What can you see if I connect it?',
    'Okay, use the sample inbox.',
    'Draft a reply to the one who is waiting on interview times.',
    "That's all for now, bye.",
  ],
  bills: [
    "I'm Rosa.",
    'I need help getting on top of my bills.',
    'Mostly my power bill and my phone bill, I always pay them late.',
    'Can you just pay them for me?',
    'Fine. What should I do first?',
    'Okay thanks, talk later.',
  ],
  skip: [
    "Look, I don't want to answer a bunch of questions. Can I just start using this?",
    'No, nothing specific right now. Just let me in.',
    'Okay, bye.',
  ],
  trip: [
    "I'm Alexander. I want help planning a trip to Lisbon.",
    'Actually, just call me Lex. And forget the trip, I need help chasing a refund from an airline.',
    'Hang on, what was that about Google?',
    'No thanks, not right now.',
    'They cancelled my flight in June and still owe me four hundred dollars.',
    'Bye.',
  ],
  vague: [
    'Uh, hi.',
    "I don't know, what do people usually use you for?",
    'Hmm. I guess email is a mess.',
    "I'm Sam by the way.",
    'Not right now, maybe later.',
    'Bye.',
  ],
};
const lines = SCRIPTS[process.env['PROBE_SCRIPT'] ?? 'inbox'] ?? [];

const service = new OnboardingService(openDatabase(':memory:'));
const id = service.create().id;
service.callTool(id, {
  name: 'update_profile',
  input: { updates: [{ field: 'agentName', value: 'Max', confirmed: true }] },
  channel: 'text',
});
service.startCall(id, 'call_1');
service.logMessage(id, { role: 'agent', channel: 'voice', text: "Hey, it's Max. What should I call you?", callId: 'call_1' });
for (const text of lines) {
  const result = await runTurn(service, watched, {
    onboardingId: id,
    channel: 'voice',
    callId: 'call_1',
    trigger: { type: 'user_message', text },
    realGmail: process.env['PROBE_REAL_GMAIL'] === '1',
    inbox: (record) => (record.fields.gmail.mode === 'sample' ? new SampleInbox() : null),
  });
  const tools = result.tools.map((tool) => `${tool.name}${tool.result.ok === true ? '' : '!'}`).join(',');
  console.log(`\n< ${text}`);
  console.log(`> ${result.text}`);
  console.log(
    `  model ${Math.round(result.firstTextMs ?? -1)} ms, first word ${result.firstWordMs} ms, total ${result.totalMs} ms, steps [${result.stepMs.join(', ')}], tools [${tools}]`,
  );
}
const thread = service.transcript(id).filter((entry) => entry.channel === 'text');
for (const entry of thread) {
  console.log(`\n[thread] ${entry.text}`);
}
console.log(`\n${service.describe(id, 'voice').text}`);
