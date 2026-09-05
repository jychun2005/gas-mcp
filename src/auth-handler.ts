import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import { readConfig, writeConfig } from './config';
import { signState, verifyState } from './state';
import { buildGoogleAuthUrl, buildScopes, exchangeCodeForTokens, fetchGoogleUserInfo } from './google/oauth';
import { handleSetupRequest } from './setup-page';
import { privacyPolicyPage, termsOfServicePage } from './legal-pages';
import { logoResponse, logoPngResponse, FAVICON_LINK } from './logo';
import type { AuthProps, Env } from './types';

const GOOGLE_CALLBACK_PATH = '/oauth/google/callback';

function html(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <title>GAS MCP</title>
     ${FAVICON_LINK}
     <style>body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;max-width:36rem;margin:4rem auto;padding:0 1.5rem;line-height:1.7;color:#1a1a1a}code{background:#f0f0f0;padding:.15em .4em;border-radius:.25em}a{color:#4285f4}</style>
     </head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function errorPage(title: string, detail: string, status = 400): Response {
  return html(`<h1>${title}</h1><p>${detail}</p>`, status);
}

export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/setup') {
      return handleSetupRequest(request, env);
    }

    if (url.pathname === '/logo.svg') {
      return logoResponse();
    }

    // /favicon.ico 一併給 PNG：瀏覽器與部分 client 會直接抓這個固定路徑，
    // 少了它會留下一堆 404。PNG 放在 .ico 路徑上所有主流瀏覽器都吃得下。
    if (url.pathname === '/logo-192.png' || url.pathname === '/favicon.ico') {
      return logoPngResponse();
    }

    if (url.pathname === '/privacy') {
      return privacyPolicyPage(url.origin);
    }

    if (url.pathname === '/terms') {
      return termsOfServicePage(url.origin);
    }

    if (url.pathname === '/') {
      const config = await readConfig(env);
      const status = config
        ? `<p>伺服器已就緒。請把下面這個網址貼進 AI 助理的自訂 MCP 設定
           （Claude 的「Settings → Connectors → Add custom connector」，
            或 Gemini 的「Connected Apps → Custom apps for Spark」）：</p>
           <p><code>${escapeHtml(url.origin)}/mcp</code></p>`
        : `<p>這台伺服器還沒完成設定。請前往 <a href="/setup">/setup</a> 完成初次設定。</p>`;

      return html(
        `<p><img src="/logo.svg" width="72" height="72" alt=""></p>
         <h1>GAS MCP</h1>
         <p>這是一個自行部署的開源工具，讓 AI 助理透過 Model Context Protocol
            讀寫你自己的 Google Apps Script 專案。</p>
         ${status}
         <h2>它能做什麼</h2>
         <ul>
           <li>列出腳本專案、讀取與寫入程式碼檔案</li>
           <li>建立版本、建立與更新部署</li>
           <li>查看執行紀錄與使用統計，排查失敗的觸發器</li>
         </ul>
         <p>每次寫入檔案前都會自動建立一個版本作為還原點。
            遠端執行函式（<code>run_function</code>）預設關閉。</p>
         <p>本服務只申請 Google 雲端硬碟的<strong>唯讀中繼資料</strong>權限，
            用途僅限列出腳本專案清單，讀不到任何檔案內容。</p>
         <p><a href="/privacy">隱私權政策</a> ・ <a href="/terms">服務條款</a></p>`,
      );
    }

    if (url.pathname === '/authorize') {
      return handleAuthorize(request, env, url);
    }

    if (url.pathname === GOOGLE_CALLBACK_PATH) {
      return handleGoogleCallback(env, url);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleAuthorize(request: Request, env: Env, url: URL): Promise<Response> {
  const config = await readConfig(env);
  if (!config) {
    return errorPage('尚未完成設定', `請先到 <a href="/setup">${escapeHtml(url.origin)}/setup</a> 設定 Google OAuth 憑證。`, 503);
  }

  let oauthRequest: AuthRequest;
  try {
    oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch {
    return errorPage('授權請求無效', '這個授權請求缺少必要參數，請回到 AI 助理重新加入一次這個連接器。');
  }

  const state = await signState(oauthRequest, config.stateSecret);
  const googleUrl = buildGoogleAuthUrl({
    clientId: config.googleClientId,
    redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
    state,
    // scope 依設定動態組合：啟用遠端執行時才加上腳本自己需要的 scope
    scopes: buildScopes(config),
  });

  return Response.redirect(googleUrl, 302);
}

async function handleGoogleCallback(env: Env, url: URL): Promise<Response> {
  const config = await readConfig(env);
  if (!config) {
    return errorPage('尚未完成設定', '請先完成 /setup。', 503);
  }

  const googleError = url.searchParams.get('error');
  if (googleError) {
    return errorPage('Google 授權未完成', `Google 回報：<code>${escapeHtml(googleError)}</code>。請重新嘗試連接。`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return errorPage('回呼參數不完整', '缺少 code 或 state，請重新嘗試連接。');
  }

  const oauthRequest = await verifyState<AuthRequest>(state, config.stateSecret);
  if (!oauthRequest) {
    return errorPage('授權狀態驗證失敗', '這個授權連結可能已經過期或被竄改，請回到 AI 助理重新連接一次。');
  }

  let tokens;
  let userInfo;
  try {
    tokens = await exchangeCodeForTokens({
      code,
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: `${url.origin}${GOOGLE_CALLBACK_PATH}`,
    });
    userInfo = await fetchGoogleUserInfo(tokens.accessToken);
  } catch (error) {
    return errorPage('無法完成 Google 授權', escapeHtml(error instanceof Error ? error.message : String(error)), 502);
  }

  // 第一個完成授權的人成為擁有者，之後只接受同一個帳號
  if (!config.ownerEmail) {
    await writeConfig(env, { ...config, ownerEmail: userInfo.email });
  } else if (config.ownerEmail !== userInfo.email) {
    return errorPage(
      '這台伺服器不屬於你',
      `這個部署已綁定 <code>${escapeHtml(config.ownerEmail)}</code>。若你要自己使用，請部署一份屬於你自己的伺服器。`,
      403,
    );
  }

  const props: AuthProps = {
    googleUserId: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name,
    googleRefreshToken: tokens.refreshToken,
    mcpClientId: oauthRequest.clientId,
  };

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthRequest,
    userId: userInfo.sub,
    metadata: { label: userInfo.email },
    scope: oauthRequest.scope,
    props,
  });

  return Response.redirect(redirectTo, 302);
}
