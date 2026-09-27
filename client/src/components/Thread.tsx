import { useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react';
import type { Snapshot } from '../api/types.ts';
import type { Notice, PendingItem } from '../hooks/useOnboarding.ts';
import { splitStreaming } from '../lib/bubbles.ts';
import {
  agentRepliedAfter,
  buildThread,
  callHeader,
  unconfirmedPending,
  type CallBlockItem,
} from '../lib/thread.ts';
import { GmailCard } from './GmailCard.tsx';
import { CloseIcon, PhoneIcon, RetryIcon } from './Icons.tsx';

export interface ThreadProps {
  snapshot: Snapshot;
  pending: PendingItem[];
  opening: boolean;
  notices: Notice[];
  agentName: string;
  inCall: boolean;
  onRetry: (localId: string) => void;
  onDismiss: (localId: string) => void;
  onDismissNotice: (id: number) => void;
  onSample: () => Promise<void>;
}

function Typing({ agentName }: { agentName: string }): ReactElement {
  return (
    <li className="row row--agent">
      <div className="bubble bubble--agent bubble--typing" role="status" aria-label={`${agentName} is typing`}>
        <span />
        <span />
        <span />
      </div>
    </li>
  );
}

function CallBlock({ block, agentName }: { block: CallBlockItem; agentName: string }): ReactElement {
  return (
    <li className="row row--call">
      <section className={`callblock${block.live ? ' callblock--live' : ''}`} aria-label={callHeader(block)}>
        <header className="callblock__head">
          <PhoneIcon width={14} height={14} />
          <span>{callHeader(block)}</span>
        </header>
        <ol className="callblock__lines">
          {block.lines.map((line) => (
            <li key={line.key} className="callblock__line">
              <span className="callblock__who">{line.role === 'agent' ? agentName : 'You'}</span>
              <span className="callblock__text">
                {line.text}
                {line.interrupted ? <span className="callblock__cut"> (cut off here)</span> : null}
                {line.typed ? <span className="callblock__cut"> (typed)</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </li>
  );
}

export function Thread(props: ThreadProps): ReactElement {
  const { snapshot, pending, opening, notices, agentName, inCall } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

  const items = useMemo(
    () => buildThread(snapshot.transcript, snapshot.interface.activeCallId),
    [snapshot.transcript, snapshot.interface.activeCallId],
  );
  const waiting = useMemo(() => unconfirmedPending(pending, snapshot.transcript), [pending, snapshot.transcript]);
  const waitingIds = useMemo(() => new Set(waiting.map((item) => item.localId)), [waiting]);

  const streaming = pending.filter(
    (item) =>
      item.status === 'sending' &&
      !item.viaCall &&
      item.streamed.length > 0 &&
      !(!waitingIds.has(item.localId) && agentRepliedAfter(snapshot.transcript, item.baseSeq)),
  );
  const awaitingFirstText = pending.some(
    (item) =>
      item.status === 'sending' &&
      !item.viaCall &&
      item.streamed.length === 0 &&
      (waitingIds.has(item.localId) || !agentRepliedAfter(snapshot.transcript, item.baseSeq)),
  );
  const showTyping = awaitingFirstText || (opening && pending.length === 0);
  const showGmail = snapshot.interface.gmailButtonShown && !snapshot.interface.gmailConnected;

  useEffect(() => {
    const element = scroller.current;
    if (element === null) {
      return;
    }
    const onScroll = (): void => {
      pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, []);

  const streamedLength = streaming.reduce((total, item) => total + item.streamed.length, 0);

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || !pinned.current) {
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, [items.length, snapshot.lastSeq, waiting.length, streamedLength, showTyping, showGmail, notices.length, inCall]);

  return (
    <div ref={scroller} className="thread" tabIndex={0} aria-label="Conversation">
      <ol className="thread__list" role="log" aria-live="polite" aria-relevant="additions text">
        {items.map((item) =>
          item.kind === 'call' ? (
            <CallBlock key={item.key} block={item} agentName={agentName} />
          ) : (
            <li key={item.key} className={`row row--${item.role}${item.lastOfGroup ? ' row--last' : ''}`}>
              <div className={`bubble bubble--${item.role}`}>
                <span className="visually-hidden">{item.role === 'agent' ? `${agentName}: ` : 'You: '}</span>
                {item.text}
              </div>
            </li>
          ),
        )}
        {waiting.map((item) => (
          <li key={item.localId} className="row row--user row--last">
            <div className={`bubble bubble--user${item.status === 'failed' ? ' bubble--failed' : ' bubble--pending'}`}>
              <span className="visually-hidden">You: </span>
              {item.text}
            </div>
            {item.status === 'failed' ? (
              <div className="failed" role="alert">
                <span>Not delivered.</span>
                <button type="button" className="link" onClick={() => props.onRetry(item.localId)}>
                  <RetryIcon width={14} height={14} /> Try again
                </button>
                <button type="button" className="link link--quiet" onClick={() => props.onDismiss(item.localId)}>
                  Remove
                </button>
              </div>
            ) : null}
          </li>
        ))}
        {streaming.map((item) => {
          const parts = splitStreaming(item.streamed);
          const bubbles = parts.current === null ? parts.complete : [...parts.complete, parts.current];
          return bubbles.map((text, index) => (
            <li key={`${item.localId}-stream-${index}`} className="row row--agent">
              <div className="bubble bubble--agent" aria-hidden="true">
                {text}
              </div>
            </li>
          ));
        })}
        {showTyping ? <Typing agentName={agentName} /> : null}
      </ol>
      {showGmail ? <GmailCard onSample={props.onSample} /> : null}
      {notices.map((notice) => (
        <div key={notice.id} className="notice" role="status">
          <p>{notice.text}</p>
          <button
            type="button"
            className="round round--ghost round--small"
            onClick={() => props.onDismissNotice(notice.id)}
            aria-label="Dismiss"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
