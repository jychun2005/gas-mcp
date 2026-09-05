import { describe, it, expect, vi, afterEach } from 'vitest';
import { AppsScriptClient } from '../src/google/apps-script';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('AppsScriptClient', () => {
  it('帶上 Bearer token 呼叫正確的網址', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    await client.getContent('script-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://script.googleapis.com/v1/projects/script-1/content');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer at-1');
  });

  it('自動跟隨 nextPageToken 把所有分頁合併', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ versions: [{ versionNumber: 1 }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ versions: [{ versionNumber: 2 }] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    const versions = await client.listVersions('script-1');

    expect(versions.map((v) => v.versionNumber)).toEqual([1, 2]);
    expect(String(fetchMock.mock.calls[1][0])).toContain('pageToken=p2');
  });

  it('分頁上限保護：最多抓 10 頁就停', async () => {
    // 每次都要回傳全新的 Response —— Response 的 body 只能被讀取一次
    const fetchMock = vi.fn(async () =>
      jsonResponse({ versions: [{ versionNumber: 1 }], nextPageToken: 'always' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    const versions = await client.listVersions('script-1');

    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(versions).toHaveLength(10);
  });

  it('尚未開啟 Apps Script API 時，錯誤訊息直接給設定頁連結', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { error: { message: 'User has not enabled the Apps Script API. Enable it by visiting...' } },
          403,
        ),
      ),
    );
    const client = new AppsScriptClient(async () => 'at-1');
    await expect(client.getContent('script-1')).rejects.toThrow('script.google.com/home/usersettings');
  });

  it('listScriptProcesses 把 scriptId 放在 query 而非路徑', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ processes: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    await client.listScriptProcesses('script-1');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/processes:listScriptProcesses?scriptId=script-1');
  });

  it('updateContent 以 PUT 送出完整的 files 陣列', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ files: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    await client.updateContent('script-1', [
      { name: 'appsscript', type: 'JSON', source: '{}' },
      { name: 'Code', type: 'SERVER_JS', source: 'function a(){}' },
    ]);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string).files).toHaveLength(2);
  });

  it('createProject 省略 parentId 時不送出該欄位', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ scriptId: 's-1', title: '新專案' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    await client.createProject('新專案');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ title: '新專案' });
  });

  it('getMetrics 帶上 metricsGranularity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new AppsScriptClient(async () => 'at-1');
    await client.getMetrics('script-1', 'WEEKLY');

    expect(String(fetchMock.mock.calls[0][0])).toContain('metricsGranularity=WEEKLY');
  });
});
