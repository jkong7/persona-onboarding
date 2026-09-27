import { buildTranscript, type OnboardingEvent, type StoredEvent, type TranscriptEntry } from '../domain/events.ts';
import type { Database } from './database.ts';

interface EventRow {
  seq: number;
  onboarding_id: string;
  payload: string;
  created_at: string;
}

function fromRow(row: EventRow): StoredEvent {
  return {
    seq: Number(row.seq),
    onboardingId: row.onboarding_id,
    createdAt: row.created_at,
    event: JSON.parse(row.payload) as OnboardingEvent,
  };
}

export class EventLog {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  append<E extends OnboardingEvent>(onboardingId: string, event: E, now: string): StoredEvent<E> {
    const outcome = this.#db
      .prepare('INSERT INTO events (onboarding_id, type, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(onboardingId, event.type, JSON.stringify(event), now);
    return { seq: Number(outcome.lastInsertRowid), onboardingId, createdAt: now, event };
  }

  find(onboardingId: string, seq: number): StoredEvent | null {
    const row = this.#db
      .prepare('SELECT seq, onboarding_id, payload, created_at FROM events WHERE onboarding_id = ? AND seq = ?')
      .get(onboardingId, seq) as EventRow | undefined;
    return row === undefined ? null : fromRow(row);
  }

  list(onboardingId: string, afterSeq = 0): StoredEvent[] {
    const rows = this.#db
      .prepare(
        'SELECT seq, onboarding_id, payload, created_at FROM events WHERE onboarding_id = ? AND seq > ? ORDER BY seq ASC',
      )
      .all(onboardingId, afterSeq) as unknown as EventRow[];
    return rows.map(fromRow);
  }

  transcript(onboardingId: string): TranscriptEntry[] {
    return buildTranscript(this.list(onboardingId));
  }
}
