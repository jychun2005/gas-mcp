import { describe, it, expect, vi, afterEach } from 'vitest';
import { DriveClient, SCRIPT_MIME_TYPE } from '../src/google/drive';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** 從 fetch 呼叫中取出 Drive 的 q 查詢字串 */
function queryOf(call: unknown[]): string {
  return new URL(String(call[0])).searchParams.get('q') ?? '';
}

describe('DriveClient', () => {
  it('只查 Apps Script 類型且未在垃圾桶的檔案', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await new DriveClient(async () => 'at-1').listScriptProjects();

    const q = queryOf(fetchMock.mock.calls[0]);
    expect(q).toContain(`mimeType='${SCRIPT_MIME_TYPE}'`);
    expect(q).toContain('trashed=false');
  });

  it('帶上 nameContains 時加入檔名條件', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await new DriveClient(async () => 'at-1').listScriptProjects('成績');

    expect(queryOf(fetchMock.mock.calls[0])).toContain("name contains '成績'");
  });

  it('檔名中的單引號會被跳脫，不會破壞查詢語法', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await new DriveClient(async () => 'at-1').listScriptProjects("Kevin's");

    expect(queryOf(fetchMock.mock.calls[0])).toContain("name contains 'Kevin\\'s'");
  });

  it('自動跟隨分頁', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'a', name: 'A' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'b', name: 'B' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const files = await new DriveClient(async () => 'at-1').listScriptProjects();

    expect(files.map((file) => file.id)).toEqual(['a', 'b']);
  });

  it('錯誤時拋出翻譯後的訊息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'nope' } }, 429)));
    await expect(new DriveClient(async () => 'at-1').listScriptProjects()).rejects.toThrow('配額');
  });
});
