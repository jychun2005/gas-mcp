import { describe, it, expect, vi } from 'vitest';
import { registerRunTools } from '../src/mcp/tools-run';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppsScriptClient } from '../src/google/apps-script';

type ToolCallback = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

function collectTools(client: Partial<AppsScriptClient>) {
  const tools = new Map<string, ToolCallback>();
  const fakeServer = {
    registerTool: (name: string, _config: unknown, cb: ToolCallback) => {
      tools.set(name, cb);
    },
  } as unknown as McpServer;
  registerRunTools(fakeServer, client as AppsScriptClient);
  return tools;
}

describe('run_function', () => {
  it('把函式名稱與參數原樣送出', async () => {
    const run = vi.fn().mockResolvedValue({ done: true, response: { result: 42 } });
    const tools = collectTools({ run });

    await tools.get('run_function')!({
      deploymentId: 'd-1',
      functionName: 'sum',
      parameters: [1, 2],
      devMode: true,
    });

    expect(run).toHaveBeenCalledWith('d-1', { function: 'sum', parameters: [1, 2], devMode: true });
  });

  it('回傳值為物件時序列化成 JSON', async () => {
    const tools = collectTools({
      run: vi.fn().mockResolvedValue({ done: true, response: { result: { ok: true } } }),
    });

    const result = await tools.get('run_function')!({ deploymentId: 'd-1', functionName: 'f' });

    expect(result.content[0].text).toContain('"ok": true');
  });

  it('沒有回傳值時明講執行完成', async () => {
    const tools = collectTools({ run: vi.fn().mockResolvedValue({ done: true, response: {} }) });

    const result = await tools.get('run_function')!({ deploymentId: 'd-1', functionName: 'f' });

    expect(result.content[0].text).toContain('沒有回傳值');
  });

  it('腳本內部錯誤藏在 HTTP 200 的 body 裡，仍要解析出訊息與堆疊', async () => {
    const tools = collectTools({
      run: vi.fn().mockResolvedValue({
        done: true,
        error: {
          details: [
            {
              errorType: 'TypeError',
              errorMessage: '無法讀取 undefined 的屬性',
              scriptStackTraceElements: [{ function: 'myFunction', lineNumber: 17 }],
            },
          ],
        },
      }),
    });

    const result = await tools.get('run_function')!({ deploymentId: 'd-1', functionName: 'myFunction' });
    const text = result.content[0].text;

    expect(text).toContain('TypeError');
    expect(text).toContain('無法讀取 undefined 的屬性');
    expect(text).toContain('第 17 行');
  });

  it('error 沒有 details 時給得出說法而非崩潰', async () => {
    const tools = collectTools({ run: vi.fn().mockResolvedValue({ done: true, error: {} }) });

    const result = await tools.get('run_function')!({ deploymentId: 'd-1', functionName: 'f' });

    expect(result.content[0].text).toContain('沒有回傳詳細錯誤內容');
  });
});
