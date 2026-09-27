import { resolve } from 'node:path';

export const DEFAULT_DATABASE_PATH = 'data/onboarding.db';

export function databasePath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env['DATABASE_PATH']?.trim();
  if (configured === ':memory:') {
    return configured;
  }
  return resolve(configured && configured.length > 0 ? configured : DEFAULT_DATABASE_PATH);
}
