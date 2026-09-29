import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Database } from '../store/database.ts';

export interface StoredTokens {
  account: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
}

interface Row {
  ciphertext: string;
  iv: string;
  tag: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS gmail_tokens (
  onboarding_id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

function isStoredTokens(value: unknown): value is StoredTokens {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const tokens = value as Record<string, unknown>;
  return (
    typeof tokens['account'] === 'string' &&
    typeof tokens['accessToken'] === 'string' &&
    (typeof tokens['refreshToken'] === 'string' || tokens['refreshToken'] === null) &&
    typeof tokens['expiresAt'] === 'number' &&
    typeof tokens['scope'] === 'string'
  );
}

export class TokenVault {
  readonly #db: Database;
  readonly #key: Buffer;

  constructor(db: Database, key: Buffer) {
    if (key.length !== 32) {
      throw new Error('the token encryption key must be 32 bytes');
    }
    this.#db = db;
    this.#key = key;
    db.exec(SCHEMA);
  }

  save(onboardingId: string, tokens: StoredTokens, now: string): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    cipher.setAAD(Buffer.from(onboardingId, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
    this.#db
      .prepare(
        `INSERT INTO gmail_tokens (onboarding_id, ciphertext, iv, tag, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(onboarding_id) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, updated_at = excluded.updated_at`,
      )
      .run(
        onboardingId,
        ciphertext.toString('base64'),
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        now,
      );
  }

  load(onboardingId: string): StoredTokens | null {
    const row = this.#db
      .prepare('SELECT ciphertext, iv, tag FROM gmail_tokens WHERE onboarding_id = ?')
      .get(onboardingId) as Row | undefined;
    if (row === undefined) {
      return null;
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.#key, Buffer.from(row.iv, 'base64'));
      decipher.setAAD(Buffer.from(onboardingId, 'utf8'));
      decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(row.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const parsed: unknown = JSON.parse(plain);
      return isStoredTokens(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  remove(onboardingId: string): void {
    this.#db.prepare('DELETE FROM gmail_tokens WHERE onboarding_id = ?').run(onboardingId);
  }
}
