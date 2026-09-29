import { describe, expect, it } from 'vitest';
import { outcomeOf, requestGmailCode } from './google.ts';

type Config = Parameters<Parameters<typeof requestGmailCode>[0]['accounts']['oauth2']['initCodeClient']>[0];

function identity(act: (config: Config) => void) {
  return {
    accounts: {
      oauth2: {
        initCodeClient: (config: Config) => ({ requestCode: () => act(config) }),
      },
    },
  };
}

describe('asking Google for access', () => {
  it('returns the code when the person allows it', async () => {
    const result = await requestGmailCode(
      identity((config) => config.callback({ code: 'abc' })),
      'client',
      'scope',
    );
    expect(result).toEqual({ ok: true, code: 'abc' });
  });

  it('asks for one scope in a popup', async () => {
    let seen: Config | null = null;
    await requestGmailCode(
      identity((config) => {
        seen = config;
        config.callback({ code: 'abc' });
      }),
      'client',
      'https://www.googleapis.com/auth/gmail.readonly',
    );
    expect(seen).toMatchObject({
      client_id: 'client',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      ux_mode: 'popup',
    });
  });

  it('tells a denial from a closed window from a blocked one', async () => {
    expect(
      await requestGmailCode(identity((config) => config.callback({ error: 'access_denied' })), 'c', 's'),
    ).toEqual({ ok: false, outcome: 'access_denied' });
    expect(
      await requestGmailCode(identity((config) => config.error_callback({ type: 'popup_closed' })), 'c', 's'),
    ).toEqual({ ok: false, outcome: 'popup_closed' });
    expect(
      await requestGmailCode(identity((config) => config.error_callback({ type: 'popup_failed_to_open' })), 'c', 's'),
    ).toEqual({ ok: false, outcome: 'popup_blocked' });
  });

  it('treats a thrown error as a blocked window and settles once', async () => {
    const result = await requestGmailCode(
      identity(() => {
        throw new Error('blocked');
      }),
      'c',
      's',
    );
    expect(result).toEqual({ ok: false, outcome: 'popup_blocked' });
    const twice = await requestGmailCode(
      identity((config) => {
        config.callback({ code: 'first' });
        config.error_callback({ type: 'popup_closed' });
      }),
      'c',
      's',
    );
    expect(twice).toEqual({ ok: true, code: 'first' });
  });

  it('maps unknown errors to a closed window', () => {
    expect(outcomeOf(undefined)).toBe('popup_closed');
    expect(outcomeOf('something_else')).toBe('popup_closed');
  });
});
