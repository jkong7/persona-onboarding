import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  createOnboarding,
  eventsUrl,
  fetchSnapshot,
  openThread,
  requestSampleInbox,
  sendMessage,
} from '../api/client.ts';
import type { Reply, Snapshot } from '../api/types.ts';
import { appendActivity, isActivityFeed, type ActivityItem } from '../lib/activity.ts';
import {
  activityKey,
  clearActivity,
  clearOnboardingId,
  loadJson,
  loadOnboardingId,
  saveJson,
  saveOnboardingId,
} from '../lib/storage.ts';

export type LoadStatus = 'loading' | 'ready' | 'unreachable';
export type Connection = 'online' | 'reconnecting';
export type PendingStatus = 'sending' | 'failed';

export interface PendingItem {
  localId: string;
  text: string;
  baseSeq: number;
  status: PendingStatus;
  streamed: string;
  viaCall: boolean;
}

export interface Notice {
  id: number;
  text: string;
}

export interface OnboardingState {
  status: LoadStatus;
  connection: Connection;
  snapshot: Snapshot | null;
  pending: PendingItem[];
  opening: boolean;
  activity: ActivityItem[];
  notices: Notice[];
}

export type CallSender = (text: string) => Promise<boolean>;

export interface OnboardingControls extends OnboardingState {
  onboardingId: string | null;
  send: (text: string, viaCall: CallSender | null) => void;
  retry: (localId: string, viaCall: CallSender | null) => void;
  dismiss: (localId: string) => void;
  applySnapshot: (snapshot: Snapshot) => void;
  refresh: () => void;
  notify: (text: string) => void;
  dismissNotice: (id: number) => void;
  chooseSampleInbox: () => Promise<Reply | null>;
  startOver: () => Promise<void>;
  reload: () => void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];
const RECONNECT_BANNER_DELAY_MS = 1200;

function isNewer(current: Snapshot | null, next: Snapshot): boolean {
  if (current === null || current.id !== next.id) {
    return true;
  }
  if (next.lastSeq !== current.lastSeq) {
    return next.lastSeq > current.lastSeq;
  }
  return next.version >= current.version;
}

function isSnapshot(value: unknown): value is Snapshot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Snapshot).id === 'string' &&
    Array.isArray((value as Snapshot).transcript) &&
    typeof (value as Snapshot).interface === 'object'
  );
}

export function useOnboarding(): OnboardingControls {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [connection, setConnection] = useState<Connection>('online');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [opening, setOpening] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [generation, setGeneration] = useState(0);

  const snapshotRef = useRef<Snapshot | null>(null);
  const activityRef = useRef<ActivityItem[]>([]);
  const idRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingItem[]>([]);
  const bootRef = useRef<{ generation: number; promise: Promise<Snapshot> } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const applySnapshot = useCallback((next: Snapshot) => {
    if (idRef.current !== null && next.id !== idRef.current) {
      return;
    }
    const current = snapshotRef.current;
    if (!isNewer(current, next)) {
      return;
    }
    const feed = appendActivity(activityRef.current, current, next, new Date().toISOString());
    if (feed !== activityRef.current) {
      activityRef.current = feed;
      setActivity(feed);
      saveJson(activityKey(next.id), feed);
    }
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const notify = useCallback((text: string) => {
    counter.current += 1;
    const notice: Notice = { id: counter.current, text };
    setNotices((current) => [...current.filter((item) => item.text !== text), notice].slice(-3));
  }, []);

  const dismissNotice = useCallback((id: number) => {
    setNotices((current) => current.filter((item) => item.id !== id));
  }, []);

  const refresh = useCallback(() => {
    const id = idRef.current;
    if (id === null) {
      return;
    }
    fetchSnapshot(id)
      .then(applySnapshot)
      .catch(() => undefined);
  }, [applySnapshot]);

  useEffect(() => {
    let cancelled = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const adopt = (next: Snapshot): void => {
      idRef.current = next.id;
      saveOnboardingId(next.id);
      snapshotRef.current = null;
      const stored = loadJson(activityKey(next.id), isActivityFeed) ?? [];
      activityRef.current = stored;
      setActivity(stored);
      setPending([]);
      applySnapshot(next);
    };

    const loadOrCreate = async (): Promise<Snapshot> => {
      const stored = loadOnboardingId();
      if (stored !== null) {
        try {
          return await fetchSnapshot(stored);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) {
            throw error;
          }
          clearActivity(stored);
          clearOnboardingId();
        }
      }
      return createOnboarding();
    };

    const markOnline = (): void => {
      attempts = 0;
      if (bannerTimer !== null) {
        clearTimeout(bannerTimer);
        bannerTimer = null;
      }
      setConnection('online');
    };

    const markOffline = (): void => {
      if (bannerTimer === null) {
        bannerTimer = setTimeout(() => {
          bannerTimer = null;
          if (!cancelled) {
            setConnection('reconnecting');
          }
        }, RECONNECT_BANNER_DELAY_MS);
      }
    };

    const scheduleReconnect = (): void => {
      if (cancelled || retryTimer !== null) {
        return;
      }
      const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 15000;
      attempts += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void reconnect();
      }, delay);
    };

    const subscribe = (id: string): void => {
      source?.close();
      const stream = new EventSource(eventsUrl(id));
      source = stream;
      stream.addEventListener('open', () => {
        if (!cancelled && source === stream) {
          markOnline();
        }
      });
      stream.addEventListener('snapshot', (event) => {
        if (cancelled || source !== stream) {
          return;
        }
        try {
          const parsed: unknown = JSON.parse((event as MessageEvent<string>).data);
          if (isSnapshot(parsed)) {
            markOnline();
            applySnapshot(parsed);
          }
        } catch {
          return;
        }
      });
      stream.addEventListener('error', () => {
        if (cancelled || source !== stream) {
          return;
        }
        stream.close();
        source = null;
        markOffline();
        scheduleReconnect();
      });
    };

    const reconnect = async (): Promise<void> => {
      const id = idRef.current;
      if (cancelled || id === null) {
        return;
      }
      try {
        const fresh = await fetchSnapshot(id);
        if (cancelled) {
          return;
        }
        applySnapshot(fresh);
        subscribe(id);
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          clearActivity(id);
          clearOnboardingId();
          idRef.current = null;
          setGeneration((value) => value + 1);
          return;
        }
        markOffline();
        scheduleReconnect();
      }
    };

    const greet = async (id: string): Promise<void> => {
      setOpening(true);
      try {
        const opened = await openThread(id);
        if (!cancelled && idRef.current === id) {
          applySnapshot(opened.snapshot);
        }
      } catch {
        if (!cancelled) {
          refresh();
        }
      } finally {
        if (!cancelled) {
          setOpening(false);
        }
      }
    };

    const loadOnce = (): Promise<Snapshot> => {
      const existing = bootRef.current;
      if (existing !== null && existing.generation === generation) {
        return existing.promise;
      }
      const promise = loadOrCreate();
      bootRef.current = { generation, promise };
      promise.catch(() => {
        if (bootRef.current?.promise === promise) {
          bootRef.current = null;
        }
      });
      return promise;
    };

    const boot = async (): Promise<void> => {
      setStatus('loading');
      try {
        const first = await loadOnce();
        if (cancelled) {
          return;
        }
        adopt(first);
        setStatus('ready');
        markOnline();
        void greet(first.id);
        subscribe(first.id);
      } catch {
        if (cancelled) {
          return;
        }
        setStatus('unreachable');
        const delay = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 15000;
        attempts += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          void boot();
        }, delay);
      }
    };

    const onVisible = (): void => {
      if (document.visibilityState !== 'visible' || cancelled || idRef.current === null) {
        return;
      }
      refresh();
      if (source === null && retryTimer === null) {
        void reconnect();
      }
    };

    const onOnline = (): void => {
      if (cancelled || idRef.current === null) {
        return;
      }
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      void reconnect();
    };

    void boot();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      source?.close();
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
      if (bannerTimer !== null) {
        clearTimeout(bannerTimer);
      }
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [applySnapshot, generation, refresh]);

  const updatePending = useCallback((localId: string, change: (item: PendingItem) => PendingItem | null) => {
    setPending((current) =>
      current.flatMap((item) => {
        if (item.localId !== localId) {
          return [item];
        }
        const next = change(item);
        return next === null ? [] : [next];
      }),
    );
  }, []);

  const deliver = useCallback(
    (item: PendingItem, viaCall: CallSender | null) => {
      const id = idRef.current;
      if (id === null) {
        updatePending(item.localId, (current) => ({ ...current, status: 'failed' }));
        return;
      }
      if (item.viaCall && viaCall !== null) {
        viaCall(item.text)
          .then((sent) => {
            if (idRef.current !== id) {
              return;
            }
            if (sent) {
              refresh();
              setTimeout(() => updatePending(item.localId, () => null), 1500);
            } else {
              updatePending(item.localId, (current) => ({ ...current, status: 'failed' }));
            }
          })
          .catch(() => updatePending(item.localId, (current) => ({ ...current, status: 'failed' })));
        return;
      }
      sendMessage(id, item.text, {
        onDelta: (text) =>
          updatePending(item.localId, (current) => ({ ...current, streamed: current.streamed + text })),
        onSignal: () => undefined,
        onDone: (done) => {
          if (idRef.current !== id) {
            return;
          }
          if (done.snapshot !== null) {
            applySnapshot(done.snapshot);
          } else {
            refresh();
          }
          updatePending(item.localId, () => null);
        },
      }).catch(() => {
        if (idRef.current !== id) {
          return;
        }
        refresh();
        updatePending(item.localId, (current) => ({ ...current, status: 'failed', streamed: '' }));
      });
    },
    [applySnapshot, refresh, updatePending],
  );

  const send = useCallback(
    (text: string, viaCall: CallSender | null) => {
      const trimmed = text.trim().slice(0, 4000);
      if (trimmed.length === 0 || idRef.current === null) {
        return;
      }
      counter.current += 1;
      const item: PendingItem = {
        localId: `local-${Date.now()}-${counter.current}`,
        text: trimmed,
        baseSeq: snapshotRef.current?.lastSeq ?? 0,
        status: 'sending',
        streamed: '',
        viaCall: viaCall !== null,
      };
      setPending((current) => [...current, item]);
      deliver(item, viaCall);
    },
    [deliver],
  );

  const retry = useCallback(
    (localId: string, viaCall: CallSender | null) => {
      const found = pendingRef.current.find((item) => item.localId === localId);
      if (found === undefined || found.status !== 'failed') {
        return;
      }
      const next: PendingItem = {
        ...found,
        status: 'sending',
        streamed: '',
        baseSeq: snapshotRef.current?.lastSeq ?? found.baseSeq,
        viaCall: viaCall !== null,
      };
      pendingRef.current = pendingRef.current.map((item) => (item.localId === localId ? next : item));
      setPending((current) => current.map((item) => (item.localId === localId ? next : item)));
      deliver(next, viaCall);
    },
    [deliver],
  );

  const dismiss = useCallback(
    (localId: string) => {
      updatePending(localId, () => null);
    },
    [updatePending],
  );

  const chooseSampleInbox = useCallback(async (): Promise<Reply | null> => {
    const id = idRef.current;
    if (id === null) {
      return null;
    }
    try {
      const response = await requestSampleInbox(id);
      applySnapshot(response.snapshot);
      return response.reply;
    } catch {
      notify('The sample inbox could not be switched on. Try again in a moment.');
      refresh();
      return null;
    }
  }, [applySnapshot, notify, refresh]);

  const startOver = useCallback(async () => {
    const previous = idRef.current;
    try {
      const fresh = await createOnboarding();
      if (previous !== null) {
        clearActivity(previous);
      }
      saveOnboardingId(fresh.id);
      idRef.current = null;
      snapshotRef.current = null;
      activityRef.current = [];
      setSnapshot(null);
      setActivity([]);
      setPending([]);
      setNotices([]);
      setGeneration((value) => value + 1);
    } catch {
      notify('A fresh thread could not be started. Try again in a moment.');
    }
  }, [notify]);

  const reload = useCallback(() => {
    setGeneration((value) => value + 1);
  }, []);

  return {
    status,
    connection,
    snapshot,
    pending,
    opening,
    activity,
    notices,
    onboardingId: snapshot?.id ?? null,
    send,
    retry,
    dismiss,
    applySnapshot,
    refresh,
    notify,
    dismissNotice,
    chooseSampleInbox,
    startOver,
    reload,
  };
}
