import { spawn, type ChildProcess } from 'node:child_process';

const PORT = process.env['PORT']?.trim() || '8787';
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
const TUNNEL_TIMEOUT_MS = 30_000;

function openTunnel(): Promise<{ url: string; child: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error('the tunnel did not report an address in time'));
      }
    }, TUNNEL_TIMEOUT_MS);
    const scan = (data: Buffer): void => {
      const match = TUNNEL_URL.exec(data.toString('utf8'));
      if (match !== null && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ url: match[0], child });
      }
    };
    child.stdout?.on('data', scan);
    child.stderr?.on('data', scan);
    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`the tunnel exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

async function main(): Promise<void> {
  console.log('opening a tunnel so the voice service can reach this machine');
  const tunnel = await openTunnel();
  console.log(`tunnel: ${tunnel.url}`);

  const server = spawn(
    process.execPath,
    ['--env-file=.env', 'server/src/http/server.ts'],
    { stdio: 'inherit', env: { ...process.env, PORT, PUBLIC_URL: tunnel.url } },
  );

  const stop = (): void => {
    server.kill('SIGTERM');
    tunnel.child.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', (code) => {
    tunnel.child.kill('SIGTERM');
    process.exit(code ?? 0);
  });
  tunnel.child.on('exit', () => {
    console.log('the tunnel closed; calls will not connect until it is restarted');
  });
}

await main();
