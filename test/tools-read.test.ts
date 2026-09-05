import { describe, it, expect, vi } from 'vitest';
import { registerReadTools } from '../src/mcp/tools-read';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppsScriptClient } from '../src/google/apps-script';
import type { DriveClient } from '../src/google/drive';

type ToolCallback = (args: Record<string, unknown>) => Promise<{
  content: { text: string }[];
  isError?: boolean;
}>;

function collectTools(script: Partial<AppsScriptClient>, drive: Partial<DriveClient> = {}) {
  const tools = new Map<string, ToolCallback>();
  const fakeServer = {
    registerTool: (name: string, _config: unknown, cb: ToolCallback) => {
      tools.set(name, cb);
    },
  } as unknown as McpServer;
  registerReadTools(fakeServer, script as AppsScriptClient, drive as DriveClient);
  return tools;
}

describe('唯讀工具', () => {
  it('註冊了八個唯讀工具', () => {
    const tools = collectTools({});
    expect([...tools.keys()].sort()).toEqual(
      [
        'get_metrics',
        'get_project',
        'list_deployments',
        'list_executions',
        'list_files',
        'list_projects',
        'list_versions',
        'read_file',
      ].sort(),
    );
  });

  it('list_projects 列出 scriptId', async () => {
    const tools = collectTools(
      {},
      {
        listScriptProjects: vi
          .fn()
          .mockResolvedValue([{ id: 'abc123', name: '出缺席統計', modifiedTime: '2026-08-01T02:00:00Z' }]),
      },
    );

    const result = await tools.get('list_projects')!({});

    expect(result.content[0].text).toContain('出缺席統計');
    expect(result.content[0].text).toContain('abc123');
  });

  it('list_projects 空結果時不可說成「沒有腳本」，要說明繫結腳本的限制與取得 scriptId 的方法', async () => {
    const tools = collectTools({}, { listScriptProjects: vi.fn().mockResolvedValue([]) });

    const result = await tools.get('list_projects')!({});
    const text = result.content[0].text;

    // 使用者的腳本可能全是容器繫結型，訊息必須講清楚而不是誤導成「你沒有腳本」
    expect(text).toContain('不代表你沒有腳本');
    expect(text).toContain('容器繫結');
    expect(text).toContain('專案設定');
    // 仍要保留 API 開關的提示，那是另一個常見原因
    expect(text).toContain('usersettings');
  });

  it('list_projects 有結果時也要註明繫結腳本不在清單中', async () => {
    const tools = collectTools(
      {},
      { listScriptProjects: vi.fn().mockResolvedValue([{ id: 'a', name: 'A' }]) },
    );

    const result = await tools.get('list_projects')!({});

    expect(result.content[0].text).toContain('容器繫結腳本不會出現在這份清單');
  });

  it('list_files 只列檔名與行數，不含原始碼', async () => {
    const tools = collectTools({
      getContent: vi.fn().mockResolvedValue([
        { name: 'Code', type: 'SERVER_JS', source: 'line1\nline2\nline3' },
        { name: 'appsscript', type: 'JSON', source: '{}' },
      ]),
    });

    const result = await tools.get('list_files')!({ scriptId: 's-1' });
    const text = result.content[0].text;

    expect(text).toContain('Code.gs');
    expect(text).toContain('3 行');
    expect(text).not.toContain('line1');
  });

  it('read_file 回傳單一檔案的完整內容', async () => {
    const tools = collectTools({
      getContent: vi
        .fn()
        .mockResolvedValue([{ name: 'Code', type: 'SERVER_JS', source: 'function hello() {}' }]),
    });

    const result = await tools.get('read_file')!({ scriptId: 's-1', fileName: 'Code' });

    expect(result.content[0].text).toContain('function hello() {}');
  });

  it('read_file 找不到檔案時列出現有檔名', async () => {
    const tools = collectTools({
      getContent: vi.fn().mockResolvedValue([
        { name: 'Code', type: 'SERVER_JS', source: '' },
        { name: 'Helper', type: 'SERVER_JS', source: '' },
      ]),
    });

    const result = await tools.get('read_file')!({ scriptId: 's-1', fileName: 'Nope' });

    expect(result.content[0].text).toContain('Code');
    expect(result.content[0].text).toContain('Helper');
  });

  it('get_project 標示獨立腳本與容器繫結腳本', async () => {
    const standalone = collectTools({
      getProject: vi.fn().mockResolvedValue({ scriptId: 's-1', title: 'A' }),
    });
    expect((await standalone.get('get_project')!({ scriptId: 's-1' })).content[0].text).toContain('獨立腳本');

    const bound = collectTools({
      getProject: vi.fn().mockResolvedValue({ scriptId: 's-2', title: 'B', parentId: 'sheet-1' }),
    });
    expect((await bound.get('get_project')!({ scriptId: 's-2' })).content[0].text).toContain('容器繫結');
  });

  it('get_metrics 加總各期間數值並算出失敗率', async () => {
    const tools = collectTools({
      getMetrics: vi.fn().mockResolvedValue({
        totalExecutions: [{ value: '80' }, { value: '20' }],
        failedExecutions: [{ value: '5' }],
        activeUsers: [{ value: '3' }],
      }),
    });

    const result = await tools.get('get_metrics')!({ scriptId: 's-1' });
    const text = result.content[0].text;

    expect(text).toContain('總執行次數：100');
    expect(text).toContain('5.0%');
  });

  it('list_executions 統計失敗筆數', async () => {
    const tools = collectTools({
      listScriptProcesses: vi.fn().mockResolvedValue([
        { functionName: 'daily', processStatus: 'COMPLETED', processType: 'TIME_DRIVEN' },
        { functionName: 'daily', processStatus: 'FAILED', processType: 'TIME_DRIVEN' },
      ]),
    });

    const result = await tools.get('list_executions')!({ scriptId: 's-1' });

    expect(result.content[0].text).toContain('2 筆執行紀錄，其中 1 筆失敗');
  });

  it('list_deployments 顯示 HEAD 部署與網頁應用程式網址', async () => {
    const tools = collectTools({
      listDeployments: vi.fn().mockResolvedValue([
        {
          deploymentId: 'd-1',
          deploymentConfig: { description: '測試' },
          entryPoints: [{ webApp: { url: 'https://script.google.com/macros/s/x/exec' } }],
        },
      ]),
    });

    const result = await tools.get('list_deployments')!({ scriptId: 's-1' });
    const text = result.content[0].text;

    expect(text).toContain('HEAD（開發模式）');
    expect(text).toContain('https://script.google.com/macros/s/x/exec');
  });

  it('API 錯誤會被包成 isError 而非讓工具崩潰', async () => {
    const tools = collectTools({ getContent: vi.fn().mockRejectedValue(new Error('找不到指定的腳本專案')) });

    const result = await tools.get('list_files')!({ scriptId: 'bad' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('找不到指定的腳本專案');
  });
});
