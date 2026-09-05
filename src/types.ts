import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

export interface Env {
  OAUTH_KV: KVNamespace;
  CONFIG_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
}

/** 授權完成後存進 grant 的資料（由 workers-oauth-provider 加密保存） */
export interface AuthProps {
  /** Google 使用者 ID（sub） */
  googleUserId: string;
  email: string;
  name: string;
  /** 長期有效的 Google refresh token，用來換 access token */
  googleRefreshToken: string;
  /** 發起這次授權的 MCP client id（供稽核與除錯用） */
  mcpClientId?: string;
  [key: string]: unknown;
}

/** 存在 CONFIG_KV 的部署設定 */
export interface ServerConfig {
  googleClientId: string;
  googleClientSecret: string;
  /** 簽 OAuth state 用的隨機密鑰，首次 setup 時自動產生 */
  stateSecret: string;
  /** 管理密碼的 SHA-256 hex，用來保護 /setup */
  adminPasswordHash: string;
  /** 第一個完成授權的 Google 帳號，之後只允許這個帳號 */
  ownerEmail?: string;
  createdAt: string;

  /**
   * 是否註冊 run_function 工具（遠端執行 GAS 函式）。
   * 預設 false：scripts.run 要求呼叫端 Cloud 專案與腳本同源，且等於讓 AI 直接執行程式碼。
   */
  enableRun?: boolean;
  /**
   * 額外要求的 OAuth scope。
   * scripts.run 的 access token 必須涵蓋目標腳本 manifest 裡宣告的每一個 scope，
   * 這無法由伺服器推導，只能由擁有者從 appsscript.json 抄進 /setup。
   */
  extraScopes?: string[];
}
