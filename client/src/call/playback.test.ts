import { describe, expect, it } from 'vitest';
import { UtteranceTracker } from './playback.ts';

const RATE = 24000;
const ONE_SECOND = RATE * 2;

describe('UtteranceTracker', () => {
  it('reports nothing when the agent has not spoken', () => {
    expect(new UtteranceTracker(RATE).interrupt(0)).toBeNull();
  });

  it('reports how much had been played when the person cuts in', () => {
    const tracker = new UtteranceTracker(RATE);
    tracker.addChunk(ONE_SECOND * 4, 0);
    tracker.markAudioDone();
    expect(tracker.interrupt(3)).toMatchObject({ playedFraction: 0.25, complete: true });
  });

  it('reports nothing when the whole utterance had already been played', () => {
    const tracker = new UtteranceTracker(RATE);
    tracker.addChunk(ONE_SECOND * 2, 0);
    tracker.markAudioDone();
    expect(tracker.interrupt(0)).toBeNull();
  });

  it('flags a fraction measured before all the audio had arrived', () => {
    const tracker = new UtteranceTracker(RATE);
    tracker.addChunk(ONE_SECOND * 2, 0);
    expect(tracker.interrupt(1.5)).toMatchObject({ playedFraction: 0.25, complete: false });
  });

  it('keeps the fraction between zero and one', () => {
    const tracker = new UtteranceTracker(RATE);
    tracker.addChunk(ONE_SECOND, 0);
    expect(tracker.interrupt(9)?.playedFraction).toBe(0);
    tracker.addChunk(ONE_SECOND, 0);
    expect(tracker.interrupt(-3)?.playedFraction).toBe(1);
  });

  it('starts a new utterance after the last one finished playing', () => {
    const tracker = new UtteranceTracker(RATE);
    tracker.addChunk(ONE_SECOND * 3, 0);
    tracker.markAudioDone();
    tracker.addChunk(ONE_SECOND, 0);
    expect(tracker.receivedSeconds).toBe(1);
    expect(tracker.interrupt(0.5)?.playedFraction).toBe(0.5);
  });

  it('resets after an interruption', () => {
    const tracker = new UtteranceTracker(RATE);
    tracker.addChunk(ONE_SECOND * 2, 0);
    tracker.interrupt(1);
    expect(tracker.receivedSeconds).toBe(0);
    expect(tracker.interrupt(0)).toBeNull();
  });

  it('knows whether the agent can still be heard', () => {
    const tracker = new UtteranceTracker(RATE);
    expect(tracker.isPlaying(0)).toBe(false);
    tracker.addChunk(ONE_SECOND, 0);
    expect(tracker.isPlaying(0)).toBe(true);
    tracker.markAudioDone();
    expect(tracker.isPlaying(0.4)).toBe(true);
    expect(tracker.isPlaying(0)).toBe(false);
  });
});
