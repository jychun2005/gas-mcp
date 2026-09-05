import { describe, it, expect, vi } from 'vitest';
import { registerWriteTools } from '../src/mcp/tools-write';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppsScriptClient, ScriptFile } from '../src/google/apps-script';

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
  registerWriteTools(fakeServer, client as AppsScriptClient);
  return tools;
}

const MANIFEST: ScriptFile = { name: 'appsscript', type: 'JSON', source: '{"timeZone":"Asia/Taipei"}' };
const CODE: ScriptFile = { name: 'Code', type: 'SERVER_JS', source: 'function a() {}' };
const HELPER: ScriptFile = { name: 'Helper', type: 'SERVER_JS', source: 'function b() {}' };

describe('寫入工具', () => {
  it('註冊了六個寫入工具', () => {
    const tools = collectTools({});
    expect([...tools.keys()].sort()).toEqual(
      [
        'create_deployment',
        'create_project',
        'create_version',
        'delete_file',
        'update_deployment',
        'write_file',
      ].sort(),
    );
  });

  describe('write_file', () => {
    it('覆寫時保留其他檔案 —— updateContent 是整包覆蓋，少帶就會被刪掉', async () => {
      const updateContent = vi.fn().mockResolvedValue([]);
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, CODE, HELPER]),
        createVersion: vi.fn().mockResolvedValue({ versionNumber: 7 }),
        updateContent,
      });

      await tools.get('write_file')!({ scriptId: 's-1', fileName: 'Code', source: 'function a() { return 1; }' });

      const files = updateContent.mock.calls[0][1] as ScriptFile[];
      expect(files.map((file) => file.name).sort()).toEqual(['Code', 'Helper', 'appsscript']);
      expect(files.find((file) => file.name === 'Code')!.source).toBe('function a() { return 1; }');
      expect(files.find((file) => file.name === 'Helper')!.source).toBe(HELPER.source);
    });

    it('檔案不存在時是新增而非覆蓋整包', async () => {
      const updateContent = vi.fn().mockResolvedValue([]);
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, CODE]),
        createVersion: vi.fn().mockResolvedValue({ versionNumber: 3 }),
        updateContent,
      });

      const result = await tools.get('write_file')!({
        scriptId: 's-1',
        fileName: 'NewFile',
        source: 'function c() {}',
      });

      const files = updateContent.mock.calls[0][1] as ScriptFile[];
      expect(files).toHaveLength(3);
      expect(files.find((file) => file.name === 'NewFile')!.type).toBe('SERVER_JS');
      expect(result.content[0].text).toContain('新增');
    });

    it('寫入前先建立備份版本，並在回覆中告知還原點', async () => {
      const calls: string[] = [];
      const tools = collectTools({
        getContent: vi.fn(async () => {
          calls.push('getContent');
          return [MANIFEST, CODE];
        }),
        createVersion: vi.fn(async () => {
          calls.push('createVersion');
          return { scriptId: 's-1', versionNumber: 12 };
        }),
        updateContent: vi.fn(async () => {
          calls.push('updateContent');
          return [];
        }),
      });

      const result = await tools.get('write_file')!({ scriptId: 's-1', fileName: 'Code', source: 'changed' });

      expect(calls).toEqual(['getContent', 'createVersion', 'updateContent']);
      expect(result.content[0].text).toContain('版本 12');
    });

    it('備份失敗時絕不寫入', async () => {
      const updateContent = vi.fn();
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, CODE]),
        createVersion: vi.fn().mockRejectedValue(new Error('配額用盡')),
        updateContent,
      });

      const result = await tools.get('write_file')!({ scriptId: 's-1', fileName: 'Code', source: 'changed' });

      expect(updateContent).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('已中止寫入');
      expect(result.content[0].text).toContain('配額用盡');
    });

    it('內容完全相同時不建版本也不寫入', async () => {
      const createVersion = vi.fn();
      const updateContent = vi.fn();
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, CODE]),
        createVersion,
        updateContent,
      });

      const result = await tools.get('write_file')!({
        scriptId: 's-1',
        fileName: 'Code',
        source: CODE.source,
      });

      expect(createVersion).not.toHaveBeenCalled();
      expect(updateContent).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('未做任何變更');
    });

    it('沿用既有檔案的型別', async () => {
      const updateContent = vi.fn().mockResolvedValue([]);
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, { name: 'Page', type: 'HTML', source: '<p>a</p>' }]),
        createVersion: vi.fn().mockResolvedValue({ versionNumber: 1 }),
        updateContent,
      });

      await tools.get('write_file')!({ scriptId: 's-1', fileName: 'Page', source: '<p>b</p>' });

      const files = updateContent.mock.calls[0][1] as ScriptFile[];
      expect(files.find((file) => file.name === 'Page')!.type).toBe('HTML');
    });

    it('拒絕把 manifest 寫成非 JSON 型別', async () => {
      const updateContent = vi.fn();
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST]),
        createVersion: vi.fn(),
        updateContent,
      });

      const result = await tools.get('write_file')!({
        scriptId: 's-1',
        fileName: 'appsscript',
        source: '{}',
        type: 'SERVER_JS',
      });

      expect(updateContent).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('必須是 JSON');
    });
  });

  describe('delete_file', () => {
    it('拒絕刪除 manifest', async () => {
      const getContent = vi.fn();
      const tools = collectTools({ getContent });

      const result = await tools.get('delete_file')!({ scriptId: 's-1', fileName: 'appsscript' });

      expect(getContent).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('不能刪除');
    });

    it('刪除前先建備份，且只移除指定檔案', async () => {
      const updateContent = vi.fn().mockResolvedValue([]);
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, CODE, HELPER]),
        createVersion: vi.fn().mockResolvedValue({ versionNumber: 5 }),
        updateContent,
      });

      const result = await tools.get('delete_file')!({ scriptId: 's-1', fileName: 'Helper' });

      const files = updateContent.mock.calls[0][1] as ScriptFile[];
      expect(files.map((file) => file.name).sort()).toEqual(['Code', 'appsscript']);
      expect(result.content[0].text).toContain('版本 5');
    });

    it('檔案不存在時列出現有檔案，不做任何寫入', async () => {
      const updateContent = vi.fn();
      const tools = collectTools({
        getContent: vi.fn().mockResolvedValue([MANIFEST, CODE]),
        createVersion: vi.fn(),
        updateContent,
      });

      const result = await tools.get('delete_file')!({ scriptId: 's-1', fileName: 'Missing' });

      expect(updateContent).not.toHaveBeenCalled();
      expect(result.content[0].text).toContain('Code');
    });
  });

  it('create_project 帶 parentId 時建立容器繫結腳本', async () => {
    const createProject = vi.fn().mockResolvedValue({ scriptId: 's-9', title: '成績表腳本' });
    const tools = collectTools({ createProject });

    const result = await tools.get('create_project')!({ title: '成績表腳本', parentId: 'sheet-1' });

    expect(createProject).toHaveBeenCalledWith('成績表腳本', 'sheet-1');
    expect(result.content[0].text).toContain('sheet-1');
  });

  it('create_deployment 預設帶上 appsscript 作為 manifest 檔名', async () => {
    const createDeployment = vi.fn().mockResolvedValue({ deploymentId: 'd-1' });
    const tools = collectTools({ createDeployment });

    await tools.get('create_deployment')!({ scriptId: 's-1', versionNumber: 3 });

    expect(createDeployment.mock.calls[0][1]).toMatchObject({ versionNumber: 3, manifestFileName: 'appsscript' });
  });

  it('API 錯誤會被包成 isError 而非讓工具崩潰', async () => {
    const tools = collectTools({ createVersion: vi.fn().mockRejectedValue(new Error('權限不足')) });

    const result = await tools.get('create_version')!({ scriptId: 's-1' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('權限不足');
  });
});
