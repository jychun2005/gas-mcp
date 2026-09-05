import { describe, it, expect } from 'vitest';
import { explainGoogleError, USER_SETTINGS_URL } from '../src/errors';

describe('explainGoogleError', () => {
  it('401 提示重新授權', () => {
    expect(explainGoogleError(401, {})).toContain('重新授權');
  });

  it('未開啟 Apps Script API 是最高頻錯誤，訊息要直接給設定頁連結', () => {
    const message = explainGoogleError(403, {
      error: { message: 'User has not enabled the Apps Script API. Enable it by visiting ...' },
    });
    expect(message).toContain(USER_SETTINGS_URL);
  });

  it('Workspace 管理員未核准時指向資訊組', () => {
    expect(explainGoogleError(403, { error: { message: 'admin_policy_enforced' } })).toContain('管理員');
  });

  it('caller does not have permission 列出三個常見原因', () => {
    const message = explainGoogleError(403, {
      error: { message: 'The caller does not have permission' },
    });
    expect(message).toContain(USER_SETTINGS_URL);
    expect(message).toContain('Cloud 專案');
    expect(message).toContain('/setup');
  });

  it('404 建議先用 list_projects 確認 scriptId', () => {
    expect(explainGoogleError(404, {})).toContain('list_projects');
  });

  it('manifest 相關的 400 說明必須有 appsscript 檔案', () => {
    const message = explainGoogleError(400, {
      error: { message: 'The manifest file is missing' },
    });
    expect(message).toContain('appsscript');
  });

  it('429 提示稍後再試', () => {
    expect(explainGoogleError(429, {})).toContain('配額');
  });

  it('未知狀態碼保留原始訊息', () => {
    expect(explainGoogleError(500, { error: { message: 'Internal' } })).toContain('Internal');
  });

  it('沒有訊息內容時不會產生 undefined 字樣', () => {
    expect(explainGoogleError(500, {})).not.toContain('undefined');
  });
});
