import { describe, expect, it } from 'vitest';
import { firstText } from '../src/http/firstText.ts';

describe('the first text', () => {
  it('always asks one question, offers the default name and uses no dashes', () => {
    for (const roll of [0, 0.2, 0.4, 0.6, 0.8, 0.999, 1]) {
      const text = firstText(roll);
      expect(text.match(/\?/g)).toHaveLength(1);
      expect(text).toContain('Persona');
      expect(text).not.toMatch(/[‒–—―]/);
      expect(text.split('\n\n')).toHaveLength(2);
    }
  });
});
