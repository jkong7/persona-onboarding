export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  encryptionKey: Buffer;
}

export type GoogleUnavailable = 'missing_client' | 'missing_encryption_key';

export type GoogleConfigResult = { ok: true; config: GoogleConfig } | { ok: false; reason: GoogleUnavailable };

export function googleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): GoogleConfigResult {
  const clientId = env['GOOGLE_CLIENT_ID']?.trim() ?? '';
  const clientSecret = env['GOOGLE_CLIENT_SECRET']?.trim() ?? '';
  if (clientId.length === 0 || clientSecret.length === 0) {
    return { ok: false, reason: 'missing_client' };
  }
  const key = env['TOKEN_ENCRYPTION_KEY']?.trim() ?? '';
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    return { ok: false, reason: 'missing_encryption_key' };
  }
  return { ok: true, config: { clientId, clientSecret, encryptionKey: Buffer.from(key, 'hex') } };
}
