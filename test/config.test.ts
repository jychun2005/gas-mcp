import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { readConfig, writeConfig, isConfigured, hashPassword, verifyPassword } from '../src/config';
import type { Env } from '../src/types';

const testEnv = env as unknown as Env;

describe('config', () => {
  beforeEach(async () => {
    await testEnv.CONFIG_KV.delete('config');
  });

  it('未設定時 isConfigured 為 false', async () => {
    expect(await isConfigured(testEnv)).toBe(false);
  });

  it('寫入後可讀回相同內容', async () => {
    await writeConfig(testEnv, {
      googleClientId: 'id-123',
      googleClientSecret: 'secret-456',
      stateSecret: 'state-secret',
      adminPasswordHash: 'hash',
      createdAt: '2026-08-18T00:00:00.000Z',
    });
    const config = await readConfig(testEnv);
    expect(config?.googleClientId).toBe('id-123');
    expect(await isConfigured(testEnv)).toBe(true);
  });

  it('密碼雜湊可驗證，錯誤密碼會被拒絕', async () => {
    const hash = await hashPassword('my-passphrase');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPassword('my-passphrase', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});
