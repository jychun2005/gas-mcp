import type { Env, ServerConfig } from './types';

const CONFIG_KEY = 'config';

export async function readConfig(env: Env): Promise<ServerConfig | null> {
  return await env.CONFIG_KV.get<ServerConfig>(CONFIG_KEY, 'json');
}

export async function writeConfig(env: Env, config: ServerConfig): Promise<void> {
  await env.CONFIG_KV.put(CONFIG_KEY, JSON.stringify(config));
}

export async function isConfigured(env: Env): Promise<boolean> {
  return (await readConfig(env)) !== null;
}

export async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const candidate = await hashPassword(password);
  if (candidate.length !== hash.length) return false;
  // 常數時間比對，避免以時間差猜測密碼
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
