import { useState, type ReactElement } from 'react';
import { MailIcon } from './Icons.tsx';

export interface GmailCardProps {
  gmailAvailable: boolean;
  onConnect: () => Promise<void>;
  onSample: () => Promise<void>;
}

type Working = 'connect' | 'sample' | null;

export function GmailCard({ gmailAvailable, onConnect, onSample }: GmailCardProps): ReactElement {
  const [working, setWorking] = useState<Working>(null);

  const run = async (kind: Exclude<Working, null>, action: () => Promise<void>): Promise<void> => {
    if (working !== null) {
      return;
    }
    setWorking(kind);
    try {
      await action();
    } finally {
      setWorking(null);
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
            {gmailAvailable ? 'Connect your inbox' : 'Try it with a sample inbox'}
          </h3>
          <p className="card__text">
            {gmailAvailable
              ? 'Read only'
              : 'The sample inbox is a set of made-up emails. Your own mail is not touched.'}
          </p>
        </div>
      </div>
      <div className="card__actions">
        {gmailAvailable ? (
          <button
            type="button"
            className="button button--primary"
            disabled={working !== null}
            onClick={() => void run('connect', onConnect)}
          >
            {working === 'connect' ? 'Waiting for Google...' : 'Connect Gmail'}
          </button>
        ) : null}
        <button
          type="button"
          className={gmailAvailable ? 'button' : 'button button--primary'}
          disabled={working !== null}
          onClick={() => void run('sample', onSample)}
        >
          {working === 'sample' ? 'Switching...' : 'Use sample inbox'}
        </button>
      </div>
    </section>
  );
}
