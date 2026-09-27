import { describe, expect, it } from 'vitest';
import { SpokenLimiter, splitSentences } from '../src/agent/spokenLimit.ts';

function feed(text: string, size = 7): { heard: string; spoken: string; overflow: string } {
  const chunks: string[] = [];
  const limiter = new SpokenLimiter((part) => chunks.push(part));
  for (let index = 0; index < text.length; index += size) {
    limiter.push(text.slice(index, index + size));
  }
  const result = limiter.finish();
  return { heard: chunks.join('').replace(/\s+/g, ' ').trim(), ...result };
}

describe('splitting sentences', () => {
  it('splits on sentence endings and keeps the last fragment', () => {
    expect(splitSentences('Hi there. How are you? Fine')).toEqual(['Hi there.', 'How are you?', 'Fine']);
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ...   ')).toEqual([]);
  });
});

describe('limiting what is spoken', () => {
  it('passes a short reply through untouched', () => {
    const result = feed('Got it, Jon. Did I hear that right?');
    expect(result.heard).toBe('Got it, Jon. Did I hear that right?');
    expect(result.spoken).toBe(result.heard);
    expect(result.overflow).toBe('');
  });

  it('allows three sentences', () => {
    const result = feed('One thing. Two things. Three things?');
    expect(result.spoken).toBe('One thing. Two things. Three things?');
    expect(result.overflow).toBe('');
  });

  it('speaks the opening and the closing question, and moves the middle to the thread', () => {
    const result = feed(
      'Let me look. Maya at Northwind wants a call this week. Priya at Halcyon wants interview times. There is also a mass mailing. And a scam. Want me to draft a reply to Priya?',
    );
    expect(result.spoken).toBe(
      'Let me look. Maya at Northwind wants a call this week. Want me to draft a reply to Priya?',
    );
    expect(result.heard).toBe(result.spoken);
    expect(result.overflow).toBe(
      'Priya at Halcyon wants interview times. There is also a mass mailing. And a scam.',
    );
  });

  it('moves the whole tail to the thread when it does not end in a question', () => {
    const result = feed('First. Second. Third. Fourth. Fifth.');
    expect(result.spoken).toBe('First. Second.');
    expect(result.overflow).toBe('Third. Fourth. Fifth.');
  });

  it('starts speaking before the reply is complete', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('Hey, it ');
    expect(chunks.join('')).toBe('Hey, it ');
    limiter.push('is Max. What should ');
    expect(chunks.join('')).toBe('Hey, it is Max. What should ');
    limiter.push('I call you?');
    limiter.finish();
    expect(chunks.join('')).toBe('Hey, it is Max. What should I call you?');
  });

  it('flattens paragraph breaks', () => {
    const result = feed('Sure.\n\nHere you go.');
    expect(result.spoken).toBe('Sure. Here you go.');
  });

  it('counts sentences across a lookup', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('Let me look');
    limiter.breakBetweenReplies();
    limiter.push('Priya wants times by Friday. Maya wants a call. Sam wants dinner. Shall I draft Priya a reply?');
    const result = limiter.finish();
    expect(result.spoken).toBe(
      'Let me look Priya wants times by Friday. Maya wants a call. Shall I draft Priya a reply?',
    );
    expect(result.overflow).toBe('Sam wants dinner.');
  });

  it('says the rest is in the thread when it moves something there', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part), { bridge: 'The rest is in the thread.' });
    limiter.push('Maya wants a call. Priya wants times. A staffing firm sent a blast. There is a scam too. Shall I draft one?');
    const result = limiter.finish();
    expect(result.spoken).toBe(
      'Maya wants a call. Priya wants times. The rest is in the thread. Shall I draft one?',
    );
    expect(result.overflow).toBe('A staffing firm sent a blast. There is a scam too.');
    expect(chunks.join('').replace(/\s+/g, ' ').trim()).toBe(result.spoken);
  });

  it('speaks one extra sentence sooner than replace it with a pointer to the thread', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push('One. Two. Three. Four?');
    expect(limiter.finish()).toEqual({ spoken: 'One. Two. Three. Four?', overflow: '' });
  });

  it('gives what was found after a lookup its own allowance', () => {
    const limiter = new SpokenLimiter(() => undefined, { bridge: 'The rest is in the thread.' });
    limiter.push('Good, Johnny it is. Let me look at the sample inbox.');
    limiter.breakBetweenReplies();
    limiter.push('Sam is asking about dinner on Friday, and a recruiter wants twenty minutes. Which one is on your mind?');
    expect(limiter.finish()).toEqual({
      spoken:
        'Good, Johnny it is. Let me look at the sample inbox. Sam is asking about dinner on Friday, and a recruiter wants twenty minutes. Which one is on your mind?',
      overflow: '',
    });
  });

  it('reports what was heard so far when cut off', () => {
    const limiter = new SpokenLimiter(() => undefined);
    limiter.push('I can read your mail. I cannot send anything. There is also');
    expect(limiter.spokenSoFar()).toBe('I can read your mail. I cannot send anything.');
  });

  it('keeps a half-finished first sentence when cut off', () => {
    const chunks: string[] = [];
    const limiter = new SpokenLimiter((part) => chunks.push(part));
    limiter.push('So the first thing I would');
    expect(chunks.join('')).toBe('So the first thing I would');
    expect(limiter.spokenSoFar()).toBe('So the first thing I would');
  });

  it('never splits a sentence across the spoken part and the thread', () => {
    for (const size of [1, 2, 3, 5, 11, 40, 400]) {
      const result = feed('Alpha beta. Gamma delta. Epsilon zeta. Eta theta. Iota kappa.', size);
      expect(result.spoken).toBe('Alpha beta. Gamma delta.');
      expect(result.overflow).toBe('Epsilon zeta. Eta theta. Iota kappa.');
    }
  });
});
