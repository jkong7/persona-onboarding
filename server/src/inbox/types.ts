export interface EmailAddress {
  name: string;
  email: string;
}

export interface EmailMessage {
  from: EmailAddress;
  sentAt: string;
  body: string;
}

export interface EmailThread {
  id: string;
  subject: string;
  from: EmailAddress;
  receivedAt: string;
  unread: boolean;
  labels: string[];
  messages: EmailMessage[];
}

export interface ThreadSummary {
  threadId: string;
  from: string;
  subject: string;
  received: string;
  receivedAt: string;
  unread: boolean;
  snippet: string;
}

export interface SearchOptions {
  query: string | null;
  unreadOnly: boolean;
  limit: number;
}

export type InboxKind = 'sample' | 'real';

export interface InboxProvider {
  kind: InboxKind;
  search(options: SearchOptions): Promise<ThreadSummary[]>;
  read(threadId: string): Promise<EmailThread | null>;
}
