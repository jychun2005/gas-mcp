import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import { MANIFEST_NAME, type AppsScriptClient, type FileType, type ScriptFile } from '../google/apps-script';
import { backupVersionDescription } from './datetime';
import { countLines, safe, text } from './shared';

/**
 * 寫入前建立還原點。
 *
 * updateContent 是整包覆蓋，一旦寫壞沒有 undo；versions.create 建立的是不可變快照，
 * 等於免費的還原點。備份失敗就中止寫入——寧可不寫，也不要在沒有退路的情況下覆蓋。
 */
async function createBackup(
  client: AppsScriptClient,
  scriptId: string,
  fileName: string,
): Promise<number> {
  try {
    const version = await client.createVersion(scriptId, backupVersionDescription(fileName));
    return version.versionNumber;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `無法建立備份版本，為了安全起見已中止寫入（原始內容未被更動）。原因：${message}`,
    );
  }
}

interface WriteFileArgs {
  scriptId: string;
  fileName: string;
  source: string;
  type?: FileType;
}

export function registerWriteTools(server: McpServer, client: AppsScriptClient): void {
  server.registerTool(
    'create_project',
    {
      title: '建立腳本專案',
      description:
        '建立一個新的 Apps Script 專案。省略 parentId 時建立獨立腳本；帶入 Google 文件／試算表／表單／簡報的 Drive ID 則建立繫結該檔案的容器腳本。',
      inputSchema: z.object({
        title: z.string().describe('專案標題'),
        parentId: z
          .string()
          .optional()
          .describe('選填：要繫結的 Drive 檔案 ID（Google 文件／試算表／表單／簡報）'),
      }),
    },
    safe(async ({ title, parentId }: { title: string; parentId?: string }) => {
      const project = await client.createProject(title, parentId);
      const bound = parentId ? `，已繫結於 Drive 檔案 ${parentId}` : '（獨立腳本）';
      return text(
        `專案「${project.title}」建立成功${bound}。\nscriptId: ${project.scriptId}\n編輯器：https://script.google.com/d/${project.scriptId}/edit`,
      );
    }),
  );

  server.registerTool(
    'write_file',
    {
      title: '寫入檔案',
      description:
        '在腳本專案中新增或覆寫單一檔案。寫入前會自動建立一個版本作為還原點，其他檔案不受影響。source 請提供該檔案的完整內容（不是差異）。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        fileName: z.string().describe('檔案名稱，不含副檔名，例如「Code」'),
        source: z.string().describe('檔案的完整內容'),
        type: z
          .enum(['SERVER_JS', 'HTML', 'JSON'])
          .optional()
          .describe('檔案型別；新檔案省略時預設 SERVER_JS，既有檔案省略時沿用原型別'),
      }),
    },
    safe(async ({ scriptId, fileName, source, type }: WriteFileArgs) => {
      // 1. 取得目前全部檔案——updateContent 是整包覆蓋，少帶一個就會被刪掉
      const files = await client.getContent(scriptId);
      const index = files.findIndex((file) => file.name === fileName);
      const existing = index >= 0 ? files[index] : undefined;

      if (existing && existing.source === source) {
        return text(`檔案「${fileName}」的內容與現況完全相同，未做任何變更，也未建立備份版本。`);
      }
      if (fileName === MANIFEST_NAME && (type ?? existing?.type) !== 'JSON') {
        return text(`manifest 檔案 ${MANIFEST_NAME} 的型別必須是 JSON。`);
      }

      // 2. 先建還原點，失敗就中止（createBackup 會丟例外）
      const backupVersion = await createBackup(client, scriptId, fileName);

      // 3. 在記憶體中替換或新增
      const next: ScriptFile = {
        name: fileName,
        type: type ?? existing?.type ?? 'SERVER_JS',
        source,
      };
      const merged = [...files];
      if (index >= 0) merged[index] = next;
      else merged.push(next);

      // 4. 整包送回
      await client.updateContent(scriptId, merged);

      // 5. 明確告訴使用者還原點在哪
      const before = existing ? countLines(existing.source) : 0;
      const after = countLines(source);
      const action = existing ? `覆寫（${before} 行 → ${after} 行）` : `新增（${after} 行）`;
      return text(
        `檔案「${fileName}」${action}成功。\n還原點：版本 ${backupVersion}（寫入前自動建立，可用 list_versions 查看）。`,
      );
    }),
  );

  server.registerTool(
    'delete_file',
    {
      title: '刪除檔案',
      description: '從腳本專案中刪除單一檔案。刪除前會自動建立一個版本作為還原點。無法刪除 manifest 檔案。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        fileName: z.string().describe('要刪除的檔案名稱，不含副檔名'),
      }),
    },
    safe(async ({ scriptId, fileName }: { scriptId: string; fileName: string }) => {
      if (fileName === MANIFEST_NAME) {
        return text(
          `不能刪除 ${MANIFEST_NAME}：每個腳本專案都必須有這個 manifest 檔案。若要修改設定，請用 write_file 覆寫它。`,
        );
      }

      const files = await client.getContent(scriptId);
      if (!files.some((file) => file.name === fileName)) {
        const available = files.map((file) => file.name).join('、');
        return text(`找不到名為「${fileName}」的檔案。這個專案現有的檔案：${available || '（無）'}`);
      }

      const backupVersion = await createBackup(client, scriptId, fileName);
      await client.updateContent(
        scriptId,
        files.filter((file) => file.name !== fileName),
      );
      return text(
        `檔案「${fileName}」已刪除。\n還原點：版本 ${backupVersion}（刪除前自動建立，可用 list_versions 查看）。`,
      );
    }),
  );

  server.registerTool(
    'create_version',
    {
      title: '建立版本',
      description: '為腳本專案目前的內容建立一個不可變的版本快照。版本可作為還原點，也是建立部署的依據。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        description: z.string().optional().describe('版本描述，例如「修正日期計算錯誤」'),
      }),
    },
    safe(async ({ scriptId, description }: { scriptId: string; description?: string }) => {
      const version = await client.createVersion(scriptId, description);
      return text(`版本 ${version.versionNumber} 建立成功。${version.description ? `描述：${version.description}` : ''}`);
    }),
  );

  server.registerTool(
    'create_deployment',
    {
      title: '建立部署',
      description:
        '為指定版本建立一個新的部署。省略 versionNumber 時會部署 HEAD（開發模式）。若要部署穩定版本，請先用 create_version 建立版本。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        versionNumber: z.number().optional().describe('要部署的版本號；省略則部署 HEAD（開發模式）'),
        description: z.string().optional().describe('部署描述'),
        manifestFileName: z.string().optional().describe('manifest 檔名，預設 appsscript'),
      }),
    },
    safe(
      async (args: {
        scriptId: string;
        versionNumber?: number;
        description?: string;
        manifestFileName?: string;
      }) => {
        const deployment = await client.createDeployment(args.scriptId, {
          versionNumber: args.versionNumber,
          description: args.description,
          manifestFileName: args.manifestFileName ?? MANIFEST_NAME,
        });
        const webAppUrl = deployment.entryPoints?.find((entry) => entry.webApp?.url)?.webApp?.url;
        const url = webAppUrl ? `\n網頁應用程式網址：${webAppUrl}` : '';
        return text(`部署建立成功。\ndeploymentId: ${deployment.deploymentId}${url}`);
      },
    ),
  );

  server.registerTool(
    'update_deployment',
    {
      title: '更新部署',
      description:
        '把既有部署改指向另一個版本。注意：這會立即改變線上服務的行為，正式部署請先確認版本無誤。',
      inputSchema: z.object({
        scriptId: z.string().describe('腳本專案 ID'),
        deploymentId: z.string().describe('要更新的部署 ID，可由 list_deployments 取得'),
        versionNumber: z.number().describe('要改指向的版本號'),
        description: z.string().optional().describe('部署描述'),
        manifestFileName: z.string().optional().describe('manifest 檔名，預設 appsscript'),
      }),
    },
    safe(
      async (args: {
        scriptId: string;
        deploymentId: string;
        versionNumber: number;
        description?: string;
        manifestFileName?: string;
      }) => {
        const deployment = await client.updateDeployment(args.scriptId, args.deploymentId, {
          versionNumber: args.versionNumber,
          description: args.description,
          manifestFileName: args.manifestFileName ?? MANIFEST_NAME,
        });
        return text(
          `部署 ${deployment.deploymentId} 已更新為版本 ${args.versionNumber}，線上服務即刻生效。`,
        );
      },
    ),
  );
}
