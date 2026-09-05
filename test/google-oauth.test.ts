import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildGoogleAuthUrl,
  buildScopes,
  exchangeCodeForTokens,
  refreshAccessToken,
  BASE_SCOPES,
} from '../src/google/oauth';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('buildScopes', () => {
  it('未啟用遠端執行時只給基本 scope', () => {
    const scopes = buildScopes({ enableRun: false, extraScopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    expect(scopes).toEqual(BASE_SCOPES);
  });

  it('啟用遠端執行時串上額外 scope', () => {
    const scopes = buildScopes({
      enableRun: true,
      extraScopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    expect(scopes).toContain('https://www.googleapis.com/auth/spreadsheets');
    expect(scopes.length).toBe(BASE_SCOPES.length + 1);
  });

  it('額外 scope 去重且忽略空白', () => {
    const scopes = buildScopes({
      enableRun: true,
      extraScopes: ['  https://www.googleapis.com/auth/script.projects  ', '', '   '],
    });
    // script.projects 已在 BASE_SCOPES，不應重複
    expect(scopes).toEqual(BASE_SCOPES);
  });

  it('一定包含 Drive 唯讀 metadata —— 沒有它就無法列出腳本專案', () => {
    expect(BASE_SCOPES).toContain('https://www.googleapis.com/auth/drive.metadata.readonly');
    // 不可誤用更寬的 Drive 權限
    expect(BASE_SCOPES).not.toContain('https://www.googleapis.com/auth/drive');
  });
});

describe('buildGoogleAuthUrl', () => {
  it('包含必要參數，且要求離線存取與強制同意畫面', () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: 'client-1',
        redirectUri: 'https://x.workers.dev/oauth/google/callback',
        state: 'signed-state',
        scopes: BASE_SCOPES,
      }),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('signed-state');
    // 沒有 offline + consent 就拿不到 refresh token
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe(BASE_SCOPES.join(' '));
  });
});

describe('exchangeCodeForTokens', () => {
  it('成功時回傳 access token 與 refresh token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3599 }), {
          status: 200,
        }),
      ),
    );
    const tokens = await exchangeCodeForTokens({
      code: 'code-1',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://x.workers.dev/oauth/google/callback',
    });
    expect(tokens.accessToken).toBe('at-1');
    expect(tokens.refreshToken).toBe('rt-1');
  });

  it('Google 未回 refresh token 時拋出可行動的錯誤', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'at-1' }), { status: 200 })),
    );
    await expect(
      exchangeCodeForTokens({ code: 'c', clientId: 'i', clientSecret: 's', redirectUri: 'https://x/cb' }),
    ).rejects.toThrow('refresh token');
  });

  it('交換失敗時錯誤訊息含 Google 回傳內容', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
    );
    await expect(
      exchangeCodeForTokens({ code: 'c', clientId: 'i', clientSecret: 's', redirectUri: 'https://x/cb' }),
    ).rejects.toThrow('invalid_grant');
  });
});

describe('refreshAccessToken', () => {
  it('用 refresh token 換到新的 access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'at-2', expires_in: 3599 }), { status: 200 }),
      ),
    );
    const token = await refreshAccessToken({ refreshToken: 'rt-1', clientId: 'i', clientSecret: 's' });
    expect(token).toBe('at-2');
  });

  it('refresh token 失效時提示重新授權', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
    );
    await expect(
      refreshAccessToken({ refreshToken: 'bad', clientId: 'i', clientSecret: 's' }),
    ).rejects.toThrow('重新授權');
  });
});
