import { describe, expect, it } from 'vitest';
import { splitBubbles, splitStreaming } from './bubbles.ts';

describe('splitBubbles', () => {
  it('keeps a single message whole', () => {
    expect(splitBubbles('Max it is. Calling you now.')).toEqual(['Max it is. Calling you now.']);
  });

  it('splits on a blank line', () => {
    expect(splitBubbles('Looks like we got cut off.\n\nShould I call back?')).toEqual([
      'Looks like we got cut off.',
      'Should I call back?',
    ]);
  });

  it('treats several blank lines, spaces and windows line endings as one break', () => {
    expect(splitBubbles('one\r\n\r\n\r\ntwo\n \t\nthree')).toEqual(['one', 'two', 'three']);
  });

  it('keeps single line breaks inside a bubble', () => {
    expect(splitBubbles('first line\nsecond line')).toEqual(['first line\nsecond line']);
  });

  it('drops empty parts', () => {
    expect(splitBubbles('\n\n  \n\nhello\n\n')).toEqual(['hello']);
    expect(splitBubbles('   ')).toEqual([]);
  });
});

describe('splitStreaming', () => {
  it('reports the bubble still being written separately', () => {
    expect(splitStreaming('Done.\n\nNext thi')).toEqual({ complete: ['Done.'], current: 'Next thi' });
  });

  it('has no current bubble right after a break', () => {
    expect(splitStreaming('Done.\n\n')).toEqual({ complete: ['Done.'], current: null });
  });

  it('handles text with no break yet', () => {
    expect(splitStreaming('Hel')).toEqual({ complete: [], current: 'Hel' });
    expect(splitStreaming('')).toEqual({ complete: [], current: null });
  });
});
