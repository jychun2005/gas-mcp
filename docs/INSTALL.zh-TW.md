# GAS MCP 完整安裝教學

這份教學是為**完全沒寫過程式的人**寫的。每一步都有連結可以直接點、有內容可以直接複製。
全程約 20 分鐘，做完一次之後就不用再碰。

如果中途卡住，先看 [疑難排解](TROUBLESHOOTING.zh-TW.md)——那裡列的都是實測時真的卡過的地方。

---

## 開始之前

你需要：

- 一個 Google 帳號（個人或學校的都可以）
- 一個 Cloudflare 帳號（免費方案就夠，[免費註冊](https://dash.cloudflare.com/sign-up)）
- 一個 GitHub 帳號（部署按鈕會用到，[免費註冊](https://github.com/signup)）

---

## 步驟 1：開啟 Apps Script API 存取

**這一步最短，也最常被忘記。**跳過它的話，後面每一個功能都會失敗，
而且 Google 回傳的錯誤訊息不會告訴你原因就在這裡。

1. 開啟 <https://script.google.com/home/usersettings>
2. 把「**Google Apps Script API**」的開關切為「**開啟**」

就這樣。設定通常會即時生效。

> 這個開關是 Google 給使用者的保護機制：預設情況下，
> 任何外部程式都不能碰你的腳本專案，除非你自己打開這個開關。

---

## 步驟 2：部署你的伺服器

1. 回到專案首頁，點「**Deploy to Cloudflare**」按鈕
2. 依畫面授權 GitHub 與 Cloudflare（按鈕會幫你把程式碼複製一份到你自己的 GitHub）
3. 等待部署完成，你會得到一個網址，長得像：

   ```
   https://gas-mcp.你的名字.workers.dev
   ```

**把這個網址記下來**，後面每一步都會用到。以下用「**你的網址**」代稱。

---

## 步驟 3：建立 Google Cloud 專案並啟用 API

1. 開啟 [建立專案](https://console.cloud.google.com/projectcreate)，
   名稱可以填 `gas-mcp`，按「建立」
2. 確認右上角已切換到剛建立的專案
3. 啟用 [**Apps Script API**](https://console.cloud.google.com/apis/library/script.googleapis.com)，按「啟用」
4. 啟用 [**Google Drive API**](https://console.cloud.google.com/apis/library/drive.googleapis.com)，按「啟用」

> **為什麼需要 Drive API？** Apps Script API 沒有提供「列出我的所有腳本專案」的方法，
> 唯一的官方途徑是透過雲端硬碟依檔案類型查詢。本專案只會申請雲端硬碟的
> **唯讀中繼資料**權限——讀得到檔名與 ID，讀不到任何檔案內容。

---

## 步驟 4：設定 OAuth 同意畫面

1. 開啟 [OAuth 同意畫面](https://console.cloud.google.com/auth/branding)
2. User type 選「**外部**」
3. 填好應用程式名稱（例如 `GAS MCP`）與你的 email
4. 在「應用程式首頁」「隱私權政策」「服務條款」三欄分別填入：

   ```
   你的網址/
   你的網址/privacy
   你的網址/terms
   ```

5. 儲存後，到 [目標對象](https://console.cloud.google.com/auth/audience) 頁面，
   按「**發布應用程式**」，把狀態切換為 **In Production（正式版）**

> ### ⚠️ 第 5 點不能跳過
>
> 如果停留在「測試中」狀態，Google 會讓授權**每 7 天失效一次**，
> 你每週都得重新連接一次。
>
> 切換為正式版後，第一次授權時會出現「Google 尚未驗證這個應用程式」的警告畫面。
> 點「**進階 → 繼續前往（不安全）**」即可——這個應用程式就是你自己五分鐘前建立的，
> 沒有第三方參與。

---

## 步驟 5：建立 OAuth 用戶端 ID

1. 開啟 [建立用戶端](https://console.cloud.google.com/auth/clients/create)
2. 應用程式類型選「**網頁應用程式**」
3. 名稱隨意
4. 在「**已授權的重新導向 URI**」點「新增 URI」，貼上：

   ```
   你的網址/oauth/google/callback
   ```

   例如 `https://gas-mcp.kevin.workers.dev/oauth/google/callback`

5. 按「建立」，畫面會顯示**用戶端 ID** 與**用戶端密鑰**

**兩個都複製下來**，下一步要用。密鑰只會完整顯示這一次。

---

## 步驟 6：完成伺服器設定

1. 開啟 `你的網址/setup`
2. 貼上剛才的用戶端 ID 與用戶端密鑰
3. 設定一組**管理密碼**（至少 8 個字元，之後要改設定時會用到）
4. 「進階：遠端執行 GAS 函式」先**保持不勾選**——不確定就別開，
   之後隨時可以回來這一頁打開（詳見文末）
5. 按「完成設定」

> ⚠️ 部署完成後請**盡快完成這一步**。在設定完成前，
> 任何知道這個網址的人都能接管這台伺服器。

---

## 步驟 7：接上你的 AI 助理

把 `你的網址/mcp` 貼進你的 AI 助理：

### Claude（網頁 / 桌面版）

Settings → Connectors → Add custom connector → 貼上網址

### Claude Code

```bash
claude mcp add --transport http gas 你的網址/mcp
```

### Gemini Spark

設定與說明 → Connected Apps →「Custom apps for Spark」→ Add a custom app → 貼上網址

> **Gemini Spark 的帳號限制**：Spark 目前只支援用**個人 Google 帳號**登入。
> 但這不影響你用學校帳號的腳本專案——授權那一步可以另外選帳號。

### ChatGPT

設定 → Developer mode → Connectors → 貼上網址

---

接著會跳出 Google 授權畫面。用**你要管理腳本的那個 Google 帳號**登入，
看到「Google 尚未驗證這個應用程式」時點「進階 → 繼續前往」，同意所有權限即可。

**第一個完成授權的帳號會被綁定為擁有者**，之後其他人即使知道網址也無法存取。

---

## 步驟 8：確認可以用了

對你的 AI 助理說：

> 列出我的 Apps Script 專案

如果回傳了專案清單，就完成了。

如果出現 403 錯誤，八成是**步驟 1 沒做**——回去把開關打開再試一次。

---

## 進階：開啟遠端執行（選用）

`run_function` 讓 AI 直接執行你腳本裡的函式。它預設關閉，因為門檻高、風險也高。

要開啟的話，除了在 `/setup` 勾選之外，還必須滿足三個條件——**缺一就會得到 403**：

### 1. 把腳本部署為 API 可執行檔

在腳本編輯器 → 部署 → 新增部署作業 → 類型選「**API 可執行檔**」→ 部署。
記下取得的**部署 ID**，呼叫 `run_function` 時要用。

### 2. 讓腳本使用同一個 Cloud 專案

在腳本編輯器 → 專案設定 → 「Google Cloud Platform (GCP) 專案」→ 變更專案，
填入你在步驟 3 建立的專案編號。

### 3. 補上腳本需要的 OAuth scope

授權的 token 必須涵蓋腳本用到的每一個權限，這無法自動推導：

1. 在腳本編輯器 → 專案設定 → 勾選「**在編輯器中顯示 appsscript.json 資訊清單檔案**」
2. 打開 `appsscript.json`，找到 `oauthScopes` 陣列
3. 把裡面的每一個網址，逐行貼進 `/setup` 的「腳本需要的額外 OAuth scope」欄位
4. 儲存後，到 AI 助理**移除本連接器再重新連接一次**——新的權限要重新授權才會生效

---

## 之後要改設定怎麼辦

開啟 `你的網址/setup`，用當初設定的管理密碼登入即可修改。

## 想整個移除怎麼辦

1. 到 [Google 帳戶的第三方應用程式頁面](https://myaccount.google.com/permissions) 移除授權
2. 到 Cloudflare Dashboard 刪除這個 Worker
3. （可選）到 <https://script.google.com/home/usersettings> 把 API 開關關掉
