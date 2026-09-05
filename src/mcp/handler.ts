import { createMcpHandler, McpServer, type McpHttpHandler } from '@modelcontextprotocol/server';
import { AppsScriptClient } from '../google/apps-script';
import { DriveClient } from '../google/drive';
import { refreshAccessToken } from '../google/oauth';
import { registerReadTools } from './tools-read';
import { registerWriteTools } from './tools-write';
import { registerRunTools } from './tools-run';
import type { AuthProps } from '../types';
import { serverIcons } from '../logo';

export interface GoogleCredentials {
  googleClientId: string;
  googleClientSecret: string;
}

/** 經由 AuthInfo.extra 傳進工具工廠的每請求脈絡 */
export interface GasAuthExtra {
  props: AuthProps;
  credentials: GoogleCredentials;
  /** 是否註冊 run_function（來自 CONFIG_KV 的 enableRun） */
  enableRun: boolean;
  // AuthInfo.extra 的型別是 Record<string, unknown>，需要 index signature 才能相容
  [key: string]: unknown;
}

/**
 * 為單一請求建立綁定該使用者的 McpServer。
 *
 * access token 在這個 server 實例的生命週期內快取：工廠每個請求執行一次，
 * 所以同一次請求裡的多個工具呼叫共用同一個 token，不會重複跟 Google 要。
 */
export function buildGasServer(extra: GasAuthExtra, origin?: string): McpServer {
  let cachedToken: Promise<string> | undefined;

  const getAccessToken = () => {
    cachedToken ??= refreshAccessToken({
      refreshToken: extra.props.googleRefreshToken,
      clientId: extra.credentials.googleClientId,
      clientSecret: extra.credentials.googleClientSecret,
    });
    return cachedToken;
  };

  const script = new AppsScriptClient(getAccessToken);
  const drive = new DriveClient(getAccessToken);

  // origin 用來組出圖示的絕對網址；取不到時退回已部署的預設網域
  const base = origin ?? 'https://gas-mcp.jdn2023.workers.dev';

  const server = new McpServer({
    name: 'gas-mcp',
    title: 'GAS MCP',
    version: '1.0.0',
    description: '讀寫你的 Google Apps Script 專案：檔案內容、版本、部署與執行紀錄。',
    websiteUrl: base,
    icons: serverIcons(base),
  });

  registerReadTools(server, script, drive);
  registerWriteTools(server, script);
  // 遠端執行是進階功能，預設不註冊——沒開啟時 tools/list 不會出現 run_function
  if (extra.enableRun) {
    registerRunTools(server, script);
  }
  return server;
}

/**
 * 模組層級的單一 handler。
 *
 * 刻意不是每個請求各建一個 handler：handler 擁有 subscriptions/listen 的事件匯流排
 * 與 SSE keepalive，若每請求重建再 close()，會在回應串流還沒送完時把它中斷。
 * 官方 SDK 的做法是 handler 只建一次，使用者脈絡透過 `fetch(request, { authInfo })`
 * 傳入，工廠會為每個請求產生全新的 server 實例。
 */
export const gasMcpHandler: McpHttpHandler = createMcpHandler(
  (ctx) => {
    const extra = ctx.authInfo?.extra as GasAuthExtra | undefined;
    if (!extra) {
      throw new Error('缺少授權脈絡：這個端點必須經過 OAuth 驗證後才能呼叫。');
    }
    const origin = ctx.requestInfo ? new URL(ctx.requestInfo.url).origin : undefined;
    return buildGasServer(extra, origin);
  },
  // 這些工具沒有串流輸出的需求，固定回 JSON 相容性最好。
  // 注意：此設定只作用於 2026-07-28（modern era）流量；2025-era 的 client
  // 若 Accept 含 text/event-stream 仍會收到 SSE，這是規範允許的行為。
  { responseMode: 'json' },
);
