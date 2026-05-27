# Supabase 串接設定

這個專案目前由 Next.js Route Handler 在伺服器端寫入 Supabase。前端送出表單到 `/api/scholarships`，後端再用 Supabase REST API 寫入 `scholarship_applications`。附件由後端簽發上傳授權後，以 Supabase signed upload URL 上傳到 Storage bucket `scholarship-documents`。

## 1. 建立資料表與 Storage

到 Supabase Dashboard 的 SQL Editor，執行：

```sql
-- 開啟 supabase/schema.sql，整份貼上後執行
```

如果 Supabase 專案已經有舊 schema 或既有申請資料，請優先執行：

```sql
-- 開啟 supabase/sync_to_repo_schema.sql，整份貼上後執行
```

`sync_to_repo_schema.sql` 不會刪除申請資料，會把舊欄位 `status` 遷移成目前 repo 使用的 `submission_status`，並把英文審核狀態轉成 dashboard 使用的中文狀態。

如果目前只是測試階段，測試資料可以清掉，請先執行：

```sql
-- 開啟 supabase/reset_test_schema.sql，整份貼上後執行
```

接著再執行 `supabase/schema.sql`。這樣會先刪掉舊表，避免出現 `relation "profiles" already exists`。

這會建立：

- `public.scholarship_applications`
- service role 專用 RLS policies

Storage bucket 請在 Supabase Dashboard 或 Storage API 建立，不要由 SQL migration 修改 `storage.*`：

- bucket id/name: `scholarship-documents`
- public: `false`
- file size limit: `104857600` bytes（100 MB）
- allowed MIME types: `application/pdf`

## 2. 設定環境變數

在專案根目錄建立 `.env.local`：

```bash
SUPABASE_URL=https://rqbeqgpnwvufrcvjmtje.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role secret key

# 目前後端串接不需要 public key；若之後要做前端 Supabase client 再啟用。
NEXT_PUBLIC_SUPABASE_URL=https://rqbeqgpnwvufrcvjmtje.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TUYFQeR6YRZZuhjsdsh_nA_cJFLDGGH

# Resend 寄送申請確認信
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL="IPEDU Scholarship <onboarding@resend.dev>"

# Dashboard 固定帳密登入
DASHBOARD_SESSION_SECRET=請使用至少32字元的隨機字串
DASHBOARD_ACCOUNTS_JSON='{"college":{"displayName":"學院端","role":"admin","scope":"all","passwordHash":"sha256:..."},"edtech":{"displayName":"教育與學習科技學系","role":"teacher","scope":["教育與學習科技學系","教育與學習科技系","教科系"],"passwordHash":"sha256:..."}}'
```

`SUPABASE_SERVICE_ROLE_KEY` 請到 Supabase Dashboard 的 Project Settings > API 取得。這個 key 只能放在伺服器環境變數，不要寫進前端元件，也不要 commit。

`RESEND_API_KEY` 請到 Resend Dashboard 建立。測試時可先用 Resend 提供的 `onboarding@resend.dev`；正式寄件請先在 Resend 驗證自己的網域，再把 `RESEND_FROM_EMAIL` 改成該網域的寄件地址。

Dashboard 固定帳密的密碼不要以明文放進環境變數。先設定同一組 `DASHBOARD_SESSION_SECRET`，再執行：

```bash
pnpm dashboard:hash-password <密碼>
```

把輸出的 `sha256:...` 放入 `DASHBOARD_ACCOUNTS_JSON` 對應帳號的 `passwordHash`。

若要一次產生學院端與各系所的初始密碼、session secret、以及完整 `DASHBOARD_ACCOUNTS_JSON`，可執行：

```bash
pnpm dashboard:generate-accounts
```

執行結果中的 `Initial passwords` 只提供給各單位登入使用，不要 commit 到 repo。

## 3. 啟動專案

```bash
pnpm dev
```

送出表單後：

- 申請資料會寫入 `public.scholarship_applications.payload`
- 常用欄位如姓名、系所、GPA 會另外寫入資料表欄位方便查詢
- 檔案會以 signed upload URL 上傳到 `scholarship-documents/<application-id>/...`
- 檔案格式限制為 `.pdf`
- Storage object name 由系統產生 UUID，例如 `<application-id>/transcript/<uuid>.pdf`
- 原始檔名會保留在 `scholarship_applications.files[].name`
- 檔案資訊會存入 `scholarship_applications.files`
- 正式送出後會透過 Resend 寄送申請確認信給申請人 Email；儲存草稿不寄信。
- 本 repo 不會用 SQL migration 修改 `storage.*` metadata rows 或 table schema；只管理 app-owned Storage RLS policies。
- Storage signed upload URL 仍需要 `storage.objects` 的 insert policy 允許建立 object row。

如果遠端 Supabase 已經套過舊版 Storage policies，且你確定要清掉舊 policy，可執行：

```sql
-- 開啟 supabase/drop_storage_policies.sql，整份貼上後執行
```

若 Storage API 回傳 `The database schema is invalid or incompatible`，請先在 SQL Editor 執行：

```sql
-- 開啟 supabase/check_storage_schema.sql，整份貼上後執行
```

若檢查結果顯示 `storage.objects.bucket_id` 或 `storage.objects.name` 允許 NULL，代表 Supabase 管理的 Storage schema 可能已不相容。優先聯絡 Supabase support 或建立新 Supabase 專案遷移資料；不要直接修改 `storage` schema。

## 4. Direct connection string 何時使用

`postgresql://postgres:[YOUR-PASSWORD]@db.rqbeqgpnwvufrcvjmtje.supabase.co:5432/postgres` 適合給 migration tool 或資料庫管理工具使用，不適合放到前端，也不建議讓瀏覽器直接連線。

這個專案目前不需要 direct connection string，因為 route handler 使用 `SUPABASE_URL` 加 `SUPABASE_SERVICE_ROLE_KEY` 透過 REST API 連線。
