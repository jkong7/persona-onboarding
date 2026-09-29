import { describe, expect, it } from 'vitest';
import { describeState } from '../src/domain/describe.ts';
import { looksMisheard, nameTheyHeard, soundsLikeCorrection } from '../src/domain/names.ts';
import { updateProfile } from '../src/domain/tools/updateProfile.ts';
import { ctx, freshRecord } from './helpers.ts';

describe('names that were probably misheard', () => {
  it('accepts ordinary names', () => {
    for (const name of ['Jonathan', 'Bea', 'Siobhan', 'Mary Anne', 'DJ', "O'Neil", 'Émile', '李', 'Noor al Din']) {
      expect(looksMisheard(name)).toBe(false);
    }
  });

  it('flags fragments, lowercase words and numbers', () => {
    for (const name of ['b', 'B', 'yes', 'the', 'Lee 2', '42', '', 'I would rather not say that now']) {
      expect(looksMisheard(name)).toBe(true);
    }
  });

  it('tells the agent to ask again when a name heard on a call looks wrong', () => {
    const heard = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'b' }] }, ctx('voice'));
    expect(heard.result.applied[0]).toMatchObject({ possiblyMisheard: true, status: 'provisional' });
    expect(describeState(heard.record).text).toContain(
      '- userName = "b" (heard on a call and probably misheard, ask them to say it again or spell it)',
    );
  });

  it('does not question a name that was typed', () => {
    const typed = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'b' }] }, ctx('text'));
    expect(typed.result.applied[0]).toMatchObject({ possiblyMisheard: false, status: 'confirmed' });
    expect(describeState(typed.record).text).toContain('- userName = "B" (confirmed)');
  });

  it('asks for an ordinary name heard on a call to be used once', () => {
    const heard = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'Bea' }] }, ctx('voice'));
    expect(heard.result.applied[0]).toMatchObject({ possiblyMisheard: false, status: 'provisional' });
    expect(describeState(heard.record).text).toContain(
      '- userName = "Bea" (heard on a call, use it once so they can correct it)',
    );
  });
});

describe('settling a name heard on a call', () => {
  function heard(name: string) {
    return updateProfile(freshRecord(), { updates: [{ field: 'userName', value: name }] }, ctx('voice')).record;
  }

  function said(text: string, createdAt: string, channel: 'voice' | 'text' = 'voice') {
    return {
      seq: 1,
      role: 'agent' as const,
      channel,
      callId: 'call_1',
      text,
      fullText: text,
      interrupted: false,
      createdAt,
    };
  }

  it('waits until the person has heard the name', () => {
    const record = heard('Bea');
    const at = record.fields.userName.updatedAt!;
    expect(nameTheyHeard(record, [])).toBeNull();
    expect(nameTheyHeard(record, [said('What can I take off your plate?', at)])).toBeNull();
    expect(nameTheyHeard(record, [said('We got cut off, Bea.', at, 'text')])).toBe('Bea');
    expect(nameTheyHeard(record, [said('Good to meet you, Bea.', at)])).toBe('Bea');
  });

  it('ignores a name said before it was recorded, and one that looks misheard', () => {
    const record = heard('Bea');
    const before = new Date(Date.parse(record.fields.userName.updatedAt!) - 60_000).toISOString();
    expect(nameTheyHeard(record, [said('Is it Bea?', before)])).toBeNull();
    const odd = heard('b');
    expect(nameTheyHeard(odd, [said('Got it, b.', odd.fields.userName.updatedAt!)])).toBeNull();
  });

  it('holds off when the reply might be a correction', () => {
    expect(soundsLikeCorrection("No, it's Siobhan")).toBe(true);
    expect(soundsLikeCorrection('Actually I go by Lex')).toBe(true);
    expect(soundsLikeCorrection('I keep missing emails from recruiters')).toBe(false);
    expect(soundsLikeCorrection('Yeah, help me with my inbox')).toBe(false);
  });
});

describe('a name heard for the first time', () => {
  it('is never settled by the agent alone', () => {
    const heard = updateProfile(
      freshRecord(),
      { updates: [{ field: 'userName', value: 'Jonathan', confirmed: true }] },
      ctx('voice'),
    );
    expect(heard.record.fields.userName).toMatchObject({ value: 'Jonathan', status: 'provisional' });
  });

  it('is settled when the agent records a correction', () => {
    const heard = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'Shawn' }] }, ctx('voice'));
    const fixed = updateProfile(
      heard.record,
      { updates: [{ field: 'userName', value: 'Siobhan', confirmed: true }] },
      ctx('voice'),
    );
    expect(fixed.record.fields.userName).toMatchObject({ value: 'Siobhan', status: 'confirmed' });
  });
});

describe('a correction that looks misheard', () => {
  it('is kept provisional the first time and settled if they insist', () => {
    const known = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'Jonathan' }] }, ctx('text'));
    const odd = updateProfile(
      known.record,
      { updates: [{ field: 'userName', value: 'B', confirmed: true }] },
      ctx('voice'),
    );
    expect(odd.record.fields.userName).toMatchObject({ value: 'B', status: 'provisional' });
    expect(odd.result.applied[0]).toMatchObject({ possiblyMisheard: true });
    const insisted = updateProfile(
      odd.record,
      { updates: [{ field: 'userName', value: 'B', confirmed: true }] },
      ctx('voice'),
    );
    expect(insisted.record.fields.userName).toMatchObject({ value: 'B', status: 'confirmed' });
  });
});

describe('a name typed in lowercase', () => {
  it('is saved with a capital', () => {
    const typed = updateProfile(
      freshRecord(),
      {
        updates: [
          { field: 'agentName', value: 'max' },
          { field: 'userName', value: 'mary-anne o brien' },
        ],
      },
      ctx('text'),
    );
    expect(typed.record.fields.agentName.value).toBe('Max');
    expect(typed.record.fields.userName.value).toBe('Mary-Anne O Brien');
  });

  it('is left alone when the person chose their own capitals, or said it aloud', () => {
    const typed = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'DeShawn' }] }, ctx('text'));
    expect(typed.record.fields.userName.value).toBe('DeShawn');
    const heard = updateProfile(freshRecord(), { updates: [{ field: 'userName', value: 'b' }] }, ctx('voice'));
    expect(heard.record.fields.userName.value).toBe('b');
    const topic = updateProfile(freshRecord(), { updates: [{ field: 'helpTopic', value: 'taxes' }] }, ctx('text'));
    expect(topic.record.fields.helpTopic.value).toBe('taxes');
  });
});
