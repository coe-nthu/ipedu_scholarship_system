-- ============================================================================
-- 修正：系所審核通過等「審查狀態」變更無法存檔、又跳回「未審核」
-- ----------------------------------------------------------------------------
-- 原因：scholarship_applications 的 BEFORE UPDATE 觸發器（set_updated_at）在
-- review_status 變更時會執行 `new.reviewed_at = now();`，並且 API 在審核時會
-- 寫入 reviewed_by。若正式資料庫尚未建立 reviewed_at / reviewed_by 欄位，
-- 任何審查狀態變更都會在資料庫端丟出錯誤，導致 API 回傳失敗、前端樂觀更新
-- 被還原成「未審核」。（備註修改不觸發 reviewed_at，所以備註仍可存檔——
-- 這正好對應回報的現象。）
--
-- 本腳本補齊兩個稽核欄位，可安全重複執行（add column if not exists）。
-- 在 Supabase SQL Editor 執行一次即可。
-- ============================================================================

alter table public.scholarship_applications
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

comment on column public.scholarship_applications.reviewed_by is '最後審核的教師 auth.users ID';
comment on column public.scholarship_applications.reviewed_at is '最後審核時間';
