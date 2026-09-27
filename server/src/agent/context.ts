import type { StateDescription } from '../domain/describe.ts';
import type { OnboardingEvent, StoredEvent } from '../domain/events.ts';
import type { ModelMessage } from './model.ts';
import type { AgentChannel } from './toolSchemas.ts';

export const HISTORY_LIMIT = 80;
export const USER_TEXT_LIMIT = 4000;

type Role = 'user' | 'assistant';

interface Line {
  role: Role;
  text: string;
}

export function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attribute(value: string | number | boolean): string {
  return escapeText(String(value)).replace(/"/g, '&quot;');
}

export function eventTag(type: string, attributes: Record<string, string | number | boolean> = {}, body = ''): string {
  const rendered = Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${attribute(value)}"`)
    .join('');
  const name = attribute(type);
  return body.length === 0
    ? `<event type="${name}"${rendered}/>`
    : `<event type="${name}"${rendered}>${escapeText(body)}</event>`;
}

function heardOverrides(events: readonly StoredEvent[]): Map<number, string> {
  const overrides = new Map<number, string>();
  for (const stored of events) {
    if (stored.event.type === 'message_heard') {
      overrides.set(stored.event.messageSeq, stored.event.heard);
    }
  }
  return overrides;
}

function renderMessage(
  stored: StoredEvent,
  event: Extract<OnboardingEvent, { type: 'message' }>,
  overrides: Map<number, string>,
): Line[] {
  if (event.role === 'user') {
    const body = escapeText(event.text.slice(0, USER_TEXT_LIMIT));
    return [{ role: 'user', text: `<user_message channel="${event.channel}">${body}</user_message>` }];
  }
  const heard = overrides.get(stored.seq) ?? event.heard;
  if (heard === null || heard === event.text) {
    return [{ role: 'assistant', text: event.text }];
  }
  const note = eventTag(
    'interrupted',
    {},
    heard.trim().length === 0
      ? 'You started to speak but the person heard none of it.'
      : 'The person cut in. They heard only the words shown in your last message.',
  );
  if (heard.trim().length === 0) {
    return [{ role: 'user', text: note }];
  }
  return [
    { role: 'assistant', text: heard },
    { role: 'user', text: note },
  ];
}

function renderEvent(stored: StoredEvent, overrides: Map<number, string>, inCall: boolean): Line[] {
  const event = stored.event;
  switch (event.type) {
    case 'message':
      if (inCall && event.role === 'agent' && event.channel === 'text') {
        return [
          { role: 'assistant', text: event.text },
          {
            role: 'user',
            text: eventTag('delivered_to_thread', {}, 'Your message above was written into the text thread during the call.'),
          },
        ];
      }
      return renderMessage(stored, event, overrides);
    case 'call_offered':
      return [{ role: 'user', text: eventTag('call_ringing') }];
    case 'call_declined':
      return [{ role: 'user', text: eventTag('call_declined', { times_declined: event.declinedCount }) }];
    case 'call_started':
      return [
        {
          role: 'user',
          text: eventTag('call_connected', {
            call_number: event.callNumber,
            first_call: event.callNumber === 1,
          }),
        },
      ];
    case 'call_ended':
      return [
        {
          role: 'user',
          text: eventTag('call_ended', {
            reason: event.reason,
            planned: !event.unplanned,
            callback_requested: event.callbackRequested,
          }),
        },
      ];
    case 'oauth':
      if (event.action === 'connected') {
        return [{ role: 'user', text: eventTag('gmail_connected', { inbox: event.mode ?? 'real' }) }];
      }
      if (event.action === 'failed') {
        return [{ role: 'user', text: eventTag('gmail_connect_failed', { reason: event.reason ?? 'unknown' }) }];
      }
      if (event.action === 'disconnected') {
        return [{ role: 'user', text: eventTag('gmail_disconnected') }];
      }
      return [];
    case 'note':
      return [{ role: 'user', text: eventTag(event.kind, {}, event.detail ?? '') }];
    case 'tool_call':
    case 'message_heard':
      return [];
  }
}

function merge(lines: readonly Line[]): Line[] {
  const merged: Line[] = [];
  for (const line of lines) {
    const last = merged.at(-1);
    if (last !== undefined && last.role === line.role) {
      last.text = `${last.text}\n${line.text}`;
    } else {
      merged.push({ ...line });
    }
  }
  return merged;
}

const CHANNEL_NOTES: Record<AgentChannel, string> = {
  voice:
    'channel for this reply: voice. This will be spoken aloud. Write your reply first, then any tool calls. One or two short sentences, one topic, one question at most, no lists. Anything longer goes in the thread with send_text.',
  text: 'channel for this reply: text. Make any tool calls first, with no text before them, then write your reply once the results are back. Write like a text message.',
};

export function renderState(state: StateDescription, channel: AgentChannel): string {
  return `<state>\n${CHANNEL_NOTES[channel]}\n${state.text}\n</state>`;
}

export function buildMessages(
  events: readonly StoredEvent[],
  state: StateDescription,
  channel: AgentChannel,
): ModelMessage[] {
  const overrides = heardOverrides(events);
  let inCall = false;
  const rendered = events.flatMap((stored) => {
    if (stored.event.type === 'call_started') {
      inCall = true;
    } else if (stored.event.type === 'call_ended') {
      inCall = false;
    }
    return renderEvent(stored, overrides, inCall);
  });
  const recent = rendered.slice(-HISTORY_LIMIT);
  const opening: Line = {
    role: 'user',
    text: eventTag(rendered.length > recent.length ? 'earlier_conversation_trimmed' : 'thread_opened'),
  };
  const lines = merge([opening, ...recent]);
  const last = lines.at(-1);
  if (last === undefined || last.role === 'assistant') {
    lines.push({ role: 'user', text: eventTag('your_turn') });
  }
  const final = lines.at(-1) as Line;
  final.text = `${final.text}\n${renderState(state, channel)}`;
  return lines.map((line) => ({ role: line.role, content: line.text }));
}
