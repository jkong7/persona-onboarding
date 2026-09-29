import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = process.env['PORT']?.trim() || '8787';
const URL_FILE = process.env['PUBLIC_URL_FILE']?.trim() || 'data/public-url.txt';
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const TUNNEL_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 90_000;
const CHECK_EVERY_MS = 10_000;
const FAILURES_BEFORE_RESTART = 2;
const RETRY_AFTER_MS = 15_000;
const TUNNELS = Math.min(3, Math.max(1, Number(process.env['TUNNELS']) || 2));

interface Tunnel {
  slot: number;
  url: string;
  child: ChildProcess;
  failures: number;
}

const live = new Map<number, Tunnel>();
const opening = new Set<number>();
let published = '';
let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openTunnel(): Promise<{ url: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const finish = (work: () => void): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        work();
      }
    };
    const timer = setTimeout(() => {
      finish(() => {
        child.kill();
        reject(new Error('the tunnel did not report an address in time'));
      });
    }, TUNNEL_TIMEOUT_MS);
    const scan = (data: Buffer): void => {
      const match = TUNNEL_URL.exec(data.toString('utf8'));
      if (match !== null) {
        finish(() => resolve({ url: match[0], child }));
      }
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.on('error', (error) => finish(() => reject(error)));
    child.on('exit', (code) => finish(() => reject(new Error(`the tunnel exited with code ${code ?? 'unknown'}`))));
  });
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitUntilReachable(url: string): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline && !stopping) {
    if (await answers(url)) {
      return true;
    }
    await sleep(2000);
  }
  return false;
}

function publish(): void {
  const current = [...live.values()].find((tunnel) => tunnel.url === published && tunnel.failures === 0);
  const healthy = current ?? [...live.values()].find((tunnel) => tunnel.failures === 0);
  const next = healthy?.url ?? '';
  if (next === published) {
    return;
  }
  published = next;
  mkdirSync(dirname(URL_FILE), { recursive: true });
  writeFileSync(URL_FILE, next.length > 0 ? `${next}\n` : '');
  console.log(next.length > 0 ? `tunnel: calls now go through ${next}` : 'tunnel: no public address is answering');
}

async function fill(slot: number): Promise<void> {
  if (opening.has(slot) || stopping) {
    return;
  }
  opening.add(slot);
  try {
    while (!stopping) {
      try {
        const opened = await openTunnel();
        if (await waitUntilReachable(opened.url)) {
          live.set(slot, { slot, url: opened.url, child: opened.child, failures: 0 });
          console.log(`tunnel ${slot}: ready at ${opened.url}`);
          publish();
          return;
        }
        opened.child.kill('SIGTERM');
        console.log(`tunnel ${slot}: that address never answered, opening another`);
      } catch (error) {
        console.log(`tunnel ${slot}: ${error instanceof Error ? error.message : 'could not open'}`);
        await sleep(RETRY_AFTER_MS);
      }
    }
  } finally {
    opening.delete(slot);
  }
}

async function watch(): Promise<void> {
  while (!stopping) {
    await sleep(CHECK_EVERY_MS);
    if (stopping) {
      return;
    }
    await Promise.all(
      [...live.values()].map(async (tunnel) => {
        tunnel.failures = (await answers(tunnel.url)) ? 0 : tunnel.failures + 1;
      }),
    );
    for (const tunnel of [...live.values()]) {
      if (tunnel.failures >= FAILURES_BEFORE_RESTART) {
        console.log(`tunnel ${tunnel.slot}: stopped answering, replacing it`);
        tunnel.child.kill('SIGTERM');
        live.delete(tunnel.slot);
        void fill(tunnel.slot);
      }
    }
    publish();
  }
}

async function main(): Promise<void> {
  mkdirSync(dirname(URL_FILE), { recursive: true });
  writeFileSync(URL_FILE, '');
  console.log('starting the server, then opening tunnels so the voice service can reach it');
  const server = spawn(process.execPath, ['--env-file=.env', 'server/src/http/server.ts'], {
    stdio: 'inherit',
    env: { ...process.env, PORT, PUBLIC_URL: '', PUBLIC_URL_FILE: URL_FILE },
  });

  const stop = (): void => {
    stopping = true;
    server.kill('SIGTERM');
    for (const tunnel of live.values()) {
      tunnel.child.kill('SIGTERM');
    }
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => {
    stop();
    process.exit(code ?? 0);
  });

  for (let slot = 1; slot <= TUNNELS; slot += 1) {
    void fill(slot);
    await sleep(1500);
  }
  void watch();
}

await main();
