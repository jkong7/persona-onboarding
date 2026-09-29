import type { TranscriptEntry } from './events.ts';
import type { OnboardingRecord } from './types.ts';

const MAX_NAME_WORDS = 4;

function hasCase(letter: string): boolean {
  return letter.toLowerCase() !== letter.toUpperCase();
}

export function looksMisheard(value: string): boolean {
  const name = value.trim();
  const letters = Array.from(name).filter((char) => /\p{L}/u.test(char));
  const first = letters[0];
  if (first === undefined || /\p{N}/u.test(name)) {
    return true;
  }
  if (hasCase(first) && (letters.length < 2 || first === first.toLowerCase())) {
    return true;
  }
  return name.split(/\s+/).length > MAX_NAME_WORDS;
}

const CORRECTION = /\b(no|nope|nah|not|wrong|actually|sorry|spelled|spelt|spelling|name|called|it's|its|i'm|im)\b/i;

export function soundsLikeCorrection(utterance: string): boolean {
  return CORRECTION.test(utterance);
}

export function nameTheyHeard(record: OnboardingRecord, transcript: readonly TranscriptEntry[]): string | null {
  const field = record.fields.userName;
  if (field.status !== 'provisional' || field.value === null || field.updatedAt === null) {
    return null;
  }
  if (looksMisheard(field.value)) {
    return null;
  }
  const name = field.value.toLowerCase();
  const since = Date.parse(field.updatedAt);
  const spoken = transcript.some(
    (entry) =>
      entry.role === 'agent' &&
      Date.parse(entry.createdAt) >= since &&
      entry.text.toLowerCase().includes(name),
  );
  return spoken ? field.value : null;
}
