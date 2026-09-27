import type { CallBookkeeping, OnboardingFields, OnboardingRecord, Phase } from '../domain/types.ts';
import type { Database } from './database.ts';
import { OnboardingNotFoundError, VersionConflictError } from './errors.ts';

interface RecordData {
  skipRequested: boolean;
  fields: OnboardingFields;
  calls: CallBookkeeping;
  graduatedAt: string | null;
}

interface RecordRow {
  id: string;
  version: number;
  phase: string;
  data: string;
  created_at: string;
  updated_at: string;
}

function toData(record: OnboardingRecord): string {
  const data: RecordData = {
    skipRequested: record.skipRequested,
    fields: record.fields,
    calls: record.calls,
    graduatedAt: record.graduatedAt,
  };
  return JSON.stringify(data);
}

function fromRow(row: RecordRow): OnboardingRecord {
  const data = JSON.parse(row.data) as RecordData;
  return {
    id: row.id,
    version: row.version,
    phase: row.phase as Phase,
    skipRequested: data.skipRequested,
    fields: data.fields,
    calls: data.calls,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    graduatedAt: data.graduatedAt,
  };
}

export class RecordStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  insert(record: OnboardingRecord): OnboardingRecord {
    const stored: OnboardingRecord = { ...record, version: 1 };
    this.#db
      .prepare(
        'INSERT INTO onboardings (id, version, phase, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(stored.id, stored.version, stored.phase, toData(stored), stored.createdAt, stored.updatedAt);
    return stored;
  }

  find(id: string): OnboardingRecord | null {
    const row = this.#db
      .prepare('SELECT id, version, phase, data, created_at, updated_at FROM onboardings WHERE id = ?')
      .get(id) as RecordRow | undefined;
    return row === undefined ? null : fromRow(row);
  }

  require(id: string): OnboardingRecord {
    const record = this.find(id);
    if (record === null) {
      throw new OnboardingNotFoundError(id);
    }
    return record;
  }

  save(record: OnboardingRecord, expectedVersion: number): OnboardingRecord {
    const stored: OnboardingRecord = { ...record, version: expectedVersion + 1 };
    const outcome = this.#db
      .prepare(
        'UPDATE onboardings SET version = ?, phase = ?, data = ?, updated_at = ? WHERE id = ? AND version = ?',
      )
      .run(stored.version, stored.phase, toData(stored), stored.updatedAt, stored.id, expectedVersion);
    if (Number(outcome.changes) === 1) {
      return stored;
    }
    const current = this.find(record.id);
    if (current === null) {
      throw new OnboardingNotFoundError(record.id);
    }
    throw new VersionConflictError(record.id, expectedVersion, current.version);
  }
}
