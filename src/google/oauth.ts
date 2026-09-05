import type { ServerConfig } from '../types';

/**
 * 一律要求的 scope。
 *
 * drive.metadata.readonly 是刻意的取捨：Apps Script API 沒有 projects.list
 * （https://issuetracker.google.com/issues/170982282），要列出既有腳本專案
 * 只能改用 Drive API 查 mimeType。drive.file 只看得到本 app 建立或開啟過的檔案，
 * 找不到既有專案，所以不可行；drive.metadata.readonly 是能達成目的的最窄範圍——
 * 只讀得到檔名與 ID，讀不到任何檔案內容。
 */
export const BASE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/script.projects', // create / get / getContent / updateContent / versions
  'https://www.googleapis.com/auth/script.deployments', // deployments.*
  'https://www.googleapis.com/auth/script.metrics', // projects.getMetrics
  'https://www.googleapis.com/auth/script.processes', // processes.*
  'https://www.googleapis.com/auth/drive.metadata.readonly', // 唯一可行的 list_projects 途徑
];

/**
 * 組出這次授權要送給 Google 的完整 scope 清單。
 * 啟用遠端執行時，才把擁有者在 /setup 填的額外 scope 串上去——
 * scripts.run 的 token 必須涵蓋目標腳本 manifest 宣告的每一個 scope。
 */
export function buildScopes(config: Pick<ServerConfig, 'enableRun' | 'extraScopes'>): string[] {
  const scopes = new Set(BASE_SCOPES);
  if (config.enableRun) {
    for (const scope of config.extraScopes ?? []) {
      const trimmed = scope.trim();
      if (trimmed) scopes.add(trimmed);
    }
  }
  return [...scopes];
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

export function buildGoogleAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', params.scopes.join(' '));
  url.searchParams.set('state', params.state);
  // access_type=offline + prompt=consent 才保證每次都拿得到 refresh token
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  return url.toString();
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
}

export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const body = (await response.json()) as Record<string, string>;
  if (!response.ok) {
    throw new Error(`Google 拒絕授權碼交換：${body.error ?? response.status}（${body.error_description ?? ''}）`);
  }
  if (!body.refresh_token) {
    throw new Error(
      'Google 沒有回傳 refresh token。請到 Google 帳戶的「第三方應用程式」移除本 app 的存取權後重試一次。',
    );
  }
  return { accessToken: body.access_token, refreshToken: body.refresh_token };
}

export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  const body = (await response.json()) as Record<string, string>;
  if (!response.ok) {
    throw new Error(
      `Google 授權已失效（${body.error ?? response.status}），請在 AI 助理中移除本 app 後重新連接以重新授權。`,
    );
  }
  return body.access_token;
}

export async function fetchGoogleUserInfo(
  accessToken: string,
): Promise<{ sub: string; email: string; name: string }> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`無法取得 Google 使用者資訊（HTTP ${response.status}）`);
  }
  const body = (await response.json()) as { sub: string; email?: string; name?: string };
  return { sub: body.sub, email: body.email ?? '', name: body.name ?? body.email ?? '未知使用者' };
}
