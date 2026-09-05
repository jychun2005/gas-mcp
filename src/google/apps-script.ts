import { explainGoogleError } from '../errors';

const BASE_URL = 'https://script.googleapis.com/v1';
const MAX_PAGES = 10;

/** manifest 檔案的固定名稱；updateContent 的 files[] 必須含這一個 */
export const MANIFEST_NAME = 'appsscript';

export type FileType = 'SERVER_JS' | 'HTML' | 'JSON';

export interface ScriptFile {
  name: string;
  type: FileType;
  source: string;
  lastModifyUser?: { name?: string; email?: string };
  createTime?: string;
  updateTime?: string;
}

export interface Project {
  scriptId: string;
  title: string;
  parentId?: string;
  createTime?: string;
  updateTime?: string;
  creator?: { name?: string; email?: string };
  lastModifyUser?: { name?: string; email?: string };
}

export interface Version {
  scriptId: string;
  versionNumber: number;
  description?: string;
  createTime?: string;
}

export interface Deployment {
  deploymentId: string;
  deploymentConfig?: {
    scriptId?: string;
    versionNumber?: number;
    manifestFileName?: string;
    description?: string;
  };
  updateTime?: string;
  entryPoints?: Array<{
    entryPointType?: string;
    webApp?: { url?: string; entryPointConfig?: unknown };
    executionApi?: { entryPointConfig?: unknown };
  }>;
}

export interface MetricsValue {
  value?: string;
  startTime?: string;
  endTime?: string;
}

export interface Metrics {
  activeUsers?: MetricsValue[];
  totalExecutions?: MetricsValue[];
  failedExecutions?: MetricsValue[];
}

export interface ScriptProcess {
  projectName?: string;
  functionName?: string;
  processType?: string;
  processStatus?: string;
  userAccessLevel?: string;
  startTime?: string;
  duration?: string;
}

/** scripts.run 的回應：失敗時 HTTP 仍為 200，錯誤包在 body.error 裡 */
export interface RunResult {
  done?: boolean;
  response?: { result?: unknown };
  error?: {
    details?: Array<{
      errorType?: string;
      errorMessage?: string;
      scriptStackTraceElements?: Array<{ function?: string; lineNumber?: number }>;
    }>;
  };
}

type AccessTokenProvider = () => Promise<string>;

export class AppsScriptClient {
  constructor(private readonly getAccessToken: AccessTokenProvider) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(explainGoogleError(response.status, body as never));
    }
    return body as T;
  }

  /** 依 nextPageToken 逐頁抓取，最多 MAX_PAGES 頁避免失控 */
  private async paginate<T>(path: string, key: string): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const separator = path.includes('?') ? '&' : '?';
      const url = pageToken ? `${path}${separator}pageToken=${encodeURIComponent(pageToken)}` : path;
      const body = await this.request<Record<string, unknown>>(url);

      items.push(...((body[key] as T[]) ?? []));
      pageToken = body.nextPageToken as string | undefined;
      if (!pageToken) break;
    }
    return items;
  }

  // ── 專案 ──────────────────────────────────────────────

  getProject(scriptId: string): Promise<Project> {
    return this.request<Project>(`/projects/${encodeURIComponent(scriptId)}`);
  }

  /** parentId 帶入 Doc/Sheet/Form/Slides 的 Drive ID 即建立容器繫結腳本；省略則為獨立腳本 */
  createProject(title: string, parentId?: string): Promise<Project> {
    return this.request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(parentId ? { title, parentId } : { title }),
    });
  }

  async getContent(scriptId: string): Promise<ScriptFile[]> {
    const body = await this.request<{ files?: ScriptFile[] }>(
      `/projects/${encodeURIComponent(scriptId)}/content`,
    );
    return body.files ?? [];
  }

  /**
   * 整包覆蓋腳本內容——沒帶到的檔案會被刪除。
   * 呼叫端必須先 getContent 取得完整清單再合併，絕不可只送要改的那一個檔案。
   */
  async updateContent(scriptId: string, files: ScriptFile[]): Promise<ScriptFile[]> {
    const body = await this.request<{ files?: ScriptFile[] }>(
      `/projects/${encodeURIComponent(scriptId)}/content`,
      { method: 'PUT', body: JSON.stringify({ files }) },
    );
    return body.files ?? [];
  }

  getMetrics(scriptId: string, granularity: 'DAILY' | 'WEEKLY'): Promise<Metrics> {
    return this.request<Metrics>(
      `/projects/${encodeURIComponent(scriptId)}/metrics?metricsGranularity=${granularity}`,
    );
  }

  // ── 版本 ──────────────────────────────────────────────

  listVersions(scriptId: string): Promise<Version[]> {
    return this.paginate<Version>(
      `/projects/${encodeURIComponent(scriptId)}/versions?pageSize=50`,
      'versions',
    );
  }

  createVersion(scriptId: string, description?: string): Promise<Version> {
    return this.request<Version>(`/projects/${encodeURIComponent(scriptId)}/versions`, {
      method: 'POST',
      body: JSON.stringify(description ? { description } : {}),
    });
  }

  // ── 部署 ──────────────────────────────────────────────

  listDeployments(scriptId: string): Promise<Deployment[]> {
    return this.paginate<Deployment>(
      `/projects/${encodeURIComponent(scriptId)}/deployments?pageSize=50`,
      'deployments',
    );
  }

  createDeployment(
    scriptId: string,
    config: { versionNumber?: number; manifestFileName?: string; description?: string },
  ): Promise<Deployment> {
    return this.request<Deployment>(`/projects/${encodeURIComponent(scriptId)}/deployments`, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  updateDeployment(
    scriptId: string,
    deploymentId: string,
    config: { versionNumber?: number; manifestFileName?: string; description?: string },
  ): Promise<Deployment> {
    return this.request<Deployment>(
      `/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,
      { method: 'PUT', body: JSON.stringify({ deploymentConfig: { scriptId, ...config } }) },
    );
  }

  // ── 執行記錄 ──────────────────────────────────────────

  /** 注意：scriptId 是 query param 而非 path segment */
  listScriptProcesses(scriptId: string): Promise<ScriptProcess[]> {
    return this.paginate<ScriptProcess>(
      `/processes:listScriptProcesses?scriptId=${encodeURIComponent(scriptId)}&pageSize=50`,
      'processes',
    );
  }

  // ── 遠端執行 ──────────────────────────────────────────

  /**
   * 執行腳本中的函式。
   * id 一般應填「部署為 API 可執行檔」後取得的 deployment ID；部分情況下 scriptId 亦可，
   * 因此這裡不替呼叫端做假設，原樣傳入。
   */
  run(id: string, body: { function: string; parameters?: unknown[]; devMode?: boolean }): Promise<RunResult> {
    return this.request<RunResult>(`/scripts/${encodeURIComponent(id)}:run`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
