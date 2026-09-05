/**
 * 隱私權政策與服務條款頁面。
 *
 * Google 在把 OAuth 應用程式發布為正式版時會要求提供這兩個連結，
 * 並且會實際抓取驗證，所以必須由本 Worker 自己提供、內容也必須誠實描述行為。
 */

import { FAVICON_LINK } from './logo';

function legalPage(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — GAS MCP</title>
${FAVICON_LINK}
<style>
 body{font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;max-width:44rem;margin:3rem auto;padding:0 1.5rem;line-height:1.8;color:#1a1a1a}
 h1{font-size:1.6rem} h2{font-size:1.1rem;margin-top:2rem}
 code{background:#f2f4f7;padding:.15em .45em;border-radius:.3em;word-break:break-all}
 ul{padding-left:1.3rem} li{margin:.4rem 0}
 a{color:#4285f4}
 .meta{color:#5f6368;font-size:.9rem}
 table{border-collapse:collapse;width:100%;margin:1rem 0}
 th,td{border:1px solid #dadce0;padding:.5rem .7rem;text-align:left;font-size:.95rem}
 th{background:#f8f9fa}
</style></head><body>${body}
<p class="meta"><a href="/">回到首頁</a></p>
</body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

export function privacyPolicyPage(origin: string): Response {
  return legalPage(
    '隱私權政策',
    `<h1>隱私權政策</h1>
<p class="meta">最後更新：2026 年 8 月</p>

<h2>這是什麼服務</h2>
<p>GAS MCP 是一個自行部署的開源工具，讓 AI 助理（如 Claude、Gemini Spark）
透過 Model Context Protocol 存取你自己的 Google Apps Script 專案。
這個服務執行在 <code>${origin}</code>，由部署它的人自行管理，
不是由任何公司營運的商業服務。</p>

<h2>會存取哪些資料</h2>
<p>在你明確授權後，本服務會以你的身分呼叫 Google API，讀取或修改下列資料：</p>
<table>
<tr><th>權限範圍</th><th>用途</th></tr>
<tr><td>script.projects</td><td>建立專案、讀取與寫入腳本檔案內容、建立版本</td></tr>
<tr><td>script.deployments</td><td>讀取、建立與更新部署</td></tr>
<tr><td>script.metrics</td><td>讀取執行次數與失敗次數等使用統計</td></tr>
<tr><td>script.processes</td><td>讀取執行紀錄，用於排查失敗原因</td></tr>
<tr><td>drive.metadata.readonly</td><td><strong>僅用於列出你的腳本專案清單</strong>（見下方說明）</td></tr>
</table>

<h2>關於 Google 雲端硬碟權限</h2>
<p>Apps Script API 本身沒有提供「列出我的所有腳本專案」的方法，
唯一的官方途徑是透過 Google 雲端硬碟依檔案類型查詢。因此本服務申請了
<code>drive.metadata.readonly</code>——這是能達成此目的的最小權限範圍：
<strong>只讀得到檔案名稱與 ID，讀不到任何檔案的內容</strong>，
也無法建立、修改或刪除雲端硬碟中的任何檔案。</p>

<h2>關於遠端執行</h2>
<p>本服務的「執行腳本函式」功能<strong>預設為關閉</strong>。
只有在部署者於設定頁面主動開啟，並自行提供腳本所需的額外權限範圍後，
AI 助理才能遠端執行腳本中的函式。這些額外權限範圍完全由部署者決定與揭露。</p>

<h2>資料如何被儲存</h2>
<ul>
<li><strong>腳本內容不會被儲存。</strong>程式碼、版本、部署等資料在每次請求時
即時向 Google 取得，處理完就丟棄，不寫入任何資料庫或記錄檔。</li>
<li><strong>只有你的 Google 授權憑證會被保存</strong>（refresh token），
它以加密形式存放在部署者自己的 Cloudflare Workers KV 儲存空間中，
用途僅限於在你下次提問時代表你呼叫 Google API。</li>
<li>本服務不使用 Cookie 進行追蹤，也不做任何分析或行為記錄。</li>
</ul>

<h2>資料會傳給誰</h2>
<p>資料只在三方之間流動：你的 AI 助理、這台伺服器、以及 Google 的 API。
本服務<strong>不會</strong>將你的資料販售、分享或傳送給任何第三方，
也不會用於訓練任何 AI 模型。</p>
<p>請注意：你向 AI 助理提問時，查詢結果（含程式碼內容）會顯示在該助理的對話中，
因此也適用該助理自身的隱私權政策（例如 Anthropic Claude 或 Google Gemini 的政策）。</p>

<h2>誰可以使用這個部署</h2>
<p>每一份部署只綁定第一個完成授權的 Google 帳號。
其他人即使知道這個網址，也無法透過它存取你的腳本專案。</p>

<h2>如何撤銷授權</h2>
<p>你可以隨時到 <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google 帳戶的第三方應用程式頁面</a>
移除本應用程式的存取權，或到 <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener">Apps Script 設定</a>
關閉 API 存取。撤銷後，儲存的憑證即立刻失效。
若要一併清除伺服器上的資料，直接刪除這個 Cloudflare Worker 即可。</p>

<h2>Google API 服務使用者資料政策</h2>
<p>本應用程式使用 Google API 所取得的資訊，其使用與轉移均遵循
<a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener">Google API 服務使用者資料政策</a>，
包括其中的「限制使用」規定。</p>

<h2>聯絡方式</h2>
<p>本服務由部署者個人管理。如有疑問，請聯絡當初提供這個網址給你的人。</p>`,
  );
}

export function termsOfServicePage(origin: string): Response {
  return legalPage(
    '服務條款',
    `<h1>服務條款</h1>
<p class="meta">最後更新：2026 年 8 月</p>

<h2>關於本服務</h2>
<p>GAS MCP 是一個開源、自行部署的個人工具，執行在 <code>${origin}</code>。
它讓 AI 助理透過 Model Context Protocol 存取你自己的 Google Apps Script 專案。
本服務免費提供，不涉及任何付費或訂閱。</p>

<h2>使用條件</h2>
<ul>
<li>你必須是所存取腳本專案的合法擁有者或協作者。</li>
<li>你必須遵守 <a href="https://www.google.com/policies/terms/" target="_blank" rel="noopener">Google 服務條款</a>
與 Google Apps Script 的相關規定。</li>
<li>你不得利用本服務存取未經授權的他人資料。</li>
<li>你應對透過本服務所寫入的程式碼與所建立的部署負責。</li>
</ul>

<h2>免責聲明</h2>
<p>本服務以「現狀」提供，不提供任何明示或默示的擔保，
包括但不限於適售性、特定用途適用性或不侵權的擔保。</p>
<p><strong>本服務會由 AI 代為修改程式碼，AI 可能會誤解你的指示。</strong>
每次寫入或刪除檔案前自動建立版本還原點，即是為此設計的安全措施，
但仍請你在部署到正式環境前自行檢視程式碼。若你開啟了遠端執行功能，
AI 將能實際執行你的腳本並改動資料，風險由你自行承擔。
對於因使用本服務而導致的任何程式碼錯誤、資料遺失或服務中斷，
部署者與原始碼作者不承擔責任。</p>

<h2>服務可用性</h2>
<p>本服務由個人自行部署，不保證持續可用，可能隨時中止或變更而不另行通知。</p>

<h2>終止</h2>
<p>你可以隨時停止使用本服務，方法是撤銷 Google 授權或刪除該 Worker 部署。</p>

<h2>商標聲明</h2>
<p>本專案為獨立開發的開源工具，與 Google 沒有隸屬或背書關係。
本服務的圖示為原創設計，未使用任何第三方商標。
Google Apps Script、Google 雲端硬碟為 Google LLC 的商標；
Claude 是 Anthropic PBC 的商標。</p>

<h2>條款變更</h2>
<p>本條款可能隨原始碼更新而修改，修改後的版本自公布於本頁面時生效。</p>`,
  );
}
