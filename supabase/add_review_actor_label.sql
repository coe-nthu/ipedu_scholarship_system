-- ============================================================================
-- 讓「文件真實性審核」的稽核軌跡能追出是誰改的
-- ----------------------------------------------------------------------------
-- 背景：系辦大多使用 dashboard_accounts 帳密登入，這種 session 沒有
-- auth.users ID（lib/auth.ts 回傳 userId: null），所以 reviewed_by 與
-- review_logs.reviewer_id 永遠是 null，事後完全查不出是誰把狀態改回「未審核」。
--
-- 本腳本補上一個純文字的操作者標籤，密碼登入與 Google 登入都能記錄。
-- 可安全重複執行。在 Supabase SQL Editor 執行一次即可。
-- ============================================================================

alter table public.scholarship_applications
  add column if not exists reviewed_by_label text;

alter table public.review_logs
  add column if not exists actor_label text;

comment on column public.scholarship_applications.reviewed_by_label is
  '最後審核者的顯示名稱／帳號，密碼登入的後台帳號也能記錄';
comment on column public.review_logs.actor_label is
  '操作者顯示名稱／帳號（reviewer_id 為 null 時的備援）';

-- 重建 trigger function，把 actor label 一併寫進審計軌跡。
create or replace function public.log_review_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 記錄審核狀態變更
  if new.review_status is distinct from old.review_status then
    insert into public.review_logs (
      application_id, reviewer_id, actor_label, action, old_value, new_value
    )
    values (
      new.id, new.reviewed_by, new.reviewed_by_label,
      'status_change', old.review_status, new.review_status
    );
  end if;

  -- 記錄備註變更
  if new.reviewer_remarks is distinct from old.reviewer_remarks then
    insert into public.review_logs (
      application_id, reviewer_id, actor_label, action, old_value, new_value
    )
    values (
      new.id, new.reviewed_by, new.reviewed_by_label,
      'remark_update', old.reviewer_remarks, new.reviewer_remarks
    );
  end if;

  return new;
end;
$$;

drop trigger if exists log_review_changes_trigger
  on public.scholarship_applications;
create trigger log_review_changes_trigger
  after update on public.scholarship_applications
  for each row
  execute function public.log_review_changes();
