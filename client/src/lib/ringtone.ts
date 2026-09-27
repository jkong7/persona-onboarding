export interface Ringtone {
  stop: () => void;
}

type AudioContextConstructor = typeof AudioContext;

function contextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const scoped = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return scoped.AudioContext ?? scoped.webkitAudioContext ?? null;
}

export function startRingtone(): Ringtone {
  const Constructor = contextConstructor();
  if (Constructor === null) {
    return { stop: () => undefined };
  }
  let context: AudioContext;
  try {
    context = new Constructor();
  } catch {
    return { stop: () => undefined };
  }
  let stopped = false;

  const pulse = (): void => {
    if (stopped || context.state === 'closed') {
      return;
    }
    const start = context.currentTime + 0.02;
    [0, 0.42].forEach((offset) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = offset === 0 ? 587 : 698;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.07, start + offset + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.36);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.4);
    });
  };

  void context.resume().catch(() => undefined);
  pulse();
  const timer = setInterval(pulse, 2400);

  return {
    stop: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(timer);
      void context.close().catch(() => undefined);
    },
  };
}
