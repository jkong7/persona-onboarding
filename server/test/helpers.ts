import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecord } from '../src/domain/record.ts';
import type { Channel, OnboardingRecord, ToolContext } from '../src/domain/types.ts';
import { openDatabase, type Database } from '../src/store/database.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';

export const T0 = '2026-09-27T18:00:00.000Z';
export const T1 = '2026-09-27T18:00:05.000Z';
export const T2 = '2026-09-27T18:00:10.000Z';

export function freshRecord(id = 'onb_test'): OnboardingRecord {
  return { ...createRecord(id, T0), version: 1 };
}

export function ctx(channel: Channel, now: string = T1): ToolContext {
  return { channel, now };
}

export function tickingClock(start = Date.parse(T0)): () => string {
  let tick = 0;
  return () => new Date(start + 1000 * tick++).toISOString();
}

export function sequentialIds(prefix = 'onb'): () => string {
  let next = 1;
  return () => `${prefix}_${next++}`;
}

export interface MemoryHarness {
  db: Database;
  service: OnboardingService;
}

export function memoryService(): MemoryHarness {
  const db = openDatabase(':memory:');
  const service = new OnboardingService(db, { clock: tickingClock(), newId: sequentialIds() });
  return { db, service };
}

export interface TempDatabase {
  path: string;
  cleanup: () => void;
}

export function tempDatabase(): TempDatabase {
  const dir = mkdtempSync(join(tmpdir(), 'persona-onboarding-'));
  return {
    path: join(dir, 'onboarding.db'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
