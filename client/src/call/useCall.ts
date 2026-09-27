import { AgentMicrophone, AgentPlayer } from '@deepgram/agents';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  declineCall,
  endCall,
  endCallByBeacon,
  reportHeard,
  reportSilence,
  reportTyped,
  startCall,
} from '../api/client.ts';
import type { Snapshot } from '../api/types.ts';
import { CallEndReporter, type EndReport } from './endReporter.ts';
import { UtteranceTracker } from './playback.ts';
import { audioRates, VoiceSocket, type ServerMessage } from './voiceSocket.ts';

export type CallPhase = 'idle' | 'requesting_mic' | 'connecting' | 'live' | 'wrapping_up';
export type Speaker = 'agent' | 'user' | 'thinking' | 'listening';

export interface Caption {
  id: number;
  role: 'agent' | 'user';
  text: string;
}

export interface CallView {
  phase: CallPhase;
  callId: string | null;
  startedAt: number | null;
  muted: boolean;
  speaker: Speaker;
  captions: Caption[];
}

export interface UseCallOptions {
  onboardingId: string | null;
  snapshot: Snapshot | null;
  applySnapshot: (snapshot: Snapshot) => void;
  refresh: () => void;
  notify: (text: string) => void;
}

export interface CallControls {
  view: CallView;
  active: boolean;
  live: boolean;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => void;
  toggleMute: () => void;
  sendTyped: (text: string) => Promise<boolean>;
  speak: (text: string) => void;
}

interface Session {
  onboardingId: string;
  callId: string;
  socket: VoiceSocket;
  mic: AgentMicrophone | null;
  player: AgentPlayer;
  tracker: UtteranceTracker;
  reporter: CallEndReporter;
  seenActive: boolean;
  wasLive: boolean;
  lastSoundAt: number;
  silencePending: boolean;
  dropAudioUntil: number;
  thinking: boolean;
  speech: string[];
  speechAttempts: number;
  speechTimer: ReturnType<typeof setTimeout> | null;
  wrapTimer: ReturnType<typeof setInterval> | null;
  meter: ReturnType<typeof setInterval> | null;
  closed: boolean;
}

const IDLE: CallView = {
  phase: 'idle',
  callId: null,
  startedAt: null,
  muted: false,
  speaker: 'listening',
  captions: [],
};

const CAPTION_LIMIT = 4;
const DROP_AFTER_BARGE_IN_MS = 300;
const SPEECH_RETRY_MS = 1200;
const SPEECH_MAX_ATTEMPTS = 5;
const READY_WAIT_MS = 6000;
const WRAP_GRACE_MS = 3500;
const WRAP_LIMIT_MS = 20000;
const END_RETRY_DELAYS_MS = [800, 2500, 6000];
const SILENCE_AFTER_MS = 10_000;

const MIC_UNAVAILABLE = 'The microphone is unavailable, so the call was skipped. Typing works just as well.';
const CALLS_UNAVAILABLE = 'Calls are not available right now. Typing works just as well.';
const CALL_DROPPED = 'The call dropped. Everything said so far is saved.';
const CALL_FAILED = 'The call could not connect. Everything so far is saved, and typing works.';

async function probeMicrophone(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
      return false;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false },
    });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  } catch {
    return false;
  }
}

export function useCall(options: UseCallOptions): CallControls {
  const [view, setView] = useState<CallView>(IDLE);
  const sessionRef = useRef<Session | null>(null);
  const captionId = useRef(0);
  const busy = useRef(false);
  const latest = useRef(options);
  latest.current = options;

  const patch = useCallback((changes: Partial<CallView>) => {
    setView((current) => ({ ...current, ...changes }));
  }, []);

  const addCaption = useCallback((role: Caption['role'], text: string) => {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    captionId.current += 1;
    const caption: Caption = { id: captionId.current, role, text: trimmed };
    setView((current) => ({ ...current, captions: [...current.captions, caption].slice(-CAPTION_LIMIT) }));
  }, []);

  const sendEnd = useCallback((onboardingId: string, report: EndReport) => {
    if (report.transport === 'beacon') {
      endCallByBeacon(onboardingId, report.callId, report.reason);
      return;
    }
    const attempt = (index: number): void => {
      endCall(onboardingId, report.callId, report.reason)
        .then((response) => {
          if (response.snapshot !== null) {
            latest.current.applySnapshot(response.snapshot);
          } else {
            latest.current.refresh();
          }
        })
        .catch((error: unknown) => {
          const delay = END_RETRY_DELAYS_MS[index];
          const retryable = !(error instanceof ApiError) || error.status >= 500;
          if (delay !== undefined && retryable) {
            setTimeout(() => attempt(index + 1), delay);
          } else {
            latest.current.refresh();
          }
        });
    };
    attempt(0);
  }, []);

  const teardown = useCallback((session: Session) => {
    if (session.closed) {
      return;
    }
    session.closed = true;
    if (session.speechTimer !== null) {
      clearTimeout(session.speechTimer);
    }
    if (session.wrapTimer !== null) {
      clearInterval(session.wrapTimer);
    }
    if (session.meter !== null) {
      clearInterval(session.meter);
    }
    try {
      session.mic?.stop();
    } catch {
      session.mic = null;
    }
    session.socket.close();
    try {
      session.player.dispose();
    } catch {
      session.speech = [];
    }
    if (sessionRef.current === session) {
      sessionRef.current = null;
    }
    setView(IDLE);
  }, []);

  const flushSpeech = useCallback((session: Session) => {
    if (session.closed || session.speech.length === 0) {
      return;
    }
    const next = session.speech[0];
    if (next === undefined) {
      return;
    }
    session.speechAttempts += 1;
    const sent = session.socket.injectAgentMessage(next, 'queue');
    if (sent) {
      session.speech.shift();
      session.speechAttempts = 0;
      if (session.speech.length > 0) {
        session.speechTimer = setTimeout(() => flushSpeech(session), SPEECH_RETRY_MS);
      }
      return;
    }
    if (session.speechAttempts < SPEECH_MAX_ATTEMPTS) {
      session.speechTimer = setTimeout(() => flushSpeech(session), SPEECH_RETRY_MS);
    } else {
      session.speech = [];
      session.speechAttempts = 0;
    }
  }, []);

  const handleMessage = useCallback(
    (session: Session, message: ServerMessage) => {
      switch (message.type) {
        case 'ConversationText': {
          if (typeof message.content === 'string') {
            addCaption(message.role === 'user' ? 'user' : 'agent', message.content);
          }
          return;
        }
        case 'UserStartedSpeaking': {
          const remaining = session.player.getRemainingPlaybackTime();
          const cut = session.tracker.interrupt(remaining);
          session.player.interrupt();
          session.dropAudioUntil = Date.now() + DROP_AFTER_BARGE_IN_MS;
          session.thinking = false;
          if (cut !== null) {
            void reportHeard(session.onboardingId, session.callId, cut.playedFraction).catch(() => undefined);
          }
          return;
        }
        case 'AgentThinking': {
          session.thinking = true;
          session.dropAudioUntil = 0;
          return;
        }
        case 'AgentStartedSpeaking': {
          session.thinking = false;
          session.dropAudioUntil = 0;
          if (session.tracker.audioDone || session.tracker.receivedSeconds === 0) {
            session.tracker.begin();
          }
          return;
        }
        case 'AgentAudioDone': {
          session.tracker.markAudioDone();
          return;
        }
        case 'InjectionRefused': {
          if (session.speech.length > 0 && session.speechTimer === null) {
            session.speechTimer = setTimeout(() => {
              session.speechTimer = null;
              flushSpeech(session);
            }, SPEECH_RETRY_MS);
          }
          return;
        }
        default:
          return;
      }
    },
    [addCaption, flushSpeech],
  );

  const startMeter = useCallback(
    (session: Session) => {
      session.meter = setInterval(() => {
        if (session.closed) {
          return;
        }
        const remaining = session.player.getRemainingPlaybackTime();
        let speaker: Speaker = 'listening';
        if (session.tracker.isPlaying(remaining) && remaining > 0) {
          speaker = 'agent';
        } else if (session.mic !== null && !session.mic.muted && session.mic.getInputVolume() > 0.08) {
          speaker = 'user';
        } else if (session.thinking) {
          speaker = 'thinking';
        }
        setView((current) => (current.speaker === speaker ? current : { ...current, speaker }));
        if (speaker !== 'listening' || session.speech.length > 0) {
          session.lastSoundAt = Date.now();
          return;
        }
        if (session.silencePending || Date.now() - session.lastSoundAt < SILENCE_AFTER_MS) {
          return;
        }
        session.silencePending = true;
        reportSilence(session.onboardingId, session.callId)
          .then((response) => {
            if (response.snapshot !== null) {
              latest.current.applySnapshot(response.snapshot);
            }
            if (!session.closed && response.reply !== null && response.reply.spoken === true) {
              session.speech.push(response.reply.text);
              flushSpeech(session);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            session.lastSoundAt = Date.now();
            session.silencePending = false;
          });
      }, 140);
    },
    [flushSpeech],
  );

  const declineQuietly = useCallback(async (onboardingId: string) => {
    try {
      const response = await declineCall(onboardingId);
      latest.current.applySnapshot(response.snapshot);
    } catch {
      latest.current.refresh();
    }
  }, []);

  const accept = useCallback(async () => {
    const onboardingId = latest.current.onboardingId;
    if (busy.current || sessionRef.current !== null || onboardingId === null) {
      return;
    }
    busy.current = true;
    try {
      patch({ phase: 'requesting_mic', captions: [] });
      const allowed = await probeMicrophone();
      if (!allowed) {
        setView(IDLE);
        latest.current.notify(MIC_UNAVAILABLE);
        await declineQuietly(onboardingId);
        return;
      }

      patch({ phase: 'connecting' });
      let started;
      try {
        started = await startCall(onboardingId);
      } catch (error) {
        setView(IDLE);
        latest.current.notify(error instanceof ApiError && error.status === 409 ? CALLS_UNAVAILABLE : CALL_FAILED);
        await declineQuietly(onboardingId);
        return;
      }

      const rates = audioRates(started.settings);
      const callId = started.callId;
      const reporter = new CallEndReporter(callId, (report) => sendEnd(onboardingId, report));
      const player = new AgentPlayer({ sampleRate: rates.output });
      const tracker = new UtteranceTracker(rates.output);

      const session: Session = {
        onboardingId,
        callId,
        socket: null as unknown as VoiceSocket,
        mic: null,
        player,
        tracker,
        reporter,
        seenActive: false,
        wasLive: false,
        lastSoundAt: Date.now(),
        silencePending: false,
        dropAudioUntil: 0,
        thinking: false,
        speech: [],
        speechAttempts: 0,
        speechTimer: null,
        wrapTimer: null,
        meter: null,
        closed: false,
      };

      session.socket = new VoiceSocket({
        token: started.token,
        settings: started.settings,
        handlers: {
          onReady: () => {
            if (session.closed) {
              return;
            }
            session.wasLive = true;
            session.lastSoundAt = Date.now();
            patch({ phase: 'live', startedAt: Date.now(), callId });
            startMeter(session);
            flushSpeech(session);
          },
          onAudio: (chunk) => {
            if (session.closed || !rates.playable || Date.now() < session.dropAudioUntil) {
              return;
            }
            session.tracker.addChunk(chunk.byteLength, session.player.getRemainingPlaybackTime());
            session.player.queue(chunk);
          },
          onMessage: (message) => handleMessage(session, message),
          onClose: (cause) => {
            if (session.closed || cause === 'client') {
              return;
            }
            if (session.reporter.report('network_drop')) {
              latest.current.notify(session.wasLive ? CALL_DROPPED : CALL_FAILED);
            }
            teardown(session);
          },
        },
      });

      const mic = new AgentMicrophone((frame) => session.socket.sendAudio(frame), {
        sampleRate: rates.input,
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      });
      mic.on('error', () => {
        if (session.closed) {
          return;
        }
        if (session.reporter.report('network_drop')) {
          latest.current.notify(CALL_DROPPED);
        }
        teardown(session);
      });
      session.mic = mic;
      sessionRef.current = session;
      patch({ callId, muted: false });

      try {
        await mic.start();
      } catch {
        session.reporter.report('network_drop');
        latest.current.notify(MIC_UNAVAILABLE);
        teardown(session);
        return;
      }
      if (session.closed) {
        return;
      }
      if (started.greeting.trim().length > 0) {
        addCaption('agent', started.greeting);
      }
      session.socket.connect();
    } finally {
      busy.current = false;
    }
  }, [addCaption, declineQuietly, flushSpeech, handleMessage, patch, sendEnd, startMeter, teardown]);

  const decline = useCallback(async () => {
    const onboardingId = latest.current.onboardingId;
    if (onboardingId === null || busy.current) {
      return;
    }
    busy.current = true;
    try {
      await declineQuietly(onboardingId);
    } finally {
      busy.current = false;
    }
  }, [declineQuietly]);

  const hangUp = useCallback(() => {
    const session = sessionRef.current;
    if (session === null) {
      return;
    }
    session.reporter.report('user_hangup');
    teardown(session);
  }, [teardown]);

  const toggleMute = useCallback(() => {
    const session = sessionRef.current;
    if (session === null || session.mic === null) {
      return;
    }
    if (session.mic.muted) {
      session.mic.unmute();
    } else {
      session.mic.mute();
    }
    patch({ muted: session.mic.muted });
  }, [patch]);

  const sendTyped = useCallback(
    async (text: string): Promise<boolean> => {
      const session = sessionRef.current;
      if (session === null || session.closed) {
        return false;
      }
      const deadline = Date.now() + READY_WAIT_MS;
      while (!session.socket.ready && !session.closed && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      if (session.closed || !session.socket.ready) {
        return false;
      }
      try {
        await reportTyped(session.onboardingId, session.callId, text);
      } catch {
        return false;
      }
      if (session.closed) {
        return true;
      }
      const remaining = session.player.getRemainingPlaybackTime();
      const cut = session.tracker.interrupt(remaining);
      if (cut !== null) {
        session.player.interrupt();
        void reportHeard(session.onboardingId, session.callId, cut.playedFraction).catch(() => undefined);
      }
      const sent = session.socket.injectUserMessage(text);
      if (sent) {
        addCaption('user', text);
      }
      return sent;
    },
    [addCaption],
  );

  const speak = useCallback(
    (text: string) => {
      const session = sessionRef.current;
      const trimmed = text.trim();
      if (session === null || session.closed || trimmed.length === 0) {
        return;
      }
      session.speech.push(trimmed);
      if (session.socket.ready && session.speechTimer === null) {
        flushSpeech(session);
      }
    },
    [flushSpeech],
  );

  const activeCallId = options.snapshot?.interface.activeCallId ?? null;

  useEffect(() => {
    const session = sessionRef.current;
    if (session === null || session.closed || view.phase === 'idle') {
      return;
    }
    if (activeCallId === session.callId) {
      session.seenActive = true;
      return;
    }
    if (!session.seenActive || session.reporter.done || session.wrapTimer !== null) {
      return;
    }
    if (activeCallId !== null) {
      session.reporter.report('network_drop');
      teardown(session);
      return;
    }
    const started = Date.now();
    try {
      session.mic?.stop();
    } catch {
      session.mic = null;
    }
    session.mic = null;
    patch({ phase: 'wrapping_up', muted: true });
    session.wrapTimer = setInterval(() => {
      if (session.closed) {
        return;
      }
      const waited = Date.now() - started;
      const playing = session.tracker.isPlaying(session.player.getRemainingPlaybackTime());
      if ((playing || waited < WRAP_GRACE_MS) && waited < WRAP_LIMIT_MS) {
        return;
      }
      session.reporter.report('agent_ended');
      teardown(session);
    }, 200);
  }, [activeCallId, patch, teardown, view.phase]);

  useEffect(() => {
    const onPageHide = (): void => {
      const session = sessionRef.current;
      if (session === null || session.closed) {
        return;
      }
      session.reporter.report('tab_closed', 'beacon');
      teardown(session);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [teardown]);

  useEffect(() => {
    const session = sessionRef.current;
    if (session !== null && session.onboardingId !== options.onboardingId) {
      session.reporter.report('user_hangup');
      teardown(session);
    }
  }, [options.onboardingId, teardown]);

  return {
    view,
    active: view.phase !== 'idle',
    live: view.phase === 'live',
    accept,
    decline,
    hangUp,
    toggleMute,
    sendTyped,
    speak,
  };
}
