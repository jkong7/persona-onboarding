import { useEffect, useState, type ReactElement } from 'react';
import type { CallView, Speaker } from '../call/useCall.ts';
import { clock } from '../lib/thread.ts';
import { HangUpIcon, MicIcon, MicOffIcon } from './Icons.tsx';

export interface CallPanelProps {
  view: CallView;
  agentName: string;
  userName: string | null;
  onHangUp: () => void;
  onToggleMute: () => void;
}

function speakerLabel(speaker: Speaker, agentName: string, muted: boolean): string {
  switch (speaker) {
    case 'agent':
      return `${agentName} is speaking`;
    case 'user':
      return 'You are speaking';
    case 'thinking':
      return `${agentName} is thinking`;
    case 'listening':
      return muted ? 'You are muted' : 'Listening';
  }
}

function phaseLabel(view: CallView, agentName: string): string {
  switch (view.phase) {
    case 'requesting_mic':
      return 'Waiting for the microphone';
    case 'connecting':
      return 'Connecting';
    case 'wrapping_up':
      return 'Wrapping up';
    case 'live':
      return speakerLabel(view.speaker, agentName, view.muted);
    case 'idle':
      return '';
  }
}

export function CallPanel({ view, agentName, userName, onHangUp, onToggleMute }: CallPanelProps): ReactElement {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (view.startedAt === null) {
      setSeconds(0);
      return;
    }
    const started = view.startedAt;
    const tick = (): void => setSeconds((Date.now() - started) / 1000);
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [view.startedAt]);

  const live = view.phase === 'live';
  const caption = view.captions.at(-1) ?? null;

  return (
    <section className="call" aria-label={`Call with ${agentName}`}>
      <div className="call__row">
        <div className={`call__pulse call__pulse--${live ? view.speaker : 'idle'}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="call__meta">
          <p className="call__name">
            {agentName}
            {userName === null ? null : <span className="call__with"> with {userName}</span>}
          </p>
          <p className="call__status" role="status">
            {phaseLabel(view, agentName)}
          </p>
        </div>
        <p className="call__timer" aria-label="Call length">
          {clock(seconds)}
        </p>
        <button
          type="button"
          className={`round round--quiet${view.muted ? ' round--on' : ''}`}
          onClick={onToggleMute}
          disabled={!live}
          aria-pressed={view.muted}
          aria-label={view.muted ? 'Unmute microphone' : 'Mute microphone'}
        >
          {view.muted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button type="button" className="round round--danger" onClick={onHangUp} aria-label="Hang up">
          <HangUpIcon />
        </button>
      </div>
      {caption === null ? null : (
        <p className="call__caption">
          <span className="call__speaker">{caption.role === 'agent' ? agentName : 'You'}</span>
          {caption.text}
        </p>
      )}
    </section>
  );
}
