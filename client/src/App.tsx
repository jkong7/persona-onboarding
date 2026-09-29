import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { useCall } from './call/useCall.ts';
import { CallPanel } from './components/CallPanel.tsx';
import { Composer } from './components/Composer.tsx';
import { CloseIcon, PanelIcon } from './components/Icons.tsx';
import { IncomingCall } from './components/IncomingCall.tsx';
import { KnowledgePanel } from './components/KnowledgePanel.tsx';
import { StartOver } from './components/StartOver.tsx';
import { Thread } from './components/Thread.tsx';
import { useOnboarding } from './hooks/useOnboarding.ts';
import { agentName as nameOfAgent, phaseLabel, userName as nameOfUser } from './lib/status.ts';
import { loadReviewerTools, saveReviewerTools } from './lib/storage.ts';

export function App(): ReactElement {
  const onboarding = useOnboarding();
  const { snapshot } = onboarding;
  const call = useCall({
    onboardingId: onboarding.onboardingId,
    snapshot,
    applySnapshot: onboarding.applySnapshot,
    refresh: onboarding.refresh,
    notify: onboarding.notify,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [reviewer, setReviewer] = useState(loadReviewerTools);

  const toggleReviewer = useCallback(() => {
    setReviewer((current) => {
      saveReviewerTools(!current);
      return !current;
    });
    setSheetOpen(false);
  }, []);
  const sheet = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const element = sheet.current;
    if (element === null) {
      return;
    }
    if (sheetOpen && !element.open) {
      element.showModal();
    } else if (!sheetOpen && element.open) {
      element.close();
    }
  }, [sheetOpen]);

  const agent = nameOfAgent(snapshot);
  const user = nameOfUser(snapshot);

  useEffect(() => {
    document.title = agent === 'Persona' ? 'Persona' : `${agent} · Persona`;
  }, [agent]);

  const viaCall = call.active ? call.sendTyped : null;

  const send = useCallback(
    (text: string) => {
      onboarding.send(text, viaCall);
    },
    [onboarding, viaCall],
  );

  const retry = useCallback(
    (localId: string) => {
      onboarding.retry(localId, viaCall);
    },
    [onboarding, viaCall],
  );

  const chooseSample = useCallback(async () => {
    const reply = await onboarding.chooseSampleInbox();
    if (reply !== null && reply.spoken === true && call.active) {
      call.speak(reply.text);
    }
  }, [call, onboarding]);

  const connectGmail = useCallback(async () => {
    const reply = await onboarding.connectGmail();
    if (reply !== null && reply.spoken === true && call.active) {
      call.speak(reply.text);
    }
  }, [call, onboarding]);

  const startOver = useCallback(async () => {
    if (call.active) {
      call.hangUp();
    }
    await onboarding.startOver();
  }, [call, onboarding]);

  const ringing = snapshot?.interface.ringing === true && !call.active;
  const acceptingCall = call.view.phase === 'requesting_mic';
  const sampleInbox = snapshot?.interface.gmailMode === 'sample';

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true" />
          <span className="topbar__name">Persona</span>
          <span className="topbar__tag">onboarding</span>
        </div>
        <div className="topbar__actions">
          {reviewer ? (
            <>
              <button
                type="button"
                className="button button--quiet topbar__panel"
                onClick={() => setSheetOpen(true)}
                disabled={snapshot === null}
                aria-label="What Persona knows"
              >
                <PanelIcon width={18} height={18} />
                <span className="topbar__panel-text">What Persona knows</span>
              </button>
              <StartOver onConfirm={startOver} />
            </>
          ) : null}
          <button
            type="button"
            className="button button--quiet topbar__reviewer"
            onClick={toggleReviewer}
            aria-pressed={reviewer}
          >
            {reviewer ? 'Hide reviewer tools' : 'Reviewer tools'}
          </button>
        </div>
      </header>

      {onboarding.connection === 'reconnecting' && onboarding.status === 'ready' ? (
        <div className="banner" role="status">
          Connection lost. Reconnecting. Nothing is lost.
        </div>
      ) : null}

      <main className={reviewer ? 'stage' : 'stage stage--solo'}>
        <section className="phone" aria-label={`Conversation with ${agent}`}>
          <header className="phone__head">
            <div className="phone__avatar" aria-hidden="true">
              {agent.trim().charAt(0).toUpperCase() || 'P'}
            </div>
            <div className="phone__who">
              <h1 className="phone__name">{agent}</h1>
              <p className="phone__sub">
                {snapshot === null ? 'Opening' : phaseLabel(snapshot.phase)}
                {user === null ? '' : ` · ${user}`}
              </p>
            </div>
            {sampleInbox ? <span className="tag tag--pending phone__sample">Sample inbox</span> : null}
          </header>

          {call.active && !acceptingCall ? (
            <CallPanel
              view={call.view}
              agentName={agent}
              userName={user}
              onHangUp={call.hangUp}
              onToggleMute={call.toggleMute}
            />
          ) : null}

          {snapshot === null ? (
            <div className="thread thread--empty" role="status">
              {onboarding.status === 'unreachable' ? (
                <>
                  <p>The server is not answering. Trying again by itself.</p>
                  <button type="button" className="button" onClick={onboarding.reload}>
                    Try now
                  </button>
                </>
              ) : (
                <p>Opening your thread</p>
              )}
            </div>
          ) : (
            <Thread
              snapshot={snapshot}
              pending={onboarding.pending}
              opening={onboarding.opening}
              notices={onboarding.notices}
              agentName={agent}
              inCall={call.active}
              onRetry={retry}
              onDismiss={onboarding.dismiss}
              onDismissNotice={onboarding.dismissNotice}
              onSample={chooseSample}
              onConnect={connectGmail}
              gmailAvailable={onboarding.gmailAvailable}
            />
          )}

          <Composer disabled={snapshot === null} inCall={call.active} agentName={agent} onSend={send} />

          {ringing || acceptingCall ? (
            <IncomingCall
              agentName={agent}
              busy={acceptingCall}
              onAccept={() => void call.accept()}
              onDecline={() => void call.decline()}
            />
          ) : null}
        </section>

        {snapshot === null || !reviewer ? null : (
          <aside className="side" aria-labelledby="panel-title">
            <KnowledgePanel snapshot={snapshot} activity={onboarding.activity} headingId="panel-title" />
          </aside>
        )}
      </main>

      <dialog
        ref={sheet}
        className="sheet"
        aria-labelledby="sheet-title"
        onClose={() => setSheetOpen(false)}
        onCancel={() => setSheetOpen(false)}
        onClick={(event) => {
          if (event.target === sheet.current) {
            setSheetOpen(false);
          }
        }}
      >
        <div className="sheet__inner">
          <button
            type="button"
            className="round round--ghost sheet__close"
            onClick={() => setSheetOpen(false)}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
          {snapshot === null || !sheetOpen ? null : (
            <KnowledgePanel snapshot={snapshot} activity={onboarding.activity} headingId="sheet-title" />
          )}
        </div>
      </dialog>
    </div>
  );
}
