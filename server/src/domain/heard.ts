export interface HeardInput {
  text: string;
  heardText?: string | null;
  playedFraction?: number | null;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(1, Math.max(0, value));
}

export function truncateToFraction(text: string, playedFraction: number): string {
  const fraction = clampFraction(playedFraction);
  if (fraction >= 1) {
    return text;
  }
  const points = Array.from(text);
  const cut = Math.floor(points.length * fraction);
  if (cut <= 0) {
    return '';
  }
  const head = points.slice(0, cut).join('');
  const next = points[cut];
  if (next === undefined || /\s/u.test(next)) {
    return head.trimEnd();
  }
  const boundary = head.search(/\s\S*$/u);
  if (boundary === -1) {
    return '';
  }
  return head.slice(0, boundary).trimEnd();
}

export function resolveHeard(input: HeardInput): string {
  if (typeof input.heardText === 'string') {
    const heard = input.heardText.trim();
    return heard.length <= input.text.length ? heard : input.text;
  }
  if (typeof input.playedFraction === 'number') {
    return truncateToFraction(input.text, input.playedFraction);
  }
  return input.text;
}
