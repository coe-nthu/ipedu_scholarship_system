# Supabase 串接設定

這個專案目前由 Next.js Route Handler 在伺服器端寫入 Supabase。前端送出表單到 `/api/scholarships`，後端再用 Supabase REST API 寫入 `scholarship_applications`，並把附件上傳到 Storage bucket `scholarship-documents`。

## 1. 建立資料表與 Storage

到 Supabase Dashboard 的 SQL Editor，執行：

```sql
-- 開啟 supabase/schema.sql，整份貼上後執行
```

這會建立：

- `public.scholarship_applications`
- Storage bucket `scholarship-documents`
- service role 專用 RLS policies

## 2. 設定環境變數

在專案根目錄建立 `.env.local`：

```bash
SUPABASE_URL=https://rqbeqgpnwvufrcvjmtje.supabase.co
SUPABASE_SERVICE_ROLE_KEY=你的 service_role secret key

# 目前後端串接不需要 public key；若之後要做前端 Supabase client 再啟用。
NEXT_PUBLIC_SUPABASE_URL=https://rqbeqgpnwvufrcvjmtje.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TUYFQeR6YRZZuhjsdsh_nA_cJFLDGGH
```

`SUPABASE_SERVICE_ROLE_KEY` 請到 Supabase Dashboard 的 Project Settings > API 取得。這個 key 只能放在伺服器環境變數，不要寫進前端元件，也不要 commit。

## 3. 啟動專案

```bash
pnpm dev
```

送出表單後：

- 申請資料會寫入 `public.scholarship_applications.payload`
- 常用欄位如姓名、系所、GPA 會另外寫入資料表欄位方便查詢
- 檔案會上傳到 `scholarship-documents/<application-id>/...`
- 檔案資訊會存入 `scholarship_applications.files`

## 4. Direct connection string 何時使用

`postgresql://postgres:[YOUR-PASSWORD]@db.rqbeqgpnwvufrcvjmtje.supabase.co:5432/postgres` 適合給 migration tool 或資料庫管理工具使用，不適合放到前端，也不建議讓瀏覽器直接連線。

這個專案目前不需要 direct connection string，因為 route handler 使用 `SUPABASE_URL` 加 `SUPABASE_SERVICE_ROLE_KEY` 透過 REST API 連線。
