# 疑難排解

以下依「實測時真的卡過的頻率」排序。

---

## 1. 任何工具都回 403 / 「權限不足」

**九成是這個原因：Apps Script API 存取沒開。**

開啟 <https://script.google.com/home/usersettings>，
把「Google Apps Script API」切為「**開啟**」，然後重試。

這是 Google 給使用者的保護開關，預設關閉。它跟你在 Google Cloud 主控台
啟用的那個 API 是**兩件不同的事**，兩邊都要做。

本專案在偵測到這個錯誤時，會直接在錯誤訊息裡附上設定頁的連結。

---

## 2. 每 7 天就要重新授權一次

OAuth 同意畫面還停留在「**測試中**」狀態。Google 對測試中的應用程式
會讓 refresh token 每 7 天失效。

到 [目標對象](https://console.cloud.google.com/auth/audience) 頁面，
按「**發布應用程式**」切換為 **In Production**，然後重新連接一次。

---

## 3. 授權時出現「Google 尚未驗證這個應用程式」

**這是正常的，不是錯誤。**

點「**進階** → **繼續前往（不安全）**」即可。這個應用程式就是你自己建立的，
沒有第三方參與；「未驗證」只是表示你沒有付費送 Google 做 OAuth 審查
（那是為了公開給陌生人使用才需要的）。

---

## 4. `list_projects` 找不到任何專案

**最常見的原因不是壞掉，是你的腳本全都是「容器繫結」型。**

綁在試算表／文件／表單／簡報裡的腳本，Google 的雲端硬碟 API **查不到**，
這是平台限制（[官方 issue](https://issuetracker.google.com/issues/170982282)），
不是設定問題。你在 <https://script.google.com/home/all> 看得到 15 個專案，
`list_projects` 卻回 0 筆，就是這個情況——判斷方法是看圖示：
綠色試算表底色加腳本角標的就是繫結腳本，純腳本圖示的才是獨立腳本。

**解法：直接給 scriptId，其餘工具全都能用。**

```
方法一：到 https://script.google.com/home/all 點開專案，
        網址 .../projects/<這一長串>/edit 的那一長串就是 scriptId

方法二：打開容器檔案 → 擴充功能 → Apps Script
        → 左側「專案設定」→ 複製「指令碼 ID」
```

然後跟 AI 說「幫我看 scriptId xxx 這支腳本有哪些檔案」即可。

若你確定有**獨立**腳本卻仍列不出來，再依序檢查：

1. **Apps Script API 開關**（見第 1 點）
2. **Google Drive API 是否已啟用**——
   [到這裡](https://console.cloud.google.com/apis/library/drive.googleapis.com) 確認
3. **授權的是不是正確的 Google 帳號**——
   到 [第三方應用程式頁面](https://myaccount.google.com/permissions) 看是哪個帳號授權了

---

## 5. `write_file` 說「無法建立備份版本，已中止寫入」

這是**刻意的安全行為**，不是 bug。`updateContent` 是整包覆蓋、沒有 undo，
所以本專案在寫入前一定要先建立一個版本作為還原點；建不出還原點就不寫。

常見原因是版本數量或 API 配額達到上限。等一分鐘再試；
若持續發生，到腳本編輯器手動建立一個版本，確認 Google 端沒有其他問題。

**你的原始程式碼在這種情況下完全沒有被更動。**

---

## 6. 檔案被 AI 改壞了，要怎麼還原

每次 `write_file` 與 `delete_file` 都會自動建立版本還原點，
回覆訊息裡會告訴你是第幾號版本。

問 AI：「列出這個專案的版本」（`list_versions`），
找到描述為「GAS MCP 自動備份」的那一個，
到腳本編輯器的「專案記錄 / 版本」把它還原即可。

---

## 7. `run_function` 回 403「caller does not have permission」

`run_function` 有三個硬性前提，缺一就會 403：

1. 腳本必須部署為「**API 可執行檔**」
2. 腳本的 **Google Cloud 專案**必須與本伺服器使用的同一個
3. 授權 token 必須涵蓋腳本 `appsscript.json` 裡宣告的**每一個** scope

第 3 點最常漏。做法見 [安裝教學的「進階：開啟遠端執行」](INSTALL.zh-TW.md#進階開啟遠端執行選用)。

修改 scope 之後，**必須到 AI 助理移除連接器再重新連接一次**——
新的權限要重新走一次 Google 授權才會生效。

---

## 8. AI 助理裡看不到 `run_function`

這個工具預設不註冊。到 `你的網址/setup` 用管理密碼登入，
勾選「啟用 run_function」再儲存。

---

## 9. 「這台伺服器不屬於你」

每一份部署只綁定**第一個完成授權的 Google 帳號**。
如果你當初用錯帳號授權了，最快的做法是刪掉這個 Worker 重新部署一次。

---

## 10. 「授權請求無效」

MCP client 送來的授權請求缺少必要參數。
到 AI 助理把這個連接器**移除後重新加入一次**即可。

---

## 11. 忘記管理密碼

沒有救回的辦法（密碼以 SHA-256 儲存，無法還原）。
到 Cloudflare Dashboard 把 `CONFIG_KV` 裡的 `config` 這個 key 刪掉，
`/setup` 就會回到首次設定狀態。注意這也會清掉擁有者綁定。

---

## 還是不行

到 Cloudflare Dashboard → Workers → 你的 Worker → Logs，
即時日誌會顯示實際的錯誤內容。本專案已開啟 observability。
