import type { ClientCallEndReason } from '../api/types.ts';

export type EndTransport = 'fetch' | 'beacon';

export interface EndReport {
  callId: string;
  reason: ClientCallEndReason;
  transport: EndTransport;
}

export type EndSender = (report: EndReport) => void;

export class CallEndReporter {
  readonly callId: string;
  readonly #send: EndSender;
  #report: EndReport | null = null;

  constructor(callId: string, send: EndSender) {
    this.callId = callId;
    this.#send = send;
  }

  get reported(): EndReport | null {
    return this.#report;
  }

  get done(): boolean {
    return this.#report !== null;
  }

  report(reason: ClientCallEndReason, transport: EndTransport = 'fetch'): boolean {
    if (this.#report !== null) {
      return false;
    }
    const report: EndReport = { callId: this.callId, reason, transport };
    this.#report = report;
    try {
      this.#send(report);
    } catch {
      return true;
    }
    return true;
  }
}
