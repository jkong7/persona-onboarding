import type { ToolName } from '../domain/tools/index.ts';
import type { ModelTool } from './model.ts';

export type AgentChannel = 'voice' | 'text';

const PROFILE_FIELDS = ['agentName', 'userName', 'helpTopic'];
const ALL_FIELDS = ['agentName', 'userName', 'helpTopic', 'gmail'];

const SCHEMAS: Record<ToolName, ModelTool> = {
  update_profile: {
    name: 'update_profile',
    description:
      'Record what the person just told you. Call it the moment you hear something usable, before anything else, because a call can drop at any second and only recorded values survive. One call can carry several updates in any order. Use op "set" for a new value or a correction, "confirm" once they agree with a name you read back, and "clear" when they take something back. The value is stored exactly as given, so pass their words and not your interpretation of them. This cannot set gmail: only Google can.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['updates'],
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'op', 'value'],
            properties: {
              field: { type: 'string', enum: PROFILE_FIELDS },
              op: { type: 'string', enum: ['set', 'confirm', 'clear'] },
              value: {
                type: ['string', 'null'],
                description: 'The value for "set". Null for "confirm" and "clear".',
              },
            },
          },
        },
      },
    },
  },
  defer_field: {
    name: 'defer_field',
    description:
      'Record that the person does not want to give something right now. Use "deferred" for later or not now, and "declined" for a clear no. After this the item is settled and you stop asking for it.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['field', 'kind'],
      properties: {
        field: { type: 'string', enum: ALL_FIELDS },
        kind: { type: 'string', enum: ['deferred', 'declined'] },
      },
    },
  },
  record_ask: {
    name: 'record_ask',
    description:
      'Note that your reply asks the person for agentName, userName or helpTopic. Call it only when your reply contains that question, and only for the one thing you asked. It keeps count so nobody gets asked the same thing over and over. Reading a name back to check it is not an ask. For Gmail use offer_gmail_connect, which counts on its own.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['field'],
      properties: {
        field: { type: 'string', enum: PROFILE_FIELDS },
      },
    },
  },
  offer_gmail_connect: {
    name: 'offer_gmail_connect',
    description:
      'Put the Connect Gmail button on the person\'s screen. You cannot open the Google window yourself: they have to press the button. Call this once, in the same reply where you explain why you are asking. The button stays on screen afterwards, so do not call it again unless they ask to connect. Set userRequested to true only when they asked to connect. The result of their choice arrives later as an event.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['userRequested'],
      properties: {
        userRequested: { type: 'boolean' },
      },
    },
  },
  use_sample_inbox: {
    name: 'use_sample_inbox',
    description:
      'Switch the person to the sample inbox, a set of made-up emails that shows how you work without touching their own mail. Use it when they say they would rather not connect a real account, or ask for the sample.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
  graduate: {
    name: 'graduate',
    description:
      'Move the person into the main experience. The server allows it once there is a help topic, or when they ask to skip ahead. Set userRequestedSkip to true only when they asked to skip or get started. The result lists what is still outstanding so you can mention it once, lightly, and move on.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['userRequestedSkip'],
      properties: {
        userRequestedSkip: { type: 'boolean' },
      },
    },
  },
  place_call: {
    name: 'place_call',
    description:
      'Ring the person from the text thread. Their screen shows an incoming call they can accept or decline. Say you are about to call in the same reply. Set userRequested to true only when they asked for a call. It does nothing while a call is already in progress.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['userRequested'],
      properties: {
        userRequested: { type: 'boolean' },
      },
    },
  },
  end_call: {
    name: 'end_call',
    description:
      'Hang up the call in progress. Say goodbye in the same reply, because nothing you say after this is heard. Use "completed" when the call has done its job, "callback_later" when they asked you to call back another time, and "switch_to_text" when they would rather type. It does nothing when no call is in progress.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['intent'],
      properties: {
        intent: { type: 'string', enum: ['completed', 'callback_later', 'switch_to_text'] },
      },
    },
  },
};

export const SEND_TEXT_TOOL: ModelTool = {
  name: 'send_text',
  description:
    'During a call, put a written message in the text thread. Use it for anything that is better read than heard: a draft reply, a list, an address, exact figures. Say aloud that you have put it in the thread. It only works while a call is in progress; in the thread itself, just write your reply.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text'],
    properties: {
      text: { type: 'string' },
    },
  },
};

const RECORD_TOOL_ORDER: ToolName[] = [
  'update_profile',
  'defer_field',
  'record_ask',
  'offer_gmail_connect',
  'use_sample_inbox',
  'graduate',
  'place_call',
  'end_call',
];

export const RECORD_TOOLS: ModelTool[] = RECORD_TOOL_ORDER.map((name) => SCHEMAS[name]);

export const WAIT_TOOL: ModelTool = {
  name: 'wait_quietly',
  description:
    'Stay on the call and say nothing. Use it when the person has asked for a moment, is looking for something, or is talking to someone else, and an event tells you they have gone quiet. Write no text in that reply.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['reason'],
    properties: {
      reason: { type: 'string' },
    },
  },
};

export function toolsFor(): ModelTool[] {
  return [...RECORD_TOOLS, SEND_TEXT_TOOL, WAIT_TOOL];
}
