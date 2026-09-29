import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GMAIL_SCOPE, googleConfigFromEnv } from '../src/gmail/config.ts';
import { bodyOf, GmailInbox, parseAddress } from '../src/gmail/gmailInbox.ts';
import { GoogleAccounts } from '../src/gmail/google.ts';
import { TokenVault } from '../src/gmail/tokenVault.ts';
import { createApp } from '../src/http/app.ts';
import type { Snapshot } from '../src/http/snapshot.ts';
import { openDatabase } from '../src/store/database.ts';
import { OnboardingService } from '../src/store/onboardingService.ts';
import { allText, scriptedModel, type ScriptedStep } from './agentHelpers.ts';
import { T0 } from './helpers.ts';

const NOW = new Date(T0);
const KEY = randomBytes(32);

interface Call {
  url: string;
  body: string;
  auth: string;
}

function google(responses: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const call: Call = { url, body: typeof init?.body === 'string' ? init.body : '', auth: headers.get('authorization') ?? '' };
    calls.push(call);
    const match = Object.keys(responses).find((prefix) => url.startsWith(prefix));
    return match === undefined ? new Response('not found', { status: 404 }) : responses[match]!(call);
  }) as unknown as typeof fetch;
  return { calls, fakeFetch };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(steps: ScriptedStep[], responses: Record<string, (call: Call) => Response>) {
  const db = openDatabase(':memory:');
  const service = new OnboardingService(db);
  const vault = new TokenVault(db, KEY);
  const { calls, fakeFetch } = google(responses);
  const accounts = new GoogleAccounts(
    { clientId: 'client-id', clientSecret: 'client-secret', encryptionKey: KEY },
    vault,
    fakeFetch,
    () => NOW,
  );
  const model = scriptedModel(steps);
  const app = createApp({
    service,
    models: { text: model, voice: model },
    now: () => NOW,
    google: accounts,
    inbox: (record) =>
      record.fields.gmail.mode === 'real' ? new GmailInbox(() => accounts.accessToken(record.id), fakeFetch, () => NOW) : null,
  });
  return { app, service, vault, accounts, calls, model, db, id: service.create().id };
}

const GRANTED = {
  'https://oauth2.googleapis.com/token': () =>
    json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: `openid ${GMAIL_SCOPE}` }),
  'https://gmail.googleapis.com/gmail/v1/users/me/profile': () => json({ emailAddress: 'jon@example.com' }),
  'https://gmail.googleapis.com/gmail/v1/users/me/threads?': () => json({ threads: [{ id: 'thread1' }] }),
  'https://gmail.googleapis.com/gmail/v1/users/me/threads/thread1': () =>
    json({
      id: 'thread1',
      messages: [
        {
          id: 'm1',
          snippet: 'Could you send two or three times that work?',
          internalDate: String(NOW.getTime() - 2 * 60 * 60 * 1000),
          labelIds: ['INBOX', 'UNREAD'],
          payload: {
            headers: [
              { name: 'From', value: 'Priya Raman <priya@halcyon.example>' },
              { name: 'Subject', value: 'Interview availability' },
            ],
            mimeType: 'multipart/alternative',
            parts: [
              {
                mimeType: 'text/plain',
                body: { data: Buffer.from('Could you send two or three times that work?').toString('base64url') },
              },
            ],
          },
        },
      ],
    }),
  'https://oauth2.googleapis.com/revoke': () => json({}),
};

function exchange(code: unknown, headers: Record<string, string> = { 'x-requested-with': 'XmlHttpRequest' }): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ code }),
  };
}

describe('connecting Gmail', () => {
  it('reports whether Gmail is set up', async () => {
    const { app } = setup([], GRANTED);
    expect(await (await app.request('/api/gmail/config')).json()).toEqual({
      enabled: true,
      clientId: 'client-id',
      scope: GMAIL_SCOPE,
    });
    const bare = createApp({
      service: new OnboardingService(openDatabase(':memory:')),
      models: { text: scriptedModel([]), voice: scriptedModel([]) },
    });
    expect(await (await bare.request('/api/gmail/config')).json()).toMatchObject({ enabled: false, clientId: null });
  });

  it('exchanges the code on the server, stores the tokens encrypted, and lets the agent look', async () => {
    const { app, service, calls, model, db, id } = setup(
      [{ text: 'Connected. Priya Raman is asking for interview times.' }],
      GRANTED,
    );
    const response = await app.request(`/api/onboardings/${id}/gmail/exchange`, exchange('auth-code'));
    const body = (await response.json()) as { connected: boolean; reply: { text: string }; snapshot: Snapshot };
    expect(body.connected).toBe(true);
    expect(body.snapshot.interface).toMatchObject({ gmailConnected: true, gmailMode: 'real' });
    expect(service.get(id).fields.gmail).toMatchObject({ value: 'jon@example.com', mode: 'real', status: 'confirmed' });

    const token = calls.find((call) => call.url.startsWith('https://oauth2.googleapis.com/token'))!;
    expect(token.body).toContain('code=auth-code');
    expect(token.body).toContain('redirect_uri=postmessage');
    expect(token.body).toContain('client_secret=client-secret');

    const row = db.prepare('SELECT ciphertext FROM gmail_tokens WHERE onboarding_id = ?').get(id) as {
      ciphertext: string;
    };
    expect(row.ciphertext).not.toContain('access-1');
    expect(Buffer.from(row.ciphertext, 'base64').toString('utf8')).not.toContain('refresh-1');

    const sent = allText(model.requests[0]!);
    expect(sent).toContain('<event type="gmail_connected" inbox="real"/>');
    expect(sent).toContain('<inbox_preview source="their connected Gmail">');
    expect(sent).toContain('Priya Raman');
    expect(JSON.stringify(body)).not.toContain('access-1');
    expect(JSON.stringify(body)).not.toContain('refresh-1');
  });

  it('refuses a request that did not come from the page', async () => {
    const { app, id, calls } = setup([], GRANTED);
    const response = await app.request(`/api/onboardings/${id}/gmail/exchange`, exchange('auth-code', {}));
    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('treats a grant without the Gmail permission as not connected', async () => {
    const { app, service, vault, id, calls } = setup([{ text: 'That did not include mail access.' }], {
      ...GRANTED,
      'https://oauth2.googleapis.com/token': () =>
        json({ access_token: 'access-1', expires_in: 3600, scope: 'openid email' }),
    });
    const response = await app.request(`/api/onboardings/${id}/gmail/exchange`, exchange('auth-code'));
    expect(await response.json()).toMatchObject({ connected: false, reason: 'scope_missing' });
    expect(service.get(id).fields.gmail).toMatchObject({ value: null, failureReason: 'scope_missing' });
    expect(vault.load(id)).toBeNull();
    expect(calls.some((call) => call.url.startsWith('https://oauth2.googleapis.com/revoke'))).toBe(true);
  });

  it('carries on when Google rejects the code', async () => {
    const { app, service, id } = setup([{ text: 'That did not go through. Want the sample inbox?' }], {
      ...GRANTED,
      'https://oauth2.googleapis.com/token': () => json({ error: 'invalid_grant' }, 400),
    });
    const response = await app.request(`/api/onboardings/${id}/gmail/exchange`, exchange('bad'));
    expect(await response.json()).toMatchObject({ connected: false, reason: 'exchange_failed' });
    expect(service.get(id).fields.gmail.failureReason).toBe('exchange_failed');
  });

  it('refreshes an expired token and keeps the refresh token', async () => {
    const { accounts, vault, calls, id } = setup([], {
      ...GRANTED,
      'https://oauth2.googleapis.com/token': () => json({ access_token: 'access-2', expires_in: 3600 }),
    });
    vault.save(
      id,
      { account: 'jon@example.com', accessToken: 'old', refreshToken: 'refresh-1', expiresAt: NOW.getTime() - 1, scope: GMAIL_SCOPE },
      T0,
    );
    expect(await accounts.accessToken(id)).toBe('access-2');
    expect(calls[0]!.body).toContain('grant_type=refresh_token');
    expect(vault.load(id)).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-1' });
  });

  it('disconnects, revokes and forgets the tokens', async () => {
    const { app, service, vault, calls, id } = setup([{ text: 'Connected.' }], GRANTED);
    await app.request(`/api/onboardings/${id}/gmail/exchange`, exchange('auth-code'));
    const response = await app.request(`/api/onboardings/${id}/gmail/disconnect`, { method: 'POST' });
    expect(await response.json()).toMatchObject({ disconnected: true });
    expect(vault.load(id)).toBeNull();
    expect(service.get(id).fields.gmail).toMatchObject({ value: null, mode: null });
    expect(calls.at(-1)!.body).toContain('token=refresh-1');
  });

  it('cannot read tokens saved for another conversation or with another key', () => {
    const db = openDatabase(':memory:');
    const vault = new TokenVault(db, KEY);
    const tokens = { account: 'a@example.com', accessToken: 'x', refreshToken: 'y', expiresAt: 1, scope: GMAIL_SCOPE };
    vault.save('one', tokens, T0);
    db.prepare("UPDATE gmail_tokens SET onboarding_id = 'two' WHERE onboarding_id = 'one'").run();
    expect(vault.load('two')).toBeNull();
    const other = new TokenVault(db, randomBytes(32));
    db.prepare("UPDATE gmail_tokens SET onboarding_id = 'one' WHERE onboarding_id = 'two'").run();
    expect(other.load('one')).toBeNull();
    expect(vault.load('one')).toEqual(tokens);
  });
});

describe('reading Gmail', () => {
  it('parses senders and bodies', () => {
    expect(parseAddress('Priya Raman <priya@halcyon.example>')).toEqual({
      name: 'Priya Raman',
      email: 'priya@halcyon.example',
    });
    expect(parseAddress('"Raman, Priya" <p@x.example>')).toEqual({ name: 'Raman, Priya', email: 'p@x.example' });
    expect(parseAddress('plain@x.example')).toEqual({ name: 'plain@x.example', email: 'plain@x.example' });
    expect(
      bodyOf({
        mimeType: 'text/html',
        body: { data: Buffer.from('<p>Hello <b>there</b></p><style>p{}</style>').toString('base64url') },
      }).replace(/\s+/g, ' ').trim(),
    ).toBe('Hello there');
  });

  it('rejects a thread id that is not one', async () => {
    const { fakeFetch, calls } = google(GRANTED);
    const inbox = new GmailInbox(async () => 'access-1', fakeFetch, () => NOW);
    expect(await inbox.read('../../profile')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('needs a client, a secret and a key', () => {
    expect(googleConfigFromEnv({})).toEqual({ ok: false, reason: 'missing_client' });
    expect(googleConfigFromEnv({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual({
      ok: false,
      reason: 'missing_encryption_key',
    });
    expect(
      googleConfigFromEnv({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32) }).ok,
    ).toBe(true);
  });
});
