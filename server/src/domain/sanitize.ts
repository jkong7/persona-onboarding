import { MAX_RAW_INPUT_LENGTH } from './fields.ts';

export type SanitizeFailure = 'not_a_string' | 'empty_value';

export type SanitizeResult =
  | { ok: true; value: string; truncated: boolean }
  | { ok: false; reason: SanitizeFailure };

export function sanitizeValue(input: unknown, maxLength: number): SanitizeResult {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'not_a_string' };
  }
  const bounded = input.slice(0, MAX_RAW_INPUT_LENGTH);
  const spaced = bounded.replace(/[\t\n\v\f\r]+/g, ' ');
  const stripped = spaced.replace(/\p{Cc}/gu, '');
  const collapsed = stripped.replace(/\s+/gu, ' ').trim();
  if (collapsed.length === 0) {
    return { ok: false, reason: 'empty_value' };
  }
  const points = Array.from(collapsed);
  if (points.length <= maxLength && bounded.length === input.length) {
    return { ok: true, value: collapsed, truncated: false };
  }
  if (points.length <= maxLength) {
    return { ok: true, value: collapsed, truncated: true };
  }
  return { ok: true, value: points.slice(0, maxLength).join('').trim(), truncated: true };
}
