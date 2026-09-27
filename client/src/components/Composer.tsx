import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { SendIcon } from './Icons.tsx';

export interface ComposerProps {
  disabled: boolean;
  inCall: boolean;
  agentName: string;
  onSend: (text: string) => void;
}

const MAX_LENGTH = 4000;

export function Composer({ disabled, inCall, agentName, onSend }: ComposerProps): ReactElement {
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const element = field.current;
    if (element === null) {
      return;
    }
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, []);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || disabled) {
      return;
    }
    onSend(trimmed);
    setText('');
    requestAnimationFrame(() => {
      resize();
      field.current?.focus();
    });
  }, [disabled, onSend, resize, text]);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const label = inCall ? `Type to ${agentName} during the call` : `Message ${agentName}`;

  return (
    <form className="composer" onSubmit={onSubmit}>
      <label className="visually-hidden" htmlFor="composer-field">
        {label}
      </label>
      <textarea
        id="composer-field"
        ref={field}
        className="composer__field"
        rows={1}
        value={text}
        maxLength={MAX_LENGTH}
        placeholder={inCall ? 'Type instead of speaking' : 'Message'}
        disabled={disabled}
        onChange={(event) => {
          setText(event.target.value);
          resize();
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        enterKeyHint="send"
      />
      <button
        type="submit"
        className="composer__send"
        disabled={disabled || text.trim().length === 0}
        aria-label="Send message"
      >
        <SendIcon />
      </button>
    </form>
  );
}
