import { DatabaseSync } from 'node:sqlite';

const id = process.argv[2] ?? '';
const db = new DatabaseSync(process.env['DATABASE_PATH'] ?? 'data/onboarding.db', { readOnly: true });
const rows = db
  .prepare(
    id.length > 0
      ? 'SELECT seq, payload FROM events WHERE onboarding_id = ? ORDER BY seq'
      : 'SELECT seq, payload FROM events WHERE onboarding_id = (SELECT onboarding_id FROM events ORDER BY seq DESC LIMIT 1) ORDER BY seq',
  )
  .all(...(id.length > 0 ? [id] : [])) as unknown as { seq: number; payload: string }[];
for (const row of rows) {
  const event = JSON.parse(row.payload) as Record<string, unknown>;
  if (event['type'] === 'message') {
    console.log(`${row.seq} ${String(event['role'])}/${String(event['channel'])}: ${String(event['text'])}`);
  } else if (event['type'] === 'tool_call') {
    const result = event['result'] as { ok?: unknown; reason?: unknown } | null;
    console.log(`${row.seq}   tool ${String(event['name'])} ${JSON.stringify(event['input']).slice(0, 160)} -> ${result?.ok === true ? 'ok' : `rejected (${String(result?.reason)})`}`);
  } else {
    console.log(`${row.seq}   ${String(event['type'])} ${JSON.stringify(event).slice(0, 140)}`);
  }
}
db.close();
