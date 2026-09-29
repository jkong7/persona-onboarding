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

describe('stray markup', () => {
  const wrapped = "<result>\nMax it is. I'm calling you now.\n</result>";

  it('is removed from a finished reply', () => {
    expect(plainPunctuation(wrapped).trim()).toBe("Max it is. I'm calling you now.");
    expect(plainPunctuation('<reply>Hi</reply> there <br/>').trim()).toBe('Hi there');
  });

  it('is removed however the reply is split up', () => {
    for (const size of [1, 2, 3, 5, 8, 13, 50]) {
      expect(stream(wrapped, size).trim()).toBe("Max it is. I'm calling you now.");
    }
  });

  it('leaves ordinary comparisons alone', () => {
    for (const size of [1, 4, 50]) {
      expect(stream('Anything < 5 dollars is fine, and 3 > 2.', size)).toBe(
        'Anything < 5 dollars is fine, and 3 > 2.',
      );
    }
  });
});

describe('leaked reasoning', () => {
  const leaked =
    "<reasoning>Should have stated calling in reply; now write.</reasoning>Max it is. I'm calling you now.";

  it('is removed along with everything inside it', () => {
    expect(plainPunctuation(leaked)).toBe("Max it is. I'm calling you now.");
    expect(plainPunctuation('Sure.\n<thinking>\nhmm\nok\n</thinking>\nHere you go.')).toBe('Sure.\nHere you go.');
  });

  it('is removed however the reply is split up', () => {
    for (const size of [1, 2, 3, 7, 20, 200]) {
      expect(stream(leaked, size)).toBe("Max it is. I'm calling you now.");
    }
  });

  it('never shows reasoning that was left unfinished', () => {
    for (const size of [1, 5, 200]) {
      expect(stream('On it. <reasoning>I should now call the tool and', size).trimEnd()).toBe('On it.');
    }
  });
});

describe('lists inside a draft', () => {
  it('keeps a hyphen that starts a line', () => {
    const draft = 'These times work:\n- [option 1]\n- [option 2]\nBest,\nNoor';
    expect(plainPunctuation(draft)).toBe(draft);
    expect(plainPunctuation('Tuesday - or Wednesday')).toBe('Tuesday, or Wednesday');
  });
});
