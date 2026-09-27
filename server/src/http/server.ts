import { existsSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { AnthropicModel, modelOptionsFromEnv, type AnthropicModelOptions } from '../agent/anthropicModel.ts';
import { databasePath } from '../config.ts';
import { openDatabase } from '../store/database.ts';
import { OnboardingService } from '../store/onboardingService.ts';
import { CallTokens } from '../voice/callToken.ts';
import { deepgramConfigFromEnv, DeepgramVoice } from '../voice/deepgram.ts';
import { createApp } from './app.ts';
import type { VoiceAvailability } from './callRoutes.ts';

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

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env['PORT']);
  const text = modelOptionsFromEnv(env);
  const voiceModel = env['AGENT_VOICE_MODEL']?.trim();
  return {
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_PORT,
    databasePath: databasePath(env),
    text,
    voice: { ...text, model: voiceModel !== undefined && voiceModel.length > 0 ? voiceModel : text.model },
  };
}

function main(): void {
  const config = serverConfig();
  const db = openDatabase(config.databasePath);
  const service = new OnboardingService(db);
  const voice = voiceFromEnv();
  const secret = process.env['CALL_TOKEN_SECRET']?.trim();
  const app = createApp({
    service,
    models: { text: new AnthropicModel(config.text), voice: new AnthropicModel(config.voice) },
    voice,
    tokens: new CallTokens(secret),
  });
  if (existsSync(CLIENT_DIST)) {
    app.use('/*', serveStatic({ root: CLIENT_DIST }));
  }

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(
      `persona-onboarding listening on http://localhost:${info.port} (text ${config.text.model}, voice ${config.voice.model}, effort ${config.text.effort ?? 'default'})`,
    );
    console.log(voice.ok ? 'calls: ready' : `calls: unavailable (${voice.reason})`);
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
