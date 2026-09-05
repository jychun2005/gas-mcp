import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppsScriptClient } from '../google/apps-script';
import type { DriveClient } from '../google/drive';
import { formatGoogleTime } from './datetime';
import { countLines, safe, text } from './shared';

const FILE_TYPE_LABEL: Record<string, string> = {
  SERVER_JS: '.gs',
  HTML: '.html',
  JSON: '.json',
};

function extensionOf(type: string): string {
  return FILE_TYPE_LABEL[type] ?? '';
}

export function registerReadTools(
  server: McpServer,
  script: AppsScriptClient,
  drive: DriveClient,
): void {
  server.registerTool(
    'list_projects',
    {
      title: '列出獨立腳本專案',
      description:
        '列出使用者的「獨立」Apps Script 專案，含 scriptId。' +
        '**重要限制：這個工具看不到容器繫結腳本**（綁在某個試算表／文件／表單／簡報裡的腳本）——' +
        'Google 的 Drive API 查不到那一類，這是平台限制，不是設定問題。' +
        '若這裡回傳空的、或使用者要找的腳本不在清單中，不要告訴使用者「你沒有任何腳本」，' +
        '而要請他們提供 scriptId：在腳本編輯器網址列 script.google.com/d/<scriptId>/edit 就看得到，' +
        '或從容器檔案的「擴充功能 → Apps Script → 專案設定」複製。' +
        '拿到 scriptId 後，其他所有工具（讀取、寫入、版本、部署、執行紀錄）對繫結腳本都能正常運作。',
      inputSchema: z.object({
        nameContains: z.string().optional().describe('選填：只列出檔名包含此關鍵字的專案'),
      }),
    },
    safe(async ({ nameContains }: { nameContains?: string }) => {
      const files = await drive.listScriptProjects(nameContains);

      // 空結果幾乎都不是「沒有腳本」，而是腳本全都是容器繫結型——講清楚下一步怎麼做
      if (files.length === 0) {
        const scope = nameContains ? `檔名包含「${nameContains}」的獨立腳本專案` : '獨立腳本專案';
        return text(
          `找不到${scope}。\n\n` +
            '這**不代表你沒有腳本**。綁在試算表／文件／表單／簡報裡的「容器繫結腳本」' +
            '無法透過 Google 雲端硬碟列出，這是 Google 平台的限制。\n\n' +
            '取得繫結腳本 scriptId 的方法（擇一）：\n' +
            '1. 到 https://script.google.com/home/all 點開該專案，網址中 /projects/ 後面那一長串就是 scriptId\n' +
            '2. 打開容器檔案 →「擴充功能 → Apps Script」→ 左側「專案設定」→ 複製指令碼 ID\n\n' +
            '拿到 scriptId 之後，read_file、write_file、list_versions 等工具都能正常使用。\n\n' +
            '若你確定有獨立腳本卻仍列不出來，請確認已在 https://script.google.com/home/usersettings 開啟 Apps Script API。',
        );
      }

      const lines = files.map(
        (file) => `- ${file.name}（最後修改 ${formatGoogleTime(file.modifiedTime)}）— scriptId: ${file.id}`,
      );
      return text(
        `共 ${files.length} 個獨立腳本專案：\n${lines.join('\n')}\n\n` +
          '（註：容器繫結腳本不會出現在這份清單裡，需要另外提供 scriptId。）',
      );
    }),
  );

  server.registerTool(
    'get_project',
    {
      title: '取得專案資訊',
      description: '取得指定腳本專案的中繼資料：標題、建立者、最後修改者與時間，以及是否為容器繫結腳本。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID，可由 list_projects 取得'),
      }),
    },
    safe(async ({ scriptId }: { scriptId: string }) => {
      const project = await script.getProject(scriptId);
      const bound = project.parentId
        ? `繫結於 Drive 檔案 ${project.parentId}（容器繫結腳本）`
        : '獨立腳本（未繫結任何 Drive 檔案）';
      return text(
        [
          `標題：${project.title}`,
          `scriptId：${project.scriptId}`,
          `型態：${bound}`,
          `建立者：${project.creator?.email ?? '—'}`,
          `建立時間：${formatGoogleTime(project.createTime)}`,
          `最後修改：${formatGoogleTime(project.updateTime)}（${project.lastModifyUser?.email ?? '—'}）`,
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'list_files',
    {
      title: '列出專案檔案',
      description:
        '列出指定腳本專案的所有檔案，含型別與行數，但不含原始碼。要看某個檔案的內容請改用 read_file。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
      }),
    },
    safe(async ({ scriptId }: { scriptId: string }) => {
      const files = await script.getContent(scriptId);
      if (files.length === 0) {
        return text('這個專案目前沒有任何檔案。');
      }
      const lines = files.map(
        (file) => `- ${file.name}${extensionOf(file.type)}（${file.type}，${countLines(file.source)} 行）`,
      );
      return text(`共 ${files.length} 個檔案：\n${lines.join('\n')}`);
    }),
  );

  server.registerTool(
    'read_file',
    {
      title: '讀取檔案內容',
      description: '讀取腳本專案中單一檔案的完整原始碼。檔名不含副檔名，例如「Code」而非「Code.gs」。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        fileName: z.string().describe('檔案名稱，不含副檔名；manifest 檔請填 appsscript'),
      }),
    },
    safe(async ({ scriptId, fileName }: { scriptId: string; fileName: string }) => {
      const files = await script.getContent(scriptId);
      const file = files.find((item) => item.name === fileName);
      if (!file) {
        const available = files.map((item) => item.name).join('、');
        return text(`找不到名為「${fileName}」的檔案。這個專案現有的檔案：${available || '（無）'}`);
      }
      return text(`${file.name}${extensionOf(file.type)}（${file.type}）：\n\n${file.source}`);
    }),
  );

  server.registerTool(
    'list_versions',
    {
      title: '列出版本',
      description: '列出腳本專案的所有版本快照。版本是不可變的，可用來當還原點，也是建立部署的依據。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
      }),
    },
    safe(async ({ scriptId }: { scriptId: string }) => {
      const versions = await script.listVersions(scriptId);
      if (versions.length === 0) {
        return text('這個專案還沒有任何版本。');
      }
      const lines = versions.map(
        (version) =>
          `- 版本 ${version.versionNumber}（${formatGoogleTime(version.createTime)}）：${
            version.description || '（無描述）'
          }`,
      );
      return text(`共 ${versions.length} 個版本：\n${lines.join('\n')}`);
    }),
  );

  server.registerTool(
    'list_deployments',
    {
      title: '列出部署',
      description: '列出腳本專案的所有部署，含 deploymentId、對應版本與網頁應用程式網址（若有）。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
      }),
    },
    safe(async ({ scriptId }: { scriptId: string }) => {
      const deployments = await script.listDeployments(scriptId);
      if (deployments.length === 0) {
        return text('這個專案還沒有任何部署。');
      }
      const lines = deployments.map((deployment) => {
        const config = deployment.deploymentConfig;
        const version =
          config?.versionNumber === undefined ? 'HEAD（開發模式）' : `版本 ${config.versionNumber}`;
        const webAppUrl = deployment.entryPoints?.find((entry) => entry.webApp?.url)?.webApp?.url;
        const url = webAppUrl ? `\n  網址：${webAppUrl}` : '';
        return `- ${config?.description || '（無描述）'}｜${version}｜deploymentId: ${
          deployment.deploymentId
        }${url}`;
      });
      return text(`共 ${deployments.length} 個部署：\n${lines.join('\n')}`);
    }),
  );

  server.registerTool(
    'get_metrics',
    {
      title: '取得使用統計',
      description: '取得腳本專案的執行次數、失敗次數與活躍使用者數。適合回答「這支腳本最近跑得順不順」。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        granularity: z
          .enum(['DAILY', 'WEEKLY'])
          .optional()
          .describe('統計粒度，DAILY 或 WEEKLY，預設 DAILY'),
      }),
    },
    safe(async ({ scriptId, granularity }: { scriptId: string; granularity?: 'DAILY' | 'WEEKLY' }) => {
      const metrics = await script.getMetrics(scriptId, granularity ?? 'DAILY');
      const sum = (values?: { value?: string }[]) =>
        (values ?? []).reduce((total, item) => total + Number(item.value ?? 0), 0);

      const total = sum(metrics.totalExecutions);
      const failed = sum(metrics.failedExecutions);
      const users = sum(metrics.activeUsers);

      if (total === 0 && failed === 0 && users === 0) {
        return text('這段期間沒有任何執行紀錄。（Google 只保留最近一段時間的統計資料。）');
      }
      const rate = total > 0 ? `（失敗率 ${((failed / total) * 100).toFixed(1)}%）` : '';
      return text(
        [
          `統計粒度：${granularity ?? 'DAILY'}`,
          `總執行次數：${total}`,
          `失敗次數：${failed}${rate}`,
          `活躍使用者：${users}`,
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'list_executions',
    {
      title: '列出執行紀錄',
      description:
        '列出腳本最近的執行紀錄，含函式名稱、觸發型態、狀態與耗時。是排查「為什麼觸發器沒跑」「哪個函式一直失敗」的主要工具。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
      }),
    },
    safe(async ({ scriptId }: { scriptId: string }) => {
      const processes = await script.listScriptProcesses(scriptId);
      if (processes.length === 0) {
        return text('找不到執行紀錄。可能是這支腳本近期沒有執行過，或紀錄已超出 Google 的保留期限。');
      }
      const lines = processes.map((process) => {
        const duration = process.duration ? `，耗時 ${process.duration}` : '';
        return `- ${process.functionName ?? '（未知函式）'}｜${process.processType ?? '—'}｜${
          process.processStatus ?? '—'
        }｜${formatGoogleTime(process.startTime)}${duration}`;
      });
      const failed = processes.filter((process) => process.processStatus === 'FAILED').length;
      return text(`共 ${processes.length} 筆執行紀錄，其中 ${failed} 筆失敗：\n${lines.join('\n')}`);
    }),
  );
}
