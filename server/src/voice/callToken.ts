import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface CallClaims {
  onboardingId: string;
  callId: string;
  expiresAt: number;
}

export const CALL_TOKEN_TTL_MS = 30 * 60 * 1000;

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function isClaims(value: unknown): value is CallClaims {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const claims = value as Record<string, unknown>;
  return (
    typeof claims['onboardingId'] === 'string' &&
    typeof claims['callId'] === 'string' &&
    typeof claims['expiresAt'] === 'number'
  );
}

export class CallTokens {
  readonly #secret: Buffer;

  constructor(secret?: string) {
    this.#secret =
      secret !== undefined && secret.length >= 16 ? Buffer.from(secret, 'utf8') : randomBytes(32);
  }

  #signature(payload: string): Buffer {
    return createHmac('sha256', this.#secret).update(payload).digest();
  }

  sign(claims: CallClaims): string {
    const payload = encode(JSON.stringify(claims));
    return `${payload}.${this.#signature(payload).toString('base64url')}`;
  }

  verify(token: string, nowMs: number): CallClaims | null {
    const [payload, signature, extra] = token.split('.');
    if (payload === undefined || signature === undefined || extra !== undefined) {
      return null;
    }
    const expected = this.#signature(payload);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return null;
    }
    try {
      const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!isClaims(claims) || claims.expiresAt <= nowMs) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }
}
