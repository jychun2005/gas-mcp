/** 工具回傳值的共用組裝與錯誤包裝，供 tools-read / tools-write / tools-run 共用 */

export function text(body: string) {
  return { content: [{ type: 'text' as const, text: body }] };
}

export function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/** 把工具 callback 包起來，統一把例外轉成 isError 結果 */
export function safe<T>(handler: (args: T) => Promise<ReturnType<typeof text>>) {
  return async (args: T) => {
    try {
      return await handler(args);
    } catch (error) {
      return errorText(error);
    }
  };
}

export function countLines(source: string): number {
  if (source === '') return 0;
  return source.split('\n').length;
}
