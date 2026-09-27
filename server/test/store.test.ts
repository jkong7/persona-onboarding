import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databasePath } from '../src/config.ts';
import { createRecord } from '../src/domain/record.ts';
import { updateProfile } from '../src/domain/tools/updateProfile.ts';
import { openDatabase, type Database } from '../src/store/database.ts';
import { OnboardingNotFoundError, VersionConflictError } from '../src/store/errors.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';
import { RecordStore } from '../src/store/recordStore.ts';
import { ctx, memoryService, sequentialIds, T0, tempDatabase, tickingClock, type TempDatabase } from './helpers.ts';

describe('record store', () => {
  it('starts a record at version 1 and increments on every write', () => {
    const { service } = memoryService();
    const created = service.create();
    const first = service.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', value: 'Moss' }] },
      channel: 'text',
    });
    const second = service.callTool(created.id, {
      name: 'record_ask',
      input: { field: 'userName' },
      channel: 'text',
    });

    expect(created.version).toBe(1);
    expect(first.record.version).toBe(2);
    expect(second.record.version).toBe(3);
    expect(service.get(created.id).version).toBe(3);
  });

  it('does not bump the version when a tool changes nothing', () => {
    const { service } = memoryService();
    const created = service.create();
    const rejected = service.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'gmail', value: 'connected' }] },
      channel: 'voice',
    });

    expect(rejected.changed).toBe(false);
    expect(rejected.record.version).toBe(1);
    expect(service.get(created.id).version).toBe(1);
    expect(service.events(created.id).map((stored) => stored.event.type)).toEqual(['tool_call']);
  });

  it('keys the record by onboarding id across several calls', () => {
    const { service } = memoryService();
    const created = service.create();
    service.startCall(created.id, 'call_a');
    service.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'userName', value: 'Jon' }] },
      channel: 'voice',
    });
    service.endCall(created.id, { callId: 'call_a', reason: 'user_hangup' });
    service.startCall(created.id, 'call_b');
    const second = service.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'helpTopic', value: 'plan a trip' }] },
      channel: 'voice',
    });

    expect(second.record.id).toBe(created.id);
    expect(second.record.fields.userName.value).toBe('Jon');
    expect(second.record.fields.helpTopic.value).toBe('plan a trip');
    expect(second.record.calls.total).toBe(2);
  });

  it('throws for an unknown onboarding id', () => {
    const { service } = memoryService();
    expect(() => service.get('missing')).toThrow(OnboardingNotFoundError);
    expect(() =>
      service.callTool('missing', { name: 'graduate', input: {}, channel: 'text' }),
    ).toThrow(OnboardingNotFoundError);
    expect(service.find('missing')).toBeNull();
  });

  it('reads the database path from the environment with a default under data', () => {
    expect(databasePath({})).toMatch(/\/data\/onboarding\.db$/);
    expect(databasePath({ DATABASE_PATH: '  ' })).toMatch(/\/data\/onboarding\.db$/);
    expect(databasePath({ DATABASE_PATH: '/tmp/custom/o.db' })).toBe('/tmp/custom/o.db');
    expect(databasePath({ DATABASE_PATH: ':memory:' })).toBe(':memory:');
  });
});

describe('version conflicts', () => {
  let temp: TempDatabase;
  let first: Database;
  let second: Database;

  beforeEach(() => {
    temp = tempDatabase();
    first = openDatabase(temp.path);
    second = openDatabase(temp.path);
  });

  afterEach(() => {
    first.close();
    second.close();
    temp.cleanup();
  });

  it('rejects a write based on a stale copy of the record', () => {
    const tabOne = new RecordStore(first);
    const tabTwo = new RecordStore(second);
    const created = tabOne.insert(createRecord('onb_conflict', T0));
    const seenByOne = tabOne.require(created.id);
    const seenByTwo = tabTwo.require(created.id);

    const writeOne = updateProfile(seenByOne, { updates: [{ field: 'userName', value: 'Jon' }] }, ctx('text'));
    const writeTwo = updateProfile(seenByTwo, { updates: [{ field: 'userName', value: 'Jonathan' }] }, ctx('text'));
    const saved = tabOne.save(writeOne.record, seenByOne.version);

    expect(saved.version).toBe(2);
    expect(() => tabTwo.save(writeTwo.record, seenByTwo.version)).toThrow(VersionConflictError);
    expect(tabTwo.require(created.id).fields.userName.value).toBe('Jon');
    expect(tabTwo.require(created.id).version).toBe(2);
  });

  it('reports the expected and actual versions', () => {
    const store = new RecordStore(first);
    const created = store.insert(createRecord('onb_conflict', T0));
    store.save(created, 1);

    try {
      store.save(created, 1);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(VersionConflictError);
      expect(error).toMatchObject({ onboardingId: 'onb_conflict', expectedVersion: 1, actualVersion: 2 });
    }
  });

  it('rejects a service call that names a stale version and writes nothing', () => {
    const tabOne = new OnboardingService(first, { clock: tickingClock(), newId: sequentialIds() });
    const tabTwo = new OnboardingService(second, { clock: tickingClock(), newId: sequentialIds('other') });
    const created = tabOne.create();
    tabOne.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', value: 'Moss' }] },
      channel: 'text',
      expectedVersion: 1,
    });

    expect(() =>
      tabTwo.callTool(created.id, {
        name: 'update_profile',
        input: { updates: [{ field: 'agentName', value: 'Max' }] },
        channel: 'text',
        expectedVersion: 1,
      }),
    ).toThrow(VersionConflictError);

    const latest = tabTwo.get(created.id);
    expect(latest.fields.agentName.value).toBe('Moss');
    expect(latest.version).toBe(2);
    expect(tabTwo.events(created.id)).toHaveLength(1);

    const retried = tabTwo.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', value: 'Max' }] },
      channel: 'text',
      expectedVersion: latest.version,
    });
    expect(retried.record.version).toBe(3);
    expect(retried.record.fields.agentName.history.map((entry) => entry.value)).toEqual(['Moss']);
  });

  it('throws when saving a record that does not exist', () => {
    const store = new RecordStore(first);
    expect(() => store.save(createRecord('ghost', T0), 1)).toThrow(OnboardingNotFoundError);
  });
});

describe('persistence across a restart', () => {
  let temp: TempDatabase;

  beforeEach(() => {
    temp = tempDatabase();
  });

  afterEach(() => {
    temp.cleanup();
  });

  it('keeps everything captured before a hangup when the process restarts', () => {
    const db = openDatabase(temp.path);
    const service = new OnboardingService(db, { clock: tickingClock(), newId: sequentialIds() });
    const created = service.create();
    service.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'agentName', value: 'Moss' }] },
      channel: 'text',
    });
    service.startCall(created.id, 'call_1');
    service.logMessage(created.id, { role: 'agent', channel: 'voice', text: 'Who am I talking to?', callId: 'call_1' });
    service.callTool(created.id, { name: 'record_ask', input: { field: 'userName' }, channel: 'voice' });
    service.logMessage(created.id, { role: 'user', channel: 'voice', text: 'Jon, and I need to cancel my gym', callId: 'call_1' });
    service.callTool(created.id, {
      name: 'update_profile',
      input: {
        updates: [
          { field: 'userName', value: 'Jon' },
          { field: 'helpTopic', value: 'cancel my gym membership' },
        ],
      },
      channel: 'voice',
    });
    const before = service.get(created.id);
    const eventsBefore = service.events(created.id);
    db.close();

    const reopened = openDatabase(temp.path);
    const restarted = new OnboardingService(reopened, { clock: tickingClock(Date.parse(T0) + 60_000) });
    const after = restarted.get(created.id);

    expect(after).toEqual(before);
    expect(after.fields.userName).toMatchObject({ value: 'Jon', status: 'provisional', askCount: 1 });
    expect(after.fields.helpTopic).toMatchObject({ value: 'cancel my gym membership', status: 'confirmed' });
    expect(after.calls.activeCallId).toBe('call_1');
    expect(restarted.events(created.id)).toEqual(eventsBefore);

    const ended = restarted.endCall(created.id, { callId: 'call_1', reason: 'network_drop' });
    const state = restarted.describe(created.id, 'voice');

    expect(ended.record.calls.unplannedHangups).toBe(1);
    expect(state.askable).toEqual(['gmail']);
    expect(state.known.map((entry) => entry.field)).toEqual(['agentName', 'userName', 'helpTopic']);
    expect(state.graduation.allowed).toBe(true);
    reopened.close();
  });

  it('has committed a field by the time the tool call returns', () => {
    const writer = openDatabase(temp.path);
    const reader = openDatabase(temp.path);
    const service = new OnboardingService(writer, { clock: tickingClock(), newId: sequentialIds() });
    const created = service.create();

    service.callTool(created.id, {
      name: 'update_profile',
      input: { updates: [{ field: 'userName', value: 'Jon' }] },
      channel: 'voice',
    });

    const seen = new RecordStore(reader).require(created.id);
    expect(seen.fields.userName.value).toBe('Jon');
    expect(seen.version).toBe(2);
    expect(writer.isTransaction).toBe(false);
    writer.close();
    reader.close();
  });

  it('rolls back the record when the event cannot be written', () => {
    const db = openDatabase(temp.path);
    const service = new OnboardingService(db, { clock: tickingClock(), newId: sequentialIds() });
    const created = service.create();
    db.exec("CREATE TRIGGER events_reject_insert BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'disk full'); END");

    expect(() =>
      service.callTool(created.id, {
        name: 'update_profile',
        input: { updates: [{ field: 'userName', value: 'Jon' }] },
        channel: 'text',
      }),
    ).toThrow(/disk full/);

    const after = service.get(created.id);
    expect(after.version).toBe(1);
    expect(after.fields.userName.value).toBeNull();
    expect(db.isTransaction).toBe(false);
    db.close();
  });
});
