import { useState, type ReactElement } from 'react';
import { MailIcon } from './Icons.tsx';

export interface GmailCardProps {
  onSample: () => Promise<void>;
}

export function GmailCard({ onSample }: GmailCardProps): ReactElement {
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const chooseSample = async (): Promise<void> => {
    if (working) {
      return;
    }
    setWorking(true);
    setNote(null);
    try {
      await onSample();
    } finally {
      setWorking(false);
    }
  };

  return (
    <section className="card" aria-labelledby="gmail-card-title">
      <div className="card__head">
        <span className="card__icon">
          <MailIcon />
        </span>
        <div>
          <h3 id="gmail-card-title" className="card__title">
            Connect your inbox
          </h3>
          <p className="card__text">
            Read only. Nothing is sent, deleted or changed. Google shows a caution screen because this is a demo app.
          </p>
        </div>
      </div>
      <div className="card__actions">
        <button
          type="button"
          className="button button--primary"
          onClick={() => setNote('The Google connection arrives in a later step. The sample inbox works today.')}
        >
          Connect Gmail
        </button>
        <button type="button" className="button" disabled={working} onClick={() => void chooseSample()}>
          {working ? 'Switching...' : 'Use sample inbox'}
        </button>
      </div>
      {note === null ? null : (
        <p className="card__note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}
