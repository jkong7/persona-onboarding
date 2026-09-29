import { BODY_LENGTH, clampLimit, describeAge, SNIPPET_LENGTH } from '../inbox/provider.ts';
import type { EmailAddress, EmailMessage, EmailThread, InboxProvider, SearchOptions, ThreadSummary } from '../inbox/types.ts';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TIMEOUT_MS = 8000;

interface Header {
  name?: unknown;
  value?: unknown;
}

interface Part {
  mimeType?: unknown;
  body?: { data?: unknown };
  parts?: Part[];
  headers?: Header[];
}

interface GmailMessage {
  id?: unknown;
  snippet?: unknown;
  internalDate?: unknown;
  labelIds?: unknown;
  payload?: Part;
}

interface GmailThread {
  id?: unknown;
  messages?: GmailMessage[];
}

export function parseAddress(raw: string): EmailAddress {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (match === null) {
    return { name: raw.trim(), email: raw.trim() };
  }
  const email = (match[2] ?? '').trim();
  const name = (match[1] ?? '').trim();
  return { name: name.length > 0 ? name : email, email };
}

function header(part: Part | undefined, name: string): string {
  const found = (part?.headers ?? []).find(
    (entry) => typeof entry.name === 'string' && entry.name.toLowerCase() === name.toLowerCase(),
  );
  return typeof found?.value === 'string' ? found.value : '';
}

function decode(data: unknown): string {
  return typeof data === 'string' ? Buffer.from(data, 'base64url').toString('utf8') : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

export function bodyOf(part: Part | undefined): string {
  if (part === undefined) {
    return '';
  }
  const plain = findPart(part, 'text/plain');
  if (plain !== null) {
    return decode(plain.body?.data);
  }
  const html = findPart(part, 'text/html');
  return html === null ? '' : stripHtml(decode(html.body?.data));
}

function findPart(part: Part, mimeType: string): Part | null {
  if (part.mimeType === mimeType && typeof part.body?.data === 'string') {
    return part;
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function sentAt(message: GmailMessage): string {
  const millis = Number(message.internalDate);
  return Number.isFinite(millis) && millis > 0 ? new Date(millis).toISOString() : new Date(0).toISOString();
}

function isUnread(message: GmailMessage): boolean {
  return Array.isArray(message.labelIds) && message.labelIds.includes('UNREAD');
}

function flat(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit).trimEnd()}...` : clean;
}

export class GmailInbox implements InboxProvider {
  readonly kind = 'real' as const;
  readonly #token: () => Promise<string | null>;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(token: () => Promise<string | null>, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) {
    this.#token = token;
    this.#fetch = fetchImpl;
    this.#now = now;
  }

  async #get<T>(path: string): Promise<T> {
    const token = await this.#token();
    if (token === null) {
      throw new Error('gmail is not connected');
    }
    const response = await this.#fetch(`${API}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`gmail answered ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async search(options: SearchOptions): Promise<ThreadSummary[]> {
    const params = new URLSearchParams({ maxResults: String(clampLimit(options.limit)), labelIds: 'INBOX' });
    const terms = [options.query?.trim() ?? '', options.unreadOnly ? 'is:unread' : ''].filter(
      (term) => term.length > 0,
    );
    if (terms.length > 0) {
      params.set('q', terms.join(' '));
    }
    const listed = await this.#get<{ threads?: { id?: unknown }[] }>(`/threads?${params.toString()}`);
    const ids = (listed.threads ?? []).flatMap((thread) => (typeof thread.id === 'string' ? [thread.id] : []));
    const now = this.#now();
    const threads = await Promise.all(
      ids.map((id) =>
        this.#get<GmailThread>(
          `/threads/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
        ).catch(() => null),
      ),
    );
    return threads.flatMap((thread) => {
      const last = thread?.messages?.at(-1);
      if (thread === null || last === undefined || typeof thread.id !== 'string') {
        return [];
      }
      const from = parseAddress(header(last.payload, 'From'));
      const receivedAt = sentAt(last);
      return [
        {
          threadId: thread.id,
          from: `${from.name} <${from.email}>`,
          subject: header(thread.messages?.[0]?.payload, 'Subject') || '(no subject)',
          received: describeAge(receivedAt, now),
          receivedAt,
          unread: (thread.messages ?? []).some(isUnread),
          snippet: flat(typeof last.snippet === 'string' ? last.snippet : '', SNIPPET_LENGTH),
        },
      ];
    });
  }

  async read(threadId: string): Promise<EmailThread | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(threadId)) {
      return null;
    }
    let thread: GmailThread;
    try {
      thread = await this.#get<GmailThread>(`/threads/${encodeURIComponent(threadId)}?format=full`);
    } catch {
      return null;
    }
    const messages = thread.messages ?? [];
    const first = messages[0];
    const last = messages.at(-1);
    if (first === undefined || last === undefined) {
      return null;
    }
    const parsed: EmailMessage[] = messages.slice(-5).map((message) => ({
      from: parseAddress(header(message.payload, 'From')),
      sentAt: sentAt(message),
      body: flat(bodyOf(message.payload) || (typeof message.snippet === 'string' ? message.snippet : ''), BODY_LENGTH),
    }));
    return {
      id: threadId,
      subject: header(first.payload, 'Subject') || '(no subject)',
      from: parseAddress(header(last.payload, 'From')),
      receivedAt: sentAt(last),
      unread: messages.some(isUnread),
      labels: [],
      messages: parsed,
    };
  }
}
