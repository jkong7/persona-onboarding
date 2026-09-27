import { describe, expect, it } from 'vitest';
import { snapshot } from '../test/factory.ts';
import { ACTIVITY_LIMIT, appendActivity, describeChanges, isActivityFeed } from './activity.ts';

describe('describeChanges', () => {
  it('notes a fresh or restored thread', () => {
    expect(describeChanges(null, snapshot())).toEqual(['Thread opened.']);
    expect(describeChanges(null, snapshot({ known: { userName: { value: 'Jon' } } }))).toEqual([
      'Thread restored. 1 saved item intact.',
    ]);
    expect(describeChanges(null, snapshot({ lastSeq: 3 }))).toEqual(['Thread restored. 0 saved items intact.']);
  });

  it('notes a saved, confirmed and corrected name', () => {
    const empty = snapshot();
    const heard = snapshot({ version: 2, known: { userName: { value: 'John', status: 'provisional' } } });
    const confirmed = snapshot({ version: 3, known: { userName: { value: 'John' } } });
    const corrected = snapshot({ version: 4, known: { userName: { value: 'Jon' } } });
    expect(describeChanges(empty, heard)).toEqual(['Your name saved: "John", heard by voice.']);
    expect(describeChanges(heard, confirmed)).toEqual(['Your name confirmed.']);
    expect(describeChanges(confirmed, corrected)).toEqual(['Your name corrected to "Jon".']);
  });

  it('says what survived when a call ends', () => {
    const during = snapshot({
      activeCallId: 'call_1',
      calls: { total: 1, active: true },
      known: { userName: { value: 'Jon' }, helpTopic: { value: 'inbox' } },
    });
    const after = snapshot({
      version: 2,
      calls: { total: 1, active: false, unplannedHangups: 1, lastEndReason: 'user_hangup' },
      known: { userName: { value: 'Jon' }, helpTopic: { value: 'inbox' } },
    });
    expect(describeChanges(during, after)).toEqual(['Call ended: you hung up. 2 items still saved.']);
  });

  it('notes ringing, declining, a second call and graduation', () => {
    const base = snapshot();
    expect(describeChanges(base, snapshot({ calls: { ringing: true } }))).toEqual(['Incoming call.']);
    expect(describeChanges(base, snapshot({ calls: { declined: 1 } }))).toEqual([
      'Call declined. Carrying on in text.',
    ]);
    expect(
      describeChanges(snapshot({ calls: { total: 1 } }), snapshot({ calls: { total: 2, active: true } })),
    ).toEqual(['Call 2 connected. Picking up where it left off.']);
    expect(describeChanges(base, snapshot({ phase: 'graduated' }))).toEqual(['Moved into the main experience.']);
  });

  it('notes the sample inbox and a skipped Gmail', () => {
    const base = snapshot();
    expect(
      describeChanges(
        base,
        snapshot({ known: { gmail: { value: 'Sample inbox' } }, gmail: { connected: true, mode: 'sample' } }),
      ),
    ).toEqual(['Switched to the sample inbox.']);
    expect(describeChanges(base, snapshot({ missing: { gmail: 'declined' } }))).toEqual(['Gmail declined.']);
  });

  it('says nothing when nothing changed', () => {
    expect(describeChanges(snapshot(), snapshot({ version: 2 }))).toEqual([]);
  });
});

describe('appendActivity', () => {
  it('puts the newest first and caps the list', () => {
    let feed = appendActivity([], null, snapshot(), '2026-09-27T18:00:00.000Z');
    for (let round = 0; round < ACTIVITY_LIMIT + 5; round += 1) {
      feed = appendActivity(
        feed,
        snapshot({ calls: { declined: round } }),
        snapshot({ calls: { declined: round + 1 } }),
        `2026-09-27T18:00:${String(round % 60).padStart(2, '0')}.000Z`,
      );
    }
    expect(feed).toHaveLength(ACTIVITY_LIMIT);
    expect(feed[0]?.text).toBe('Call declined. Carrying on in text.');
  });

  it('returns the same list when there is nothing to add', () => {
    const feed = appendActivity([], null, snapshot(), '2026-09-27T18:00:00.000Z');
    expect(appendActivity(feed, snapshot(), snapshot({ version: 2 }), '2026-09-27T18:00:01.000Z')).toBe(feed);
  });
});

describe('restoring after a refresh', () => {
  it('does not repeat the restore line on every refresh', () => {
    const saved = snapshot({ lastSeq: 4, known: { userName: { value: 'Jon' } } });
    const once = appendActivity([], null, saved, '2026-09-27T18:00:00.000Z');
    const twice = appendActivity(once, null, saved, '2026-09-27T18:00:05.000Z');
    expect(once.map((item) => item.text)).toEqual(['Thread restored. 1 saved item intact.']);
    expect(twice).toBe(once);
  });
});

describe('isActivityFeed', () => {
  it('accepts a stored feed and rejects anything else', () => {
    expect(isActivityFeed([{ id: '1', at: 'now', text: 'x' }])).toBe(true);
    expect(isActivityFeed([{ id: 1 }])).toBe(false);
    expect(isActivityFeed('nope')).toBe(false);
  });
});
