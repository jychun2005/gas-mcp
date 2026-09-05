const TAIPEI_OFFSET_MINUTES = 8 * 60;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 把 UTC 時刻格式化成台北時間（UTC+8）的 `YYYY-MM-DD HH:MM`。
 * Workers 執行環境固定為 UTC，不能依賴本地時區。
 */
export function taipeiTimestamp(now: Date = new Date()): string {
  const t = new Date(now.getTime() + TAIPEI_OFFSET_MINUTES * 60_000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())} ${pad(
    t.getUTCHours(),
  )}:${pad(t.getUTCMinutes())}`;
}

/** 寫入前自動建立的還原點，描述要一眼看得出是誰、何時建的 */
export function backupVersionDescription(fileName: string, now?: Date): string {
  return `GAS MCP 自動備份（寫入 ${fileName} 前）${taipeiTimestamp(now)} 台北時間`;
}

/** 把 Google 回傳的 RFC3339 時間轉成台北時間字串；無值或格式錯誤時回傳 '—' */
export function formatGoogleTime(value?: string): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${taipeiTimestamp(parsed)}`;
}
