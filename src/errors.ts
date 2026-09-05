interface GoogleErrorBody {
  error?: { status?: string; message?: string };
}

/** Apps Script 後台開啟 API 存取的設定頁，是最高頻錯誤的解法 */
export const USER_SETTINGS_URL = 'https://script.google.com/home/usersettings';

/** 把 Google API 的錯誤翻成看得懂、且知道下一步該做什麼的中文 */
export function explainGoogleError(status: number, body: GoogleErrorBody): string {
  const raw = body?.error?.message ?? '';

  if (status === 401) {
    return '授權已失效，請在 AI 助理的連接器設定中移除這個 app 後重新連接一次以重新授權。';
  }

  if (status === 403) {
    // 目前為止最常見的一種：使用者沒在 Apps Script 後台把 API 打開
    if (/Apps Script API/i.test(raw) && /not enabled|disabled|has not enabled/i.test(raw)) {
      return `你的 Google 帳號尚未開啟 Apps Script API 存取權。請前往 ${USER_SETTINGS_URL} ，把「Google Apps Script API」切換為「開啟」，然後重試（設定通常會即時生效）。`;
    }
    if (raw.includes('access_not_configured') || raw.includes('admin_policy_enforced')) {
      return '你的 Google Workspace 管理員尚未核准這個應用程式。請提供 OAuth client ID 給資訊組，請他們在 Google 管理控制台將它加入允許清單。';
    }
    if (/caller does not have permission/i.test(raw)) {
      return `權限不足。三個常見原因：(1) 尚未在 ${USER_SETTINGS_URL} 開啟 Apps Script API；(2) 執行函式時，本伺服器的 Google Cloud 專案必須與該腳本的 Cloud 專案相同；(3) 授權時未涵蓋腳本本身需要的 scope，可到 /setup 補上。原始訊息：${raw}`;
    }
    return `權限不足：${raw || '無詳細訊息'}`;
  }

  if (status === 404) {
    return '找不到指定的腳本專案、版本或部署。請先用 list_projects 確認 scriptId 是否正確，並確認該專案由目前授權的帳號擁有或已與其共用。';
  }

  if (status === 400) {
    if (/manifest|appsscript/i.test(raw)) {
      return `請求被拒：腳本專案的檔案清單必須包含一個名為 appsscript、型別為 JSON 的 manifest 檔案。原始訊息：${raw}`;
    }
    return `請求參數有誤：${raw || '無詳細訊息'}`;
  }

  if (status === 429) {
    return '呼叫 Google API 太頻繁，已達配額上限。請稍候一分鐘再試。';
  }

  return `Google API 回應錯誤（HTTP ${status}）：${raw || '無詳細訊息'}`;
}
