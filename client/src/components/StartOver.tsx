import { useEffect, useRef, useState, type ReactElement } from 'react';

export interface StartOverProps {
  onConfirm: () => Promise<void>;
}

export function StartOver({ onConfirm }: StartOverProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const dialog = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element === null) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const confirm = async (): Promise<void> => {
    setWorking(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <button type="button" className="button button--quiet" onClick={() => setOpen(true)}>
        Start over
      </button>
      <dialog
        ref={dialog}
        className="dialog"
        aria-labelledby="start-over-title"
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <h2 id="start-over-title" className="dialog__title">
          Start a fresh thread?
        </h2>
        <p className="dialog__text">
          This opens a new conversation with nothing saved. The current one stays on the server but leaves this browser.
        </p>
        <div className="dialog__actions">
          <button type="button" className="button" onClick={() => setOpen(false)} disabled={working}>
            Keep this thread
          </button>
          <button type="button" className="button button--primary" onClick={() => void confirm()} disabled={working}>
            {working ? 'Starting...' : 'Start over'}
          </button>
        </div>
      </dialog>
    </>
  );
}
