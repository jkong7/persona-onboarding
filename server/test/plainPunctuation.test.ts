import { describe, expect, it } from 'vitest';
import { plainPunctuation, PunctuationStream } from '../src/agent/plainPunctuation.ts';

function stream(text: string, size: number): string {
  const parts: string[] = [];
  const filter = new PunctuationStream((part) => parts.push(part));
  for (let index = 0; index < text.length; index += size) {
    filter.push(text.slice(index, index + size));
  }
  filter.flush();
  return parts.join('');
}

describe('plain punctuation', () => {
  it('replaces dashes used as punctuation with commas', () => {
    expect(plainPunctuation('Johnny, got it — did I hear that right?')).toBe(
      'Johnny, got it, did I hear that right?',
    );
    expect(plainPunctuation('Sure—I can read your inbox.')).toBe('Sure, I can read your inbox.');
    expect(plainPunctuation('One thing – the bill.')).toBe('One thing, the bill.');
    expect(plainPunctuation('Take your time -- no rush.')).toBe('Take your time, no rush.');
    expect(plainPunctuation('Take your time - no rush.')).toBe('Take your time, no rush.');
  });

  it('keeps hyphens inside words and ranges between numbers', () => {
    expect(plainPunctuation('a 20-minute call, 9–5 on weekdays')).toBe('a 20-minute call, 9-5 on weekdays');
    expect(plainPunctuation('follow-up and well-known')).toBe('follow-up and well-known');
  });

  it('does not leave doubled or stray commas', () => {
    expect(plainPunctuation('Good, — then.')).toBe('Good, then.');
    expect(plainPunctuation('Right. — So what next?')).toBe('Right. So what next?');
    expect(plainPunctuation('— Hello')).toBe('Hello');
  });

  it('leaves ordinary text alone', () => {
    const text = "Hey, it's Max. What should I call you?";
    expect(plainPunctuation(text)).toBe(text);
  });
});

describe('plain punctuation while streaming', () => {
  const samples = [
    'Johnny, got it — did I hear that right?',
    'Sure — I can read your inbox once you connect it, though I can’t send anything yet.',
    'Which one’s on your mind — or something else entirely?',
    'A 20-minute call, 9–5 on weekdays — your pick.',
    'No dashes here. Just two sentences.',
    'Ends with a dash —',
  ];

  it('gives the same result however the text is split', () => {
    for (const sample of samples) {
      const whole = stream(sample, sample.length);
      for (const size of [1, 2, 3, 5, 8, 13]) {
        expect(stream(sample, size)).toBe(whole);
      }
      expect(whole).not.toMatch(/[‒–—―]/);
    }
  });

  it('matches the one-shot result for complete sentences', () => {
    expect(stream(samples[0]!, 4)).toBe('Johnny, got it, did I hear that right?');
    expect(stream(samples[3]!, 3)).toBe('A 20-minute call, 9-5 on weekdays, your pick.');
    expect(stream(samples[5]!, 2)).toBe('Ends with a dash');
  });

  it('passes ordinary text through without delay', () => {
    const parts: string[] = [];
    const filter = new PunctuationStream((part) => parts.push(part));
    filter.push('Hey, it is');
    expect(parts.join('')).toBe('Hey, it is');
    filter.push(' Max.');
    filter.flush();
    expect(parts.join('')).toBe('Hey, it is Max.');
  });
});
