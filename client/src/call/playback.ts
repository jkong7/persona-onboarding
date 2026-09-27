export const SILENCE_EPSILON_SECONDS = 0.05;

export interface InterruptResult {
  playedFraction: number;
  playedSeconds: number;
  receivedSeconds: number;
  complete: boolean;
}

export class UtteranceTracker {
  readonly #bytesPerSecond: number;
  #receivedSeconds = 0;
  #audioDone = false;

  constructor(sampleRate: number, bytesPerSample = 2) {
    this.#bytesPerSecond = Math.max(1, sampleRate * bytesPerSample);
  }

  get receivedSeconds(): number {
    return this.#receivedSeconds;
  }

  get audioDone(): boolean {
    return this.#audioDone;
  }

  begin(): void {
    this.#receivedSeconds = 0;
    this.#audioDone = false;
  }

  addChunk(byteLength: number, remainingSeconds: number): void {
    if (this.#audioDone && remainingSeconds <= SILENCE_EPSILON_SECONDS) {
      this.begin();
    }
    if (this.#audioDone) {
      this.#audioDone = false;
    }
    this.#receivedSeconds += Math.max(0, byteLength) / this.#bytesPerSecond;
  }

  markAudioDone(): void {
    if (this.#receivedSeconds > 0) {
      this.#audioDone = true;
    }
  }

  isPlaying(remainingSeconds: number): boolean {
    if (this.#receivedSeconds === 0) {
      return false;
    }
    return !this.#audioDone || remainingSeconds > SILENCE_EPSILON_SECONDS;
  }

  interrupt(remainingSeconds: number): InterruptResult | null {
    const received = this.#receivedSeconds;
    const complete = this.#audioDone;
    if (received === 0) {
      return null;
    }
    const remaining = Math.min(received, Math.max(0, remainingSeconds));
    this.begin();
    if (complete && remaining <= SILENCE_EPSILON_SECONDS) {
      return null;
    }
    const played = received - remaining;
    const fraction = Math.min(1, Math.max(0, played / received));
    return {
      playedFraction: Math.round(fraction * 1000) / 1000,
      playedSeconds: played,
      receivedSeconds: received,
      complete,
    };
  }
}
