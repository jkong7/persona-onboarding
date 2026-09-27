const BASE = process.argv[2] ?? 'http://localhost:8787';
const AGENT_URL = 'wss://agent.deepgram.com/v1/agent/converse';
const SAY = process.argv[3] ?? "hi, I'm Jonathan and I keep missing recruiter emails";

interface StartResponse {
  callId: string;
  token: string;
  greeting: string;
  settings: Record<string, unknown>;
}

async function postJson<T>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

function describe(message: Record<string, unknown>): string {
  const type = String(message['type']);
  if (type === 'ConversationText') {
    return `${type} ${String(message['role'])}: ${String(message['content'])}`;
  }
  if (type === 'Error' || type === 'Warning') {
    return `${type}: ${JSON.stringify(message)}`;
  }
  return type;
}

async function main(): Promise<void> {
  const created = await postJson<{ id: string }>('/api/onboardings');
  const id = created.body.id;
  const started = await postJson<StartResponse | { error: string; reason: string }>(
    `/api/onboardings/${id}/call/start`,
  );
  if (started.status !== 200 || !('callId' in started.body)) {
    console.log(`call start failed: ${started.status} ${JSON.stringify(started.body)}`);
    return;
  }
  const call = started.body;
  console.log(`call ${call.callId} started, greeting: ${call.greeting}`);

  const socket = new WebSocket(AGENT_URL, ['bearer', call.token]);
  socket.binaryType = 'arraybuffer';
  let audioBytes = 0;
  let firstAudioAt: number | null = null;
  let saidAt: number | null = null;
  let injected = false;
  const startedAt = performance.now();

  const finish = async (why: string): Promise<void> => {
    console.log(`closing: ${why}; audio received ${audioBytes} bytes`);
    socket.close();
    const ended = await postJson<{ ended: boolean; reply: { text: string } | null }>(
      `/api/onboardings/${id}/call/end`,
      { callId: call.callId, reason: 'user_hangup' },
    );
    console.log(`hangup recorded: ${ended.body.ended}; follow-up text: ${ended.body.reply?.text ?? 'none'}`);
    const snapshot = await fetch(`${BASE}/api/onboardings/${id}`).then((r) => r.json() as Promise<{ state: { text: string } }>);
    console.log(`state after hangup:\n${snapshot.state.text}`);
    process.exit(0);
  };

  const timeout = setTimeout(() => void finish('timed out after 40s'), 40_000);

  socket.addEventListener('open', () => console.log(`socket open after ${Math.round(performance.now() - startedAt)}ms`));
  socket.addEventListener('close', (event) => console.log(`socket closed: ${event.code} ${event.reason}`));
  socket.addEventListener('error', () => console.log('socket error'));
  socket.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') {
      audioBytes += (event.data as ArrayBuffer).byteLength;
      if (saidAt !== null && firstAudioAt === null) {
        firstAudioAt = performance.now();
        console.log(`first reply audio ${Math.round(firstAudioAt - saidAt)}ms after the message was sent`);
      }
      return;
    }
    const message = JSON.parse(event.data) as Record<string, unknown>;
    console.log(`< ${describe(message)}`);
    const type = message['type'];
    if (type === 'Welcome') {
      socket.send(JSON.stringify(call.settings));
    }
    if (type === 'AgentAudioDone' && !injected) {
      injected = true;
      audioBytes = 0;
      saidAt = performance.now();
      socket.send(JSON.stringify({ type: 'InjectUserMessage', content: SAY }));
      console.log(`> InjectUserMessage: ${SAY}`);
      return;
    }
    if (type === 'AgentAudioDone' && injected) {
      clearTimeout(timeout);
      void finish('reply finished');
    }
    if (type === 'Error') {
      clearTimeout(timeout);
      void finish('provider error');
    }
  });
}

await main();
