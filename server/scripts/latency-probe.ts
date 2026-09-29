import Anthropic from '@anthropic-ai/sdk';
import { buildMessages } from '../src/agent/context.ts';
import { INBOX_TOOLS } from '../src/agent/inboxTools.ts';
import { VOICE_INSTRUCTIONS } from '../src/agent/instructions.ts';
import { toolsFor } from '../src/agent/toolSchemas.ts';
import { openDatabase } from '../src/store/database.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';

const client = new Anthropic();
const tools = [...toolsFor(), ...INBOX_TOOLS] as Anthropic.Tool[];
const strictOff = process.argv[2] === 'loose';
const sent = strictOff ? tools.map(({ strict: _strict, ...rest }: Anthropic.Tool & { strict?: boolean }) => rest) : tools;

const service = new OnboardingService(openDatabase(':memory:'));
const id = service.create().id;
service.logMessage(id, { role: 'agent', channel: 'text', text: "Hi, I'm your new assistant. What would you like to call me?", callId: null });
service.logMessage(id, { role: 'user', channel: 'text', text: 'call yourself Max', callId: null });
service.callTool(id, { name: 'update_profile', input: { updates: [{ field: 'agentName', value: 'Max', confirmed: true }] }, channel: 'text' });
service.logMessage(id, { role: 'agent', channel: 'text', text: "Max it is. I'm calling you now.", callId: null });
service.startCall(id, 'call_1');
service.logMessage(id, { role: 'agent', channel: 'voice', text: "Hey, it's Max. What should I call you?", callId: 'call_1' });

const lines = ["It's Jonathan.", 'Honestly I keep missing emails from recruiters, they get buried.', 'What can you see in my email?', 'Do you ever dream?'];
for (const line of lines) {
  service.logMessage(id, { role: 'user', channel: 'voice', text: line, callId: 'call_1' });
  const messages = buildMessages(service.events(id), service.describe(id, 'voice'), 'voice', null) as Anthropic.MessageParam[];
  const started = performance.now();
  const marks: string[] = [];
  const stream = await client.messages.create({
    model: process.argv[3] ?? 'claude-haiku-4-5',
    ...(process.argv[4] === undefined ? {} : { output_config: { effort: process.argv[4] as 'low' } }),
    max_tokens: 1000,
    stream: true,
    system: [{ type: 'text', text: VOICE_INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
    messages,
    tools: sent as Anthropic.Tool[],
  });
  let text = '';
  let firstDelta = true;
  for await (const event of stream) {
    const at = Math.round(performance.now() - started);
    if (event.type === 'message_start') {
      marks.push(`start ${at}`);
    } else if (event.type === 'content_block_start') {
      marks.push(`${event.content_block.type} ${at}`);
    } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      if (firstDelta) {
        firstDelta = false;
        marks.push(`first text ${at}`);
      }
      text += event.delta.text;
    } else if (event.type === 'message_stop') {
      marks.push(`stop ${at}`);
    }
  }
  console.log(marks.join(' | '));
  console.log(`   > ${text}`);
  service.logMessage(id, { role: 'agent', channel: 'voice', text, callId: 'call_1' });
}
