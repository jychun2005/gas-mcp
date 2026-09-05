import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { authHandler } from './auth-handler';
import { readConfig } from './config';
import { gasMcpHandler, type GasAuthExtra } from './mcp/handler';
import type { AuthProps, Env } from './types';

/**
 * 受 OAuth 保護的 /mcp 端點。
 * workers-oauth-provider 驗證完 bearer token 後，會把授權時存下的 props
 * （含 Google refresh token）放在 this.ctx.props。
 */
export class GasMcpEntrypoint extends WorkerEntrypoint<Env, AuthProps> {
  async fetch(request: Request): Promise<Response> {
    const config = await readConfig(this.env);
    if (!config) {
      return new Response('伺服器尚未完成設定，請先造訪 /setup。', { status: 503 });
    }

    const props = this.ctx.props;
    const extra: GasAuthExtra = {
      props,
      credentials: {
        googleClientId: config.googleClientId,
        googleClientSecret: config.googleClientSecret,
      },
      enableRun: config.enableRun === true,
    };

    return gasMcpHandler.fetch(request, {
      authInfo: {
        // 這個 token 抵達這裡前已由 workers-oauth-provider 驗證完畢
        token: request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '',
        clientId: props.mcpClientId ?? '',
        scopes: ['apps-script'],
        extra,
      },
    });
  }
}

export default new OAuthProvider({
  apiRoute: '/mcp',
  apiHandler: GasMcpEntrypoint,
  defaultHandler: authHandler,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['apps-script'],
  // 2026-07-28 spec 建議改用 CIMD；仍保留 DCR 以相容目前的 Gemini Spark
  clientIdMetadataDocumentEnabled: true,
});
