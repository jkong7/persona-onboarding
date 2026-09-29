import type { ReactElement } from 'react';
import type { Snapshot } from '../api/types.ts';
import type { ActivityItem } from '../lib/activity.ts';
import { endReasonLabel, fieldRows, phaseLabel, plural } from '../lib/status.ts';

export interface KnowledgePanelProps {
  snapshot: Snapshot;
  activity: ActivityItem[];
  headingId: string;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function KnowledgePanel({ snapshot, activity, headingId }: KnowledgePanelProps): ReactElement {
  const rows = fieldRows(snapshot.state);
  const calls = snapshot.state.calls;
  const saved = rows.filter((row) => row.value !== null).length;
  const lastEnd = endReasonLabel(calls.lastEndReason);

  return (
    <div className="panel">
      <header className="panel__head">
        <h2 id={headingId} className="panel__title">
          What Persona knows
        </h2>
      </header>

      <dl className="facts" aria-label="Saved details">
        {rows.map((row) => (
          <div key={row.field} className="fact">
            <dt className="fact__label">{row.label}</dt>
            <dd className="fact__body">
              {row.value === null ? null : <span className="fact__value">{row.value}</span>}
              <span className={`tag tag--${row.tone}`}>{row.status}</span>
              {row.note === null ? null : <span className="fact__note">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <section className="panel__section" aria-label="Progress">
        <div className="stats">
          <div className="stat">
            <span className="stat__label">Stage</span>
            <span className="stat__value">{phaseLabel(snapshot.phase)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Saved</span>
            <span className="stat__value">{saved} of 4</span>
          </div>
          <div className="stat">
            <span className="stat__label">Calls</span>
            <span className="stat__value">{calls.total}</span>
          </div>
          <div className="stat">
            <span className="stat__label">Hangups</span>
            <span className="stat__value">{calls.unplannedHangups}</span>
          </div>
        </div>
        <p className="panel__line">
          {calls.active
            ? 'A call is in progress.'
            : calls.ringing
              ? 'A call is ringing.'
              : lastEnd === null
                ? 'No calls yet.'
                : `Last call: ${lastEnd.toLowerCase()}.`}
          {calls.declined > 0 ? ` ${plural(calls.declined, 'call', 'calls')} declined.` : ''}
          {calls.callbackRequested ? ' A callback was requested.' : ''}
          {!calls.mayOfferCall && !calls.active ? ' Calls are no longer offered unless you ask.' : ''}
        </p>
      </section>

      <section className="panel__section" aria-label="Activity">
        <h3 className="panel__heading">Activity</h3>
        {activity.length === 0 ? (
          <p className="panel__line">Nothing yet.</p>
        ) : (
          <ol className="feed">
            {activity.map((item) => (
              <li key={item.id} className="feed__item">
                <span className="feed__text">{item.text}</span>
                <time className="feed__time" dateTime={item.at}>
                  {timeLabel(item.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
