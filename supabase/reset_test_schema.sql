-- ============================================================
-- Reset test Supabase schema
-- ============================================================
-- 測試階段才使用。這會刪除既有 profiles、申請案、審核紀錄與相關 view/trigger。
--
-- 使用方式：
-- 1. 先在 Supabase SQL Editor 執行本檔。
-- 2. 再執行 supabase/schema.sql。
--
-- 注意：這會清掉測試申請資料；正式環境不要執行。
-- ============================================================

drop view if exists public.application_summary;
drop policy if exists "Students can upload own documents"
  on storage.objects;
drop policy if exists "Students can view own documents"
  on storage.objects;
drop policy if exists "Teachers can view all documents"
  on storage.objects;
drop policy if exists "Service role can manage scholarship documents"
  on storage.objects;

do $$
begin
  if to_regclass('public.scholarship_applications') is not null then
    drop trigger if exists log_review_changes_trigger
      on public.scholarship_applications;
    drop trigger if exists set_scholarship_applications_updated_at
      on public.scholarship_applications;
  end if;

  if to_regclass('public.profiles') is not null then
    drop trigger if exists handle_profiles_updated_at
      on public.profiles;
  end if;
end;
$$;

drop table if exists public.review_logs;
drop table if exists public.scholarship_applications;
drop table if exists public.profiles;
