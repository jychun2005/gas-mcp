import { explainGoogleError } from '../errors';

const BASE_URL = 'https://www.googleapis.com/drive/v3';
const MAX_PAGES = 5;

/** Apps Script 專案在 Drive 裡的 MIME type */
export const SCRIPT_MIME_TYPE = 'application/vnd.google-apps.script';

export interface DriveScriptFile {
  id: string;
  name: string;
  modifiedTime?: string;
  owners?: Array<{ displayName?: string; emailAddress?: string }>;
}

type AccessTokenProvider = () => Promise<string>;

/**
 * Drive API 只用來做一件事：列出腳本專案。
 *
 * Apps Script API 沒有 projects.list，這是唯一能取得既有 scriptId 清單的官方途徑。
 * 只用了 drive.metadata.readonly，讀得到檔名與 ID，讀不到任何檔案內容。
 */
export class DriveClient {
  constructor(private readonly getAccessToken: AccessTokenProvider) {}

  private async request<T>(path: string): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(explainGoogleError(response.status, body as never));
    }
    return body as T;
  }

  /** @param nameContains 選填的檔名關鍵字，用來在專案很多時縮小範圍 */
  async listScriptProjects(nameContains?: string): Promise<DriveScriptFile[]> {
    const conditions = [`mimeType='${SCRIPT_MIME_TYPE}'`, 'trashed=false'];
    if (nameContains) {
      // Drive 查詢字串裡的單引號要用反斜線跳脫
      conditions.push(`name contains '${nameContains.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
    }

    const params = new URLSearchParams({
      q: conditions.join(' and '),
      fields: 'nextPageToken,files(id,name,modifiedTime,owners(displayName,emailAddress))',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
    });

    const items: DriveScriptFile[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      if (pageToken) params.set('pageToken', pageToken);
      const body = await this.request<{ files?: DriveScriptFile[]; nextPageToken?: string }>(
        `/files?${params.toString()}`,
      );
      items.push(...(body.files ?? []));
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return items;
  }
}
