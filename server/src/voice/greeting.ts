import { DEFAULT_AGENT_NAME } from '../domain/fields.ts';
import { hasValue } from '../domain/record.ts';
import type { OnboardingRecord, ProfileFieldName } from '../domain/types.ts';

export interface Greeting {
  text: string;
  asks: ProfileFieldName;
}

const ASK_NAME = [
  (agent: string) => `Hey, it's ${agent}. What should I call you?`,
  (agent: string) => `Hi, it's ${agent}. Who am I speaking with?`,
  (agent: string) => `Hey, ${agent} here. What's your name?`,
];

const ASK_TOPIC = [
  (agent: string, user: string) => `Hey ${user}, it's ${agent}. What can I take off your plate?`,
  (agent: string, user: string) => `Hi ${user}, ${agent} here. What's one thing you'd like off your plate?`,
];

const ASK_TOPIC_NO_NAME = [
  (agent: string) => `Hey, it's ${agent}. What can I take off your plate?`,
  (agent: string) => `Hi, ${agent} here. What's one thing you'd like off your plate?`,
];

function pick<T>(options: readonly T[], roll: number): T {
  const index = Math.min(options.length - 1, Math.max(0, Math.floor(roll * options.length)));
  return options[index] as T;
}

export function openingLine(record: OnboardingRecord, roll: number = Math.random()): Greeting | null {
  if (record.calls.total !== 1) {
    return null;
  }
  const agent = hasValue(record.fields.agentName) ? record.fields.agentName.value : DEFAULT_AGENT_NAME;
  const user = record.fields.userName;
  const topic = record.fields.helpTopic;
  if (!hasValue(user) && user.status === 'empty' && user.askCount < 2) {
    return { text: pick(ASK_NAME, roll)(agent), asks: 'userName' };
  }
  if (hasValue(topic) || topic.status !== 'empty' || topic.askCount >= 2) {
    return null;
  }
  if (hasValue(user)) {
    return { text: pick(ASK_TOPIC, roll)(agent, user.value), asks: 'helpTopic' };
  }
  return { text: pick(ASK_TOPIC_NO_NAME, roll)(agent), asks: 'helpTopic' };
}
