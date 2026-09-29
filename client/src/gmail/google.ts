export type GmailOutcome = 'popup_closed' | 'popup_blocked' | 'access_denied';

export type CodeResult = { ok: true; code: string } | { ok: false; outcome: GmailOutcome };

interface CodeResponse {
  code?: string;
  error?: string;
}

interface CodeError {
  type?: string;
}

interface CodeClient {
  requestCode: () => void;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: 'popup';
  select_account: boolean;
  callback: (response: CodeResponse) => void;
  error_callback: (error: CodeError) => void;
}

interface GoogleIdentity {
  accounts: { oauth2: { initCodeClient: (config: CodeClientConfig) => CodeClient } };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT_MS = 10_000;

let loading: Promise<GoogleIdentity> | null = null;

export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  if (window.google !== undefined) {
    return Promise.resolve(window.google);
  }
  if (loading !== null) {
    return loading;
  }
  loading = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => fail(), LOAD_TIMEOUT_MS);
    const fail = (): void => {
      window.clearTimeout(timer);
      loading = null;
      script.remove();
      reject(new Error('Google sign-in could not be loaded'));
    };
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.google === undefined) {
        fail();
        return;
      }
      resolve(window.google);
    };
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}

export function outcomeOf(error: string | undefined): GmailOutcome {
  if (error === 'popup_failed_to_open') {
    return 'popup_blocked';
  }
  if (error === 'access_denied') {
    return 'access_denied';
  }
  return 'popup_closed';
}

export function requestGmailCode(identity: GoogleIdentity, clientId: string, scope: string): Promise<CodeResult> {
  return new Promise<CodeResult>((resolve) => {
    let settled = false;
    const settle = (result: CodeResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const client = identity.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope,
      ux_mode: 'popup',
      select_account: true,
      callback: (response) => {
        if (typeof response.code === 'string' && response.code.length > 0) {
          settle({ ok: true, code: response.code });
        } else {
          settle({ ok: false, outcome: outcomeOf(response.error) });
        }
      },
      error_callback: (error) => settle({ ok: false, outcome: outcomeOf(error.type) }),
    });
    try {
      client.requestCode();
    } catch {
      settle({ ok: false, outcome: 'popup_blocked' });
    }
  });
}
