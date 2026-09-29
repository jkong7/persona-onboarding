import { AnthropicModel, modelOptionsFromEnv } from '../src/agent/anthropicModel.ts';
import { runTurn } from '../src/agent/turn.ts';
import { firstText } from '../src/http/firstText.ts';
import { SampleInbox } from '../src/inbox/provider.ts';
import { openDatabase } from '../src/store/database.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';

const SCRIPTS: Record<string, string[]> = {
  inbox: [
    'max. no calls pls, im at work',
    'i keep missing recruiter emails',
    'what can you see if i connect it',
    'ok use the sample one',
    'draft a reply to the one waiting on interview times',
    'thanks thats all',
  ],
  bills: [
    'idk whatever. dont call me',
    'i need help getting on top of my bills',
    'mostly power and phone, i always pay late',
    'can you just pay them for me',
    'fine what should i do first',
    'im rosa btw',
  ],
  vague: ['hi', 'what is this', 'idk what id use it for', 'lol ok', 'sam', 'nah not now'],
};

const model = new AnthropicModel(modelOptionsFromEnv());
const service = new OnboardingService(openDatabase(':memory:'));
const id = service.create().id;
const opening = firstText(0);
service.logMessage(id, { role: 'agent', channel: 'text', text: opening, callId: null });
service.callTool(id, { name: 'record_ask', input: { field: 'agentName' }, channel: 'text' });
console.log(`> ${opening.replace(/\n\n/g, '\n> ')}`);

function words(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

const counts: number[] = [];
for (const text of SCRIPTS[process.env['PROBE_SCRIPT'] ?? 'inbox'] ?? []) {
  const result = await runTurn(service, model, {
    onboardingId: id,
    channel: 'text',
    trigger: { type: 'user_message', text },
    realGmail: process.env['PROBE_REAL_GMAIL'] === '1',
    inbox: (record) => (record.fields.gmail.mode === 'sample' ? new SampleInbox() : null),
  });
  if (service.get(id).calls.ringing) {
    service.declineCall(id);
  }
  counts.push(words(result.text));
  console.log(`\n< ${text}`);
  console.log(`> ${result.text.replace(/\n\n/g, '\n> ')}`);
  console.log(
    `  ${words(result.text)} words, ${result.text.split('\n\n').length} bubbles, ${(result.text.match(/\?/g) ?? []).length} questions, ${result.totalMs} ms, tools [${result.tools.map((tool) => `${tool.name}${tool.result.ok === true ? '' : '!'}`).join(',')}]`,
  );
}
console.log(`\nwords per reply: ${counts.join(', ')}`);
