import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { gasMcpHandler, type GasAuthExtra } from '../src/mcp/handler';
import type { AuthProps } from '../src/types';

const PROPS: AuthProps = {
  googleUserId: 'u-1',
  email: 'kevin@example.com',
  name: '吳奇',
  googleRefreshToken: 'rt-1',
};

const CONFIG = { googleClientId: 'id', googleClientSecret: 'secret' };

/** 模擬 OAuth 層驗證完後傳進來的授權脈絡 */
function authOptions(enableRun = false) {
  const extra: GasAuthExtra = { props: PROPS, credentials: CONFIG, enableRun };
  return { authInfo: { token: 't', clientId: 'claude', scopes: ['apps-script'], extra } };
}

function rpc(method: string, params: unknown = {}) {
  return new Request('https://x.workers.dev/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      // 明確宣告 2025 era，走 SDK 的 legacy stateless fallback
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

/**
 * 讀出 JSON-RPC 結果。
 *
 * 2025-era 的 stateless fallback 在 client 的 Accept 含 text/event-stream 時
 * 會以 SSE 回應（這是規範允許的，responseMode 只作用於 2026-era 流量），
 * 所以這裡兩種格式都要能解析——真實的 client 也是這樣處理的。
 */
async function readRpcResult<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.startsWith('event:') && !body.startsWith('data:')) {
    return JSON.parse(body) as T;
  }
  const dataLine = body.split('\n').find((line) => line.startsWith('data:'));
  if (!dataLine) throw new Error(`SSE 回應中找不到 data 行：${body}`);
  return JSON.parse(dataLine.slice('data:'.length).trim()) as T;
}

async function listToolNames(enableRun: boolean): Promise<string[]> {
  const response = await gasMcpHandler.fetch(rpc('tools/list'), authOptions(enableRun));
  const body = await readRpcResult<{ result: { tools: { name: string }[] } }>(response);
  return body.result.tools.map((tool) => tool.name).sort();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// 模組層級 handler 會持有 SSE keepalive 計時器，不關閉的話 vitest 無法結束
afterAll(async () => {
  await gasMcpHandler.close();
});

const READ_WRITE_TOOLS = [
  'create_deployment',
  'create_project',
  'create_version',
  'delete_file',
  'get_metrics',
  'get_project',
  'list_deployments',
  'list_executions',
  'list_files',
  'list_projects',
  'list_versions',
  'read_file',
  'update_deployment',
  'write_file',
];

describe('MCP handler', () => {
  it('預設不註冊 run_function', async () => {
    expect(await listToolNames(false)).toEqual(READ_WRITE_TOOLS.sort());
  });

  it('enableRun 為 true 時才多出 run_function', async () => {
    expect(await listToolNames(true)).toEqual([...READ_WRITE_TOOLS, 'run_function'].sort());
  });

  it('tools/call 會先用 refresh token 換 access token 再打 Google', async () => {
    const fetchMock = vi
      .fn()
      // 第一次：Google token endpoint
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3599 }), { status: 200 }),
      )
      // 第二次：Drive files.list
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ files: [{ id: 'abc', name: '出缺席統計' }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const response = await gasMcpHandler.fetch(
      rpc('tools/call', { name: 'list_projects', arguments: {} }),
      authOptions(),
    );

    const body = await readRpcResult<{ result: { content: { text: string }[] } }>(response);
    expect(body.result.content[0].text).toContain('出缺席統計');
    expect(String(fetchMock.mock.calls[0][0])).toContain('oauth2.googleapis.com/token');
  });

  it('一次請求只跟 Google 換一次 access token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'at-1', expires_in: 3599 }), { status: 200 }),
      )
      .mockResolvedValue(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await gasMcpHandler.fetch(rpc('tools/call', { name: 'list_projects', arguments: {} }), authOptions());

    const tokenCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes('oauth2.googleapis.com'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('initialize 回傳圖示與顯示名稱（Spark 等 legacy client 靠這個顯示 logo）', async () => {
    const request = new Request('https://x.workers.dev/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    const response = await gasMcpHandler.fetch(request, authOptions());
    const body = await readRpcResult<{
      result: { serverInfo: { title?: string; icons?: { src: string; mimeType?: string }[] } };
    }>(response);

    const { serverInfo } = body.result;
    expect(serverInfo.title).toBe('GAS MCP');

    const icons = serverInfo.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);
    // PNG 排在最前面：部分 client（含 Gemini Spark）無法算繪 SVG 圖示
    expect(icons[0].mimeType).toBe('image/png');
    // 圖示網址必須是絕對路徑，且取自實際請求的 origin
    expect(icons[0].src).toBe('https://x.workers.dev/logo-192.png');
  });
});
