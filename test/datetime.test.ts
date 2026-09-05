import { describe, it, expect } from 'vitest';
import { backupVersionDescription, formatGoogleTime, taipeiTimestamp } from '../src/mcp/datetime';

describe('taipeiTimestamp', () => {
  it('把 UTC 加上 8 小時', () => {
    expect(taipeiTimestamp(new Date('2026-08-21T01:30:00Z'))).toBe('2026-08-21 09:30');
  });

  it('跨日換算正確', () => {
    expect(taipeiTimestamp(new Date('2026-08-21T20:00:00Z'))).toBe('2026-08-22 04:00');
  });

  it('個位數月日時分都補零', () => {
    expect(taipeiTimestamp(new Date('2026-01-02T00:05:00Z'))).toBe('2026-01-02 08:05');
  });
});

describe('backupVersionDescription', () => {
  it('描述含檔名與台北時間，一眼看得出是自動備份', () => {
    const description = backupVersionDescription('Code', new Date('2026-08-21T01:30:00Z'));
    expect(description).toContain('GAS MCP 自動備份');
    expect(description).toContain('Code');
    expect(description).toContain('2026-08-21 09:30');
  });
});

describe('formatGoogleTime', () => {
  it('RFC3339 轉成台北時間', () => {
    expect(formatGoogleTime('2026-08-21T01:30:00Z')).toBe('2026-08-21 09:30');
  });

  it('無值時回傳破折號而非 undefined', () => {
    expect(formatGoogleTime()).toBe('—');
  });

  it('無法解析時原樣回傳，不假裝成有效時間', () => {
    expect(formatGoogleTime('not-a-date')).toBe('not-a-date');
  });
});
