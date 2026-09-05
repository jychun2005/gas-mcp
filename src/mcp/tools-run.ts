import * as z from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { AppsScriptClient, RunResult } from '../google/apps-script';
import { safe, text } from './shared';

/**
 * scripts.run 失敗時 HTTP 仍為 200，錯誤包在 body.error 裡，
 * 所以不能只看 status code，必須另外解析。
 */
function describeRunError(result: RunResult): string {
  const detail = result.error?.details?.[0];
  if (!detail) return '執行失敗，但 Google 沒有回傳詳細錯誤內容。';

  const stack = (detail.scriptStackTraceElements ?? [])
    .map((frame) => `  在 ${frame.function ?? '（匿名）'}${frame.lineNumber ? `：第 ${frame.lineNumber} 行` : ''}`)
    .join('\n');

  return [
    `執行失敗（${detail.errorType ?? '未知錯誤類型'}）：${detail.errorMessage ?? '無訊息'}`,
    stack ? `呼叫堆疊：\n${stack}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 僅在 config.enableRun 為 true 時註冊。
 *
 * scripts.run 的門檻高於其他所有方法：呼叫端的 Google Cloud 專案必須與腳本相同、
 * 腳本必須另外部署成「API 可執行檔」，且 access token 必須涵蓋腳本 manifest 裡
 * 宣告的每一個 scope。任何一項不成立都會得到 403。
 */
export function registerRunTools(server: McpServer, client: AppsScriptClient): void {
  server.registerTool(
    'run_function',
    {
      title: '執行腳本函式',
      description:
        '遠端執行腳本中的一個函式並取回結果。腳本必須已部署為「API 可執行檔」，且本伺服器的 Google Cloud 專案需與腳本相同。參數只支援基本型別（字串、數字、布林、陣列、物件）。這會實際執行程式碼並可能改動資料，執行前請先向使用者確認。',
      inputSchema: z.object({
        deploymentId: z
          .string()
          .describe('部署 ID，從腳本編輯器的「部署 → 管理部署作業」取得；部分情況下 scriptId 亦可'),
        functionName: z.string().describe('要執行的函式名稱，不含括號，例如 myFunction'),
        parameters: z.array(z.unknown()).optional().describe('傳給函式的參數陣列，只支援基本型別'),
        devMode: z
          .boolean()
          .optional()
          .describe('設為 true 時執行最新儲存的版本（需為腳本擁有者），預設 false'),
      }),
    },
    safe(
      async (args: {
        deploymentId: string;
        functionName: string;
        parameters?: unknown[];
        devMode?: boolean;
      }) => {
        const result = await client.run(args.deploymentId, {
          function: args.functionName,
          parameters: args.parameters,
          devMode: args.devMode,
        });

        if (result.error) {
          return text(describeRunError(result));
        }

        const value = result.response?.result;
        if (value === undefined) {
          return text(`函式 ${args.functionName} 執行完成，沒有回傳值。`);
        }
        const rendered = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return text(`函式 ${args.functionName} 執行完成，回傳：\n${rendered}`);
      },
    ),
  );
}
