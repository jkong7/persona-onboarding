import { GMAIL_SCOPE, type GoogleConfig } from './config.ts';
import type { StoredTokens, TokenVault } from './tokenVault.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile';
const REFRESH_MARGIN_MS = 60_000;
const TIMEOUT_MS = 8000;

export type ExchangeFailure = 'exchange_failed' | 'scope_missing';

export type ExchangeResult = { ok: true; tokens: StoredTokens } | { ok: false; reason: ExchangeFailure };

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

function grantsGmail(scope: string): boolean {
  return scope.split(/\s+/).includes(GMAIL_SCOPE);
}

export class GoogleAccounts {
  readonly #config: GoogleConfig;
  readonly #vault: TokenVault;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(config: GoogleConfig, vault: TokenVault, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) {
    this.#config = config;
    this.#vault = vault;
    this.#fetch = fetchImpl;
    this.#now = now;
  }

  get clientId(): string {
    return this.#config.clientId;
  }

  async #token(body: Record<string, string>): Promise<TokenResponse | null> {
    try {
      const response = await this.#fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.#config.clientId,
          client_secret: this.#config.clientSecret,
          ...body,
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as TokenResponse;
    } catch {
      return null;
    }
  }

  async #account(accessToken: string): Promise<string | null> {
    try {
      const response = await this.#fetch(PROFILE_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as { emailAddress?: unknown };
      return typeof body.emailAddress === 'string' && body.emailAddress.length > 0 ? body.emailAddress : null;
    } catch {
      return null;
    }
  }

  async exchange(onboardingId: string, code: string): Promise<ExchangeResult> {
    const granted = await this.#token({
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'postmessage',
    });
    if (granted === null || typeof granted.access_token !== 'string') {
      return { ok: false, reason: 'exchange_failed' };
    }
    const scope = typeof granted.scope === 'string' ? granted.scope : '';
    if (!grantsGmail(scope)) {
      await this.#revoke(granted.access_token);
      return { ok: false, reason: 'scope_missing' };
    }
    const account = await this.#account(granted.access_token);
    if (account === null) {
      return { ok: false, reason: 'exchange_failed' };
    }
    const now = this.#now();
    const tokens: StoredTokens = {
      account,
      accessToken: granted.access_token,
      refreshToken: typeof granted.refresh_token === 'string' ? granted.refresh_token : null,
      expiresAt: now.getTime() + (typeof granted.expires_in === 'number' ? granted.expires_in : 3600) * 1000,
      scope,
    };
    this.#vault.save(onboardingId, tokens, now.toISOString());
    return { ok: true, tokens };
  }

  async accessToken(onboardingId: string): Promise<string | null> {
    const tokens = this.#vault.load(onboardingId);
    if (tokens === null) {
      return null;
    }
    const now = this.#now();
    if (tokens.expiresAt - REFRESH_MARGIN_MS > now.getTime()) {
      return tokens.accessToken;
    }
    if (tokens.refreshToken === null) {
      return null;
    }
    const refreshed = await this.#token({ refresh_token: tokens.refreshToken, grant_type: 'refresh_token' });
    if (refreshed === null || typeof refreshed.access_token !== 'string') {
      return null;
    }
    this.#vault.save(
      onboardingId,
      {
        ...tokens,
        accessToken: refreshed.access_token,
        expiresAt: now.getTime() + (typeof refreshed.expires_in === 'number' ? refreshed.expires_in : 3600) * 1000,
      },
      now.toISOString(),
    );
    return refreshed.access_token;
  }

  async #revoke(token: string): Promise<void> {
    try {
      await this.#fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return;
    }
  }

  async disconnect(onboardingId: string): Promise<boolean> {
    const tokens = this.#vault.load(onboardingId);
    if (tokens === null) {
      return false;
    }
    await this.#revoke(tokens.refreshToken ?? tokens.accessToken);
    this.#vault.remove(onboardingId);
    return true;
  }
}
