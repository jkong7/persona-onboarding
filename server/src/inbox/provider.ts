import { sampleThreads } from './sample.ts';
import type { EmailThread, InboxProvider, SearchOptions, ThreadSummary } from './types.ts';

export const SEARCH_LIMIT_MAX = 10;
export const SNIPPET_LENGTH = 160;
export const BODY_LENGTH = 4000;

export function describeAge(receivedAt: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(receivedAt)) / 60_000));
  if (minutes < 60) {
    return minutes <= 1 ? 'just now' : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function summarize(thread: EmailThread, now: Date): ThreadSummary {
  const body = thread.messages.at(-1)?.body ?? '';
  const flat = body.replace(/\s+/g, ' ').trim();
  return {
    threadId: thread.id,
    from: `${thread.from.name} <${thread.from.email}>`,
    subject: thread.subject,
    received: describeAge(thread.receivedAt, now),
    receivedAt: thread.receivedAt,
    unread: thread.unread,
    snippet: flat.length > SNIPPET_LENGTH ? `${flat.slice(0, SNIPPET_LENGTH).trimEnd()}...` : flat,
  };
}

function words(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}@.]+/u)
    .filter((word) => word.length > 1);
}

export function matches(thread: EmailThread, query: string | null): boolean {
  if (query === null) {
    return true;
  }
  const wanted = words(query);
  if (wanted.length === 0) {
    return true;
  }
  const haystack = [
    thread.subject,
    thread.from.name,
    thread.from.email,
    thread.labels.join(' '),
    ...thread.messages.map((message) => message.body),
  ]
    .join(' ')
    .toLowerCase();
  return wanted.some((word) => haystack.includes(word));
}

export function clampLimit(limit: unknown): number {
  const parsed = typeof limit === 'number' && Number.isFinite(limit) ? Math.round(limit) : 5;
  return Math.min(SEARCH_LIMIT_MAX, Math.max(1, parsed));
}

export class SampleInbox implements InboxProvider {
  readonly kind = 'sample' as const;
  readonly #now: () => Date;

  constructor(now: () => Date = () => new Date()) {
    this.#now = now;
  }

  async search(options: SearchOptions): Promise<ThreadSummary[]> {
    const now = this.#now();
    return sampleThreads(now)
      .filter((thread) => !options.unreadOnly || thread.unread)
      .filter((thread) => matches(thread, options.query))
      .sort((left, right) => Date.parse(right.receivedAt) - Date.parse(left.receivedAt))
      .slice(0, clampLimit(options.limit))
      .map((thread) => summarize(thread, now));
  }

  async read(threadId: string): Promise<EmailThread | null> {
    return sampleThreads(this.#now()).find((thread) => thread.id === threadId) ?? null;
  }
}
