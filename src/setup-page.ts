import { readConfig, writeConfig, hashPassword, verifyPassword, generateSecret } from './config';
import { FAVICON_LINK } from './logo';
import type { Env } from './types';

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>設定 GAS MCP</title>
${FAVICON_LINK}
<style>
 body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.5rem;line-height:1.75;color:#1a1a1a}
 h1{font-size:1.6rem} h2{font-size:1.15rem;margin-top:2rem}
 code{background:#f2f4f7;padding:.15em .45em;border-radius:.3em;word-break:break-all}
 .copy{display:flex;gap:.5rem;align-items:center;background:#f2f4f7;padding:.75rem;border-radius:.4rem;margin:.5rem 0}
 .copy code{background:none;padding:0;flex:1}
 button{background:#4285f4;color:#fff;border:0;padding:.5rem 1rem;border-radius:.4rem;cursor:pointer;font-size:.95rem}
 input,textarea{width:100%;padding:.6rem;border:1px solid #c4c7c5;border-radius:.4rem;font-size:1rem;box-sizing:border-box;font-family:inherit}
 textarea{min-height:6rem;font-family:ui-monospace,Menlo,monospace;font-size:.85rem}
 label{display:block;margin-top:1rem;font-weight:600}
 .inline{display:flex;gap:.5rem;align-items:flex-start;margin-top:1rem}
 .inline input{width:auto;margin-top:.35rem}
 .inline label{margin-top:0;font-weight:600}
 ol{padding-left:1.3rem} li{margin:.5rem 0}
 .warn{background:#fef7e0;border-left:4px solid #f9ab00;padding:.85rem 1rem;border-radius:.3rem;margin:1.25rem 0}
 .ok{background:#e6f4ea;border-left:4px solid #1e8e3e;padding:.85rem 1rem;border-radius:.3rem;margin:1.25rem 0}
 .danger{background:#fce8e6;border-left:4px solid #d93025;padding:.85rem 1rem;border-radius:.3rem;margin:1.25rem 0}
 .hint{color:#5f6368;font-size:.9rem;margin-top:.35rem}
</style></head><body>${body}
<script>
document.querySelectorAll('[data-copy]').forEach(function(btn){
  btn.addEventListener('click', function(){
    navigator.clipboard.writeText(btn.getAttribute('data-copy'));
    btn.textContent='已複製';
    setTimeout(function(){ btn.textContent='複製'; }, 1500);
  });
});
</script></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

/** escape HTML 特殊字元，避免把使用者輸入直接嵌進頁面 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyRow(value: string): string {
  const safeValue = escapeHtml(value);
  return `<div class="copy"><code>${safeValue}</code><button type="button" data-copy="${safeValue}">複製</button></div>`;
}

/** 遠端執行的說明與輸入欄位，首次設定與後續修改共用 */
function runSection(enableRun: boolean, extraScopes: string[]): string {
  return `
  <h2>進階：遠端執行 GAS 函式（選用）</h2>
  <div class="danger">
    <strong>預設關閉，不確定就別開。</strong>開啟後 AI 助理會多一個 <code>run_function</code> 工具，
    可以直接執行你腳本裡的函式並改動資料。除此之外還有兩個硬性前提，缺一就會得到 403：
    <ol>
      <li>腳本必須在編輯器裡「部署 → 新增部署作業 → <strong>API 可執行檔</strong>」。</li>
      <li>腳本的 Google Cloud 專案必須與<strong>本伺服器使用的同一個</strong>（在腳本編輯器的
          「專案設定 → Google Cloud Platform 專案」切換）。</li>
    </ol>
  </div>
  <div class="inline">
    <input id="enableRun" name="enableRun" type="checkbox" value="1"${enableRun ? ' checked' : ''}>
    <label for="enableRun">啟用 run_function</label>
  </div>
  <label for="extraScopes">腳本需要的額外 OAuth scope（一行一個）</label>
  <textarea id="extraScopes" name="extraScopes" placeholder="https://www.googleapis.com/auth/spreadsheets&#10;https://www.googleapis.com/auth/script.external_request">${escapeHtml(
    extraScopes.join('\n'),
  )}</textarea>
  <p class="hint">
    授權的 token 必須涵蓋目標腳本用到的每一個 scope，這無法自動推導。
    請到腳本編輯器「專案設定 → 勾選『在編輯器顯示 appsscript.json』」，
    把 <code>oauthScopes</code> 裡的網址逐行貼進來。改動後需要重新授權一次才會生效。
  </p>`;
}

export async function handleSetupRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/oauth/google/callback`;
  const config = await readConfig(env);

  if (request.method === 'POST') {
    return handleSetupSubmit(request, env, url, redirectUri);
  }

  if (!config) {
    return page(firstRunForm(redirectUri));
  }

  return page(`
    <h1>設定已完成</h1>
    <div class="ok">這台伺服器已經設定好，綁定帳號：<code>${escapeHtml(config.ownerEmail ?? '尚未授權')}</code></div>
    <h2>把這個網址貼進 AI 助理</h2>
    ${copyRow(`${url.origin}/mcp`)}
    <p>Claude → Settings → Connectors → Add custom connector；
       Gemini → 設定與說明 → Connected Apps → Custom apps for Spark。</p>

    <h2>修改設定</h2>
    <form method="post">
      <input type="hidden" name="action" value="update">
      <label for="password">管理密碼</label>
      <input id="password" name="password" type="password" required>
      <label for="clientId">Google Client ID</label>
      <input id="clientId" name="clientId" required value="${escapeHtml(config.googleClientId)}">
      <label for="clientSecret">Google Client Secret</label>
      <input id="clientSecret" name="clientSecret" type="password" required placeholder="重新輸入以確認">
      ${runSection(config.enableRun === true, config.extraScopes ?? [])}
      <p><button type="submit">更新設定</button></p>
    </form>
  `);
}

function firstRunForm(redirectUri: string): string {
  return `
  <h1>設定 GAS MCP</h1>
  <div class="warn"><strong>請立刻完成這一頁。</strong>在設定完成前，任何知道這個網址的人都能接管這台伺服器。</div>

  <h2>步驟 1：在 Apps Script 後台開啟 API 存取</h2>
  <ol>
    <li>開啟 <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">Apps Script 設定</a>。</li>
    <li>把「Google Apps Script API」切換為 <strong>開啟</strong>。</li>
  </ol>
  <div class="warn"><strong>這一步最常被忽略。</strong>沒開啟的話，之後每個工具呼叫都會回 403，
    而 Google 的原始錯誤訊息不會告訴你原因就在這裡。</div>

  <h2>步驟 2：建立 Google Cloud 專案並啟用 API</h2>
  <ol>
    <li>開啟 <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">建立專案</a>，名稱可填 <code>gas-mcp</code>。</li>
    <li>啟用 <a href="https://console.cloud.google.com/apis/library/script.googleapis.com" target="_blank" rel="noopener">Apps Script API</a>。</li>
    <li>啟用 <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Drive API</a>
        （只用來列出你的腳本專案清單——Apps Script API 本身沒有這個功能）。</li>
  </ol>

  <h2>步驟 3：設定 OAuth 同意畫面</h2>
  <ol>
    <li>開啟 <a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noopener">OAuth 同意畫面</a>，User type 選「外部」，填好應用程式名稱與你的 email。</li>
    <li>完成後到 <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noopener">目標對象</a> 頁面，按 <strong>「發布應用程式」</strong>切換為 <strong>In Production</strong>。</li>
  </ol>
  <div class="warn"><strong>這一步不能跳過。</strong>若停留在「測試中」狀態，Google 會讓授權每 7 天失效一次，你每週都得重新連接。切換為正式版後會出現「Google 尚未驗證這個應用程式」的警告畫面，點「進階 → 繼續前往」即可——因為這個應用程式就是你自己建立的。</div>

  <h2>步驟 4：建立 OAuth 用戶端 ID</h2>
  <ol>
    <li>開啟 <a href="https://console.cloud.google.com/auth/clients/create" target="_blank" rel="noopener">建立用戶端</a>，類型選「網頁應用程式」。</li>
    <li>在「已授權的重新導向 URI」貼上這個網址：</li>
  </ol>
  ${copyRow(redirectUri)}
  <p>建立後會顯示用戶端 ID 與密鑰，複製下來填到下面。</p>

  <h2>步驟 5：填入憑證</h2>
  <form method="post">
    <input type="hidden" name="action" value="create">
    <label for="clientId">Google Client ID</label>
    <input id="clientId" name="clientId" required placeholder="123456789-xxxx.apps.googleusercontent.com">
    <label for="clientSecret">Google Client Secret</label>
    <input id="clientSecret" name="clientSecret" type="password" required placeholder="GOCSPX-...">
    <label for="password">設定一組管理密碼（之後要修改設定時使用）</label>
    <input id="password" name="password" type="password" required minlength="8" placeholder="至少 8 個字元">
    ${runSection(false, [])}
    <p><button type="submit">完成設定</button></p>
  </form>`;
}

/** 把 textarea 的多行輸入切成 scope 陣列，順手去重與去空白 */
function parseScopes(raw: string): string[] {
  const scopes = raw
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  return [...new Set(scopes)];
}

async function handleSetupSubmit(request: Request, env: Env, url: URL, redirectUri: string): Promise<Response> {
  const form = await request.formData();
  const action = String(form.get('action') ?? '');
  const clientId = String(form.get('clientId') ?? '').trim();
  const clientSecret = String(form.get('clientSecret') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const enableRun = form.get('enableRun') === '1';
  const extraScopes = parseScopes(String(form.get('extraScopes') ?? ''));
  const existing = await readConfig(env);

  if (!clientId || !clientSecret) {
    return page('<h1>設定失敗</h1><p>Client ID 與 Client Secret 都必須填寫。<a href="/setup">返回</a></p>', 400);
  }

  if (action === 'create') {
    if (existing) {
      return page('<h1>已經設定過了</h1><p>這台伺服器已完成初次設定。<a href="/setup">返回</a></p>', 409);
    }
    if (password.length < 8) {
      return page('<h1>設定失敗</h1><p>管理密碼至少需要 8 個字元。<a href="/setup">返回</a></p>', 400);
    }
    await writeConfig(env, {
      googleClientId: clientId,
      googleClientSecret: clientSecret,
      stateSecret: generateSecret(),
      adminPasswordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
      enableRun,
      extraScopes,
    });
  } else {
    if (!existing) {
      return page('<h1>尚未設定</h1><p>請先完成初次設定。<a href="/setup">返回</a></p>', 400);
    }
    if (!(await verifyPassword(password, existing.adminPasswordHash))) {
      return page('<h1>密碼錯誤</h1><p>管理密碼不正確。<a href="/setup">返回</a></p>', 403);
    }
    await writeConfig(env, {
      ...existing,
      googleClientId: clientId,
      googleClientSecret: clientSecret,
      enableRun,
      extraScopes,
    });
  }

  const runNotice = enableRun
    ? `<div class="warn">已啟用 <code>run_function</code>。若剛才有新增或修改 scope，
       請到 AI 助理移除本連接器後重新連接一次，讓 Google 重新授權——否則新的 scope 不會生效。</div>`
    : '';

  return page(`
    <h1>設定完成</h1>
    <div class="ok">Google 憑證已儲存，重新導向 URI 為 <code>${escapeHtml(redirectUri)}</code>。</div>
    ${runNotice}
    <h2>最後一步：把這個網址貼進 AI 助理</h2>
    ${copyRow(`${url.origin}/mcp`)}
    <p>貼上網址後依畫面完成 Google 授權即可開始使用。</p>
  `);
}
