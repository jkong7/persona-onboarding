import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import {
  AnthropicModel,
  modelOptionsFromEnv,
  type AnthropicModelOptions,
  type Thinking,
} from '../agent/anthropicModel.ts';
import { databasePath } from '../config.ts';
import { openDatabase } from '../store/database.ts';
import { OnboardingService } from '../store/onboardingService.ts';
import { googleConfigFromEnv } from '../gmail/config.ts';
import { GoogleAccounts } from '../gmail/google.ts';
import { TokenVault } from '../gmail/tokenVault.ts';
import { CallTokens } from '../voice/callToken.ts';
import { deepgramConfigFromEnv, DeepgramVoice } from '../voice/deepgram.ts';
import { createApp } from './app.ts';
import type { VoiceAvailability } from './callRoutes.ts';
import { firstText } from './firstText.ts';

export const CLIENT_DIST = './client/dist';

export function voiceFromEnv(env: NodeJS.ProcessEnv = process.env): VoiceAvailability {
  const result = deepgramConfigFromEnv(env);
  return result.ok ? { ok: true, provider: new DeepgramVoice(result.config) } : { ok: false, reason: result.reason };
}

export const DEFAULT_PORT = 8787;

export interface ServerConfig {
  port: number;
  databasePath: string;
  text: AnthropicModelOptions;
  voice: AnthropicModelOptions;
}

export function voiceThinking(env: NodeJS.ProcessEnv = process.env): Thinking {
  const wanted = env['AGENT_VOICE_THINKING']?.trim();
  return wanted === 'adaptive' || wanted === 'disabled' ? wanted : 'unset';
}

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env['PORT']);
  const text = modelOptionsFromEnv(env);
  const voiceModel = env['AGENT_VOICE_MODEL']?.trim();
  return {
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT,
    databasePath: databasePath(env),
    text,
    voice: {
      ...text,
      model: voiceModel !== undefined && voiceModel.length > 0 ? voiceModel : text.model,
      thinking: voiceThinking(env),
      fallbackModel: env['AGENT_VOICE_FALLBACK_MODEL']?.trim() || null,
    },
  };
}

function main(): void {
  const config = serverConfig();
  const db = openDatabase(config.databasePath);
  const service = new OnboardingService(db);
  const voice = voiceFromEnv();
  const googleSetup = googleConfigFromEnv();
  const secret = process.env['CALL_TOKEN_SECRET']?.trim();
  const app = createApp({
    service,
    models: { text: new AnthropicModel(config.text), voice: new AnthropicModel(config.voice) },
    voice,
    tokens: new CallTokens(secret),
    firstText,
    google: googleSetup.ok
      ? new GoogleAccounts(googleSetup.config, new TokenVault(db, googleSetup.config.encryptionKey))
      : null,
  });
  if (existsSync(CLIENT_DIST)) {
    app.use(
      '/*',
      serveStatic({
        root: CLIENT_DIST,
        onFound: (path, c) => {
          c.header('Cache-Control', path.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
        },
      }),
    );
  }

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `persona-onboarding listening on http://localhost:${info.port} (text ${config.text.model}, voice ${config.voice.model}, effort ${config.text.effort ?? 'default'})`,
    );
    console.log(voice.ok ? 'calls: ready' : `calls: unavailable (${voice.reason})`);
    console.log(googleSetup.ok ? 'gmail: ready' : `gmail: sample inbox only (${googleSetup.reason})`);
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) {
      return;
    }
    stopping = true;
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (import.meta.main) {
  main();
}
