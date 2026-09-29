import { DEFAULT_AGENT_NAME } from '../domain/fields.ts';

const FIRST_TEXTS = [
  `Hi, I'm your new assistant. I read your email, tell you what matters, and draft the replies you keep putting off.\n\nWhat would you like to call me? ${DEFAULT_AGENT_NAME} is fine if nothing comes to mind.`,
  `Hey, good to meet you. I'm the assistant you can text or call to get email and life admin off your plate.\n\nWhat do you want to call me? ${DEFAULT_AGENT_NAME} works if you'd rather not pick.`,
  `Hi there. I'm your assistant for email and the small jobs that pile up.\n\nWhat should I go by? Name me anything you like, or just keep ${DEFAULT_AGENT_NAME}.`,
];

export function firstText(roll: number = Math.random()): string {
  const index = Math.min(FIRST_TEXTS.length - 1, Math.max(0, Math.floor(roll * FIRST_TEXTS.length)));
  return FIRST_TEXTS[index] as string;
}
