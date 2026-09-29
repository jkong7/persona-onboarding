import { describe, expect, it } from 'vitest';
import { instructionsFor, INSTRUCTIONS, VOICE_INSTRUCTIONS } from '../src/agent/instructions.ts';

describe('instructions', () => {
  it('are unchanged when a real account can be connected', () => {
    expect(instructionsFor('text', true)).toBe(INSTRUCTIONS);
    expect(instructionsFor('voice', true)).toBe(VOICE_INSTRUCTIONS);
  });

  it('offer only the sample inbox when it cannot', () => {
    for (const channel of ['text', 'voice'] as const) {
      const prompt = instructionsFor(channel, false);
      expect(prompt).toContain('# Inbox\n');
      expect(prompt).not.toContain('# Gmail\n');
      expect(prompt).toContain('a real Gmail account cannot be connected');
      expect(prompt).not.toContain('Offer Gmail once');
      expect(prompt.match(/^# /gm)?.length).toBe(instructionsFor(channel, true).match(/^# /gm)?.length);
    }
  });

  it('never use a dash as punctuation', () => {
    for (const channel of ['text', 'voice'] as const) {
      for (const real of [true, false]) {
        expect(instructionsFor(channel, real)).not.toMatch(/[‒–—―]/);
      }
    }
  });
});
