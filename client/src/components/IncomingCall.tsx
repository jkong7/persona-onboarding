import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { startRingtone } from '../lib/ringtone.ts';
import { loadRingtoneMuted, saveRingtoneMuted } from '../lib/storage.ts';
import { BellIcon, BellOffIcon, HangUpIcon, PhoneIcon } from './Icons.tsx';

export interface IncomingCallProps {
  agentName: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCall({ agentName, busy, onAccept, onDecline }: IncomingCallProps): ReactElement {
  const [muted, setMuted] = useState(loadRingtoneMuted);
  const container = useRef<HTMLDivElement | null>(null);
  const acceptButton = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    acceptButton.current?.focus();
    return () => previous?.focus();
  }, []);

  useEffect(() => {
    if (muted || busy) {
      return;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const ringtone = startRingtone();
    const limit = setTimeout(() => ringtone.stop(), reduced ? 6000 : 45000);
    return () => {
      clearTimeout(limit);
      ringtone.stop();
    };
  }, [busy, muted]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(
      container.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !container.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !container.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  const toggleSound = (): void => {
    setMuted((current) => {
      saveRingtoneMuted(!current);
      return !current;
    });
  };

  return (
    <div
      ref={container}
      className="incoming"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-title"
      aria-describedby="incoming-text"
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className="round round--ghost incoming__sound"
        onClick={toggleSound}
        aria-pressed={muted}
        aria-label={muted ? 'Turn ringtone on' : 'Turn ringtone off'}
      >
        {muted ? <BellOffIcon /> : <BellIcon />}
      </button>
      <div className="incoming__body">
        <div className="incoming__avatar" aria-hidden="true">
          {agentName.trim().charAt(0).toUpperCase() || 'P'}
        </div>
        <h2 id="incoming-title" className="incoming__name">
          {agentName}
        </h2>
        <p id="incoming-text" className="incoming__text">
          {busy ? 'Connecting' : 'is calling'}
        </p>
      </div>
      <div className="incoming__actions">
        <div className="incoming__action">
          <button
            type="button"
            className="round round--large round--danger"
            onClick={onDecline}
            disabled={busy}
            aria-label="Decline call"
          >
            <HangUpIcon width={26} height={26} />
          </button>
          <span aria-hidden="true">Decline</span>
        </div>
        <div className="incoming__action">
          <button
            ref={acceptButton}
            type="button"
            className="round round--large round--accept"
            onClick={onAccept}
            disabled={busy}
            aria-label="Accept call"
          >
            <PhoneIcon width={26} height={26} />
          </button>
          <span aria-hidden="true">Accept</span>
        </div>
      </div>
      <p className="incoming__hint">The call uses your microphone. You can decline and keep typing.</p>
    </div>
  );
}
