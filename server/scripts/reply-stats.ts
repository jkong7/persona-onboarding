import { DatabaseSync } from 'node:sqlite';

const since = process.argv[2] ?? '2026-09-28T10:25:00Z';
const db = new DatabaseSync(process.env['DATABASE_PATH'] ?? 'data/onboarding.db', { readOnly: true });
const rows = db
  .prepare("SELECT payload FROM events WHERE type = 'message' AND created_at >= ? ORDER BY seq")
  .all(since) as unknown as { payload: string }[];
db.close();

function words(text: string): number {
  return text.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

for (const channel of ['voice', 'text']) {
  const replies = rows
    .map((row) => JSON.parse(row.payload) as { role: string; channel: string; text: string })
    .filter((event) => event.role === 'agent' && event.channel === channel);
  const lengths = replies.map((reply) => words(reply.text));
  const perSentence = replies.flatMap((reply) => sentences(reply.text).map(words));
  const questions = replies.filter((reply) => reply.text.includes('?')).length;
  console.log(
    `${channel}: ${replies.length} replies | words per reply median ${quantile(lengths, 0.5)}, p90 ${quantile(lengths, 0.9)}, max ${Math.max(0, ...lengths)} | words per sentence median ${quantile(perSentence, 0.5)}, p90 ${quantile(perSentence, 0.9)}, max ${Math.max(0, ...perSentence)} | ends or contains a question ${Math.round((100 * questions) / Math.max(1, replies.length))}%`,
  );
  const longest = [...replies].sort((left, right) => words(right.text) - words(left.text)).slice(0, 4);
  for (const reply of longest) {
    console.log(`   ${words(reply.text)}w: ${reply.text.replace(/\s+/g, ' ').slice(0, 420)}`);
  }
}
