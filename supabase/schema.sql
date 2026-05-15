-- ============================================================
-- Supabase schema — 國科會-培育優秀博士生獎學金申請系統
-- ============================================================
-- 使用方式：到 Supabase Dashboard → SQL Editor，整份貼上執行。
-- 此 schema 為冪等設計（idempotent），可安全重複執行。
--
-- 環境變數（設在 .env.local 和 Vercel）：
--   SUPABASE_URL=https://<project-ref>.supabase.co
--   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
--   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
--   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
-- ============================================================

-- 啟用必要的 extensions
create extension if not exists pgcrypto;
create extension if not exists moddatetime;  -- 用於自動更新 updated_at

-- ============================================================
-- 0. 清除舊表（開發階段用，正式環境請移除此段）
-- ============================================================
drop view if exists public.application_summary;
drop trigger if exists log_review_changes_trigger on public.scholarship_applications;
drop trigger if exists set_scholarship_applications_updated_at on public.scholarship_applications;
drop table if exists public.review_logs;
drop table if exists public.scholarship_applications;
drop table if exists public.profiles;

-- ============================================================
-- 1. 使用者角色表 (profiles)
-- ============================================================
-- 每個透過 Google OAuth 登入的使用者會自動建立 profile。
-- role 欄位區分學生、教師、管理者的權限。

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'student'
                check (role in ('student', 'teacher', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table  public.profiles is '使用者角色與基本資料';
comment on column public.profiles.role is 'student=學生, teacher=教師, admin=管理者';

-- 自動更新 updated_at
drop trigger if exists handle_profiles_updated_at on public.profiles;
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row
  execute function moddatetime(updated_at);

-- RLS
alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "Teachers and admins can view all profiles" on public.profiles;
create policy "Teachers and admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

drop policy if exists "Service role can manage profiles" on public.profiles;
create policy "Service role can manage profiles"
  on public.profiles for all
  to service_role
  using (true)
  with check (true);

-- ── 新使用者自動建立 profile（Auth trigger）──

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do update
  set
    email     = excluded.email,
    full_name = excluded.full_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================
-- 2. 獎學金申請表 (scholarship_applications)
-- ============================================================

create table public.scholarship_applications (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid references auth.users(id) on delete set null,
  scholarship_program      text not null,
  applicant_name           text not null,
  student_id               text,
  department               text not null,
  email                    text,
  phone                    text,
  advisor_name             text,
  admission_academic_year  text,
  application_type         text,
  gpa                      numeric(4, 2),
  gpa_scale                numeric(3, 1),
  submission_status        text not null default 'draft'
                             check (submission_status in ('draft', 'submitted')),
  review_status            text not null default '等待人工審核'
                             check (review_status in (
                               '自動審核完成',
                               '等待人工審核',
                               '人工審核完成',
                               '資料錯誤'
                             )),
  reviewer_remarks         text not null default '',
  reviewed_by              uuid references auth.users(id) on delete set null,
  reviewed_at              timestamptz,
  payload                  jsonb not null default '{}'::jsonb,
  files                    jsonb not null default '[]'::jsonb,
  submitted_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table  public.scholarship_applications is '獎學金申請案';
comment on column public.scholarship_applications.user_id is '申請人的 auth.users ID';
comment on column public.scholarship_applications.submission_status is '學生填寫狀態：draft=草稿, submitted=已送出';
comment on column public.scholarship_applications.review_status is '文獻真實性審查狀態：自動審核完成、等待人工審核、人工審核完成、資料錯誤';
comment on column public.scholarship_applications.reviewer_remarks is '審查教師備註';
comment on column public.scholarship_applications.reviewed_by is '最後審核的教師 auth.users ID';
comment on column public.scholarship_applications.reviewed_at is '最後審核時間';
comment on column public.scholarship_applications.payload is '完整表單 JSON 資料';
comment on column public.scholarship_applications.files is '上傳檔案 metadata JSON 陣列';

-- 索引：常用查詢欄位
create index if not exists idx_applications_user_id
  on public.scholarship_applications(user_id);
create index if not exists idx_applications_submission_status
  on public.scholarship_applications(submission_status);
create index if not exists idx_applications_review_status
  on public.scholarship_applications(review_status);
create index if not exists idx_applications_department
  on public.scholarship_applications(department);
create index if not exists idx_applications_submitted_at
  on public.scholarship_applications(submitted_at desc);

-- ── Triggers ──

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  -- 學生填寫狀態變為 submitted 時自動記錄送出時間
  if new.submission_status = 'submitted' and old.submission_status is distinct from 'submitted' then
    new.submitted_at = now();
  end if;
  -- 審核狀態變更時自動記錄審核時間
  if new.review_status is distinct from old.review_status then
    new.reviewed_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_scholarship_applications_updated_at
  on public.scholarship_applications;
create trigger set_scholarship_applications_updated_at
  before update on public.scholarship_applications
  for each row
  execute function public.set_updated_at();

-- ── RLS ──

alter table public.scholarship_applications enable row level security;

-- 學生：只能看到自己的申請
drop policy if exists "Students can view own applications" on public.scholarship_applications;
create policy "Students can view own applications"
  on public.scholarship_applications for select
  to authenticated
  using (user_id = auth.uid());

-- 學生：只能新增自己的申請
drop policy if exists "Students can insert own applications" on public.scholarship_applications;
create policy "Students can insert own applications"
  on public.scholarship_applications for insert
  to authenticated
  with check (user_id = auth.uid());

-- 學生：只能修改自己的草稿（已送出不可修改）
drop policy if exists "Students can update own draft applications" on public.scholarship_applications;
create policy "Students can update own draft applications"
  on public.scholarship_applications for update
  to authenticated
  using (user_id = auth.uid() and submission_status = 'draft')
  with check (user_id = auth.uid());

-- 教師/管理者：可以檢視所有已送出的申請
drop policy if exists "Teachers can view submitted applications" on public.scholarship_applications;
create policy "Teachers can view submitted applications"
  on public.scholarship_applications for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

-- 教師/管理者：可以更新審核相關欄位（review_status、reviewer_remarks）
drop policy if exists "Teachers can review applications" on public.scholarship_applications;
create policy "Teachers can review applications"
  on public.scholarship_applications for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

-- Service role：完整存取（API route 使用）
drop policy if exists "Service role can manage scholarship applications"
  on public.scholarship_applications;
create policy "Service role can manage scholarship applications"
  on public.scholarship_applications for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 3. 審核紀錄表 (review_logs) — 審計軌跡
-- ============================================================
-- 每次教師修改 review_status 或 reviewer_remarks 時自動記錄。

create table public.review_logs (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.scholarship_applications(id) on delete cascade,
  reviewer_id     uuid references auth.users(id) on delete set null,
  action          text not null,   -- 'status_change', 'remark_update'
  old_value       text,
  new_value       text,
  created_at      timestamptz not null default now()
);

comment on table  public.review_logs is '審核操作紀錄（審計軌跡）';
comment on column public.review_logs.action is '操作類型：status_change=審核狀態變更, remark_update=備註修改';

create index if not exists idx_review_logs_application_id
  on public.review_logs(application_id);
create index if not exists idx_review_logs_created_at
  on public.review_logs(created_at desc);

-- RLS
alter table public.review_logs enable row level security;

drop policy if exists "Teachers can view review logs" on public.review_logs;
create policy "Teachers can view review logs"
  on public.review_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

drop policy if exists "Service role can manage review logs" on public.review_logs;
create policy "Service role can manage review logs"
  on public.review_logs for all
  to service_role
  using (true)
  with check (true);

-- ── 自動記錄審核變更的 trigger ──

create or replace function public.log_review_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 記錄審核狀態變更
  if new.review_status is distinct from old.review_status then
    insert into public.review_logs (application_id, reviewer_id, action, old_value, new_value)
    values (new.id, new.reviewed_by, 'status_change', old.review_status, new.review_status);
  end if;

  -- 記錄備註變更
  if new.reviewer_remarks is distinct from old.reviewer_remarks then
    insert into public.review_logs (application_id, reviewer_id, action, old_value, new_value)
    values (new.id, new.reviewed_by, 'remark_update', old.reviewer_remarks, new.reviewer_remarks);
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

-- ============================================================
-- 4. Storage bucket — 獎學金申請文件
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scholarship-documents',
  'scholarship-documents',
  false,
  20971520,  -- 20 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'image/jpeg',
    'image/png'
  ]
)
on conflict (id) do update
set
  public            = excluded.public,
  file_size_limit   = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage RLS ──

-- Service role：完整存取
drop policy if exists "Service role can manage scholarship documents"
  on storage.objects;
create policy "Service role can manage scholarship documents"
  on storage.objects for all
  to service_role
  using (bucket_id = 'scholarship-documents')
  with check (bucket_id = 'scholarship-documents');

-- 學生：只能上傳到自己申請案的目錄
drop policy if exists "Students can upload own documents"
  on storage.objects;
create policy "Students can upload own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'scholarship-documents'
    and exists (
      select 1 from public.scholarship_applications a
      where a.user_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

-- 學生：只能讀取自己申請案的檔案
drop policy if exists "Students can view own documents"
  on storage.objects;
create policy "Students can view own documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'scholarship-documents'
    and exists (
      select 1 from public.scholarship_applications a
      where a.user_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

-- 教師/管理者：可以讀取所有申請案的檔案
drop policy if exists "Teachers can view all documents"
  on storage.objects;
create policy "Teachers can view all documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'scholarship-documents'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

-- ============================================================
-- 5. 常用 Views（方便查詢）
-- ============================================================

-- 教師 Dashboard 用的申請案摘要 view
create or replace view public.application_summary as
select
  a.id,
  a.user_id,
  a.applicant_name,
  a.student_id,
  a.department,
  a.advisor_name,
  a.gpa,
  a.gpa_scale,
  a.submission_status,
  a.review_status,
  a.reviewer_remarks,
  a.submitted_at,
  a.created_at,
  -- 從 payload 提取常用欄位
  a.payload -> 'applicantInfo' ->> 'studyStatus'          as study_status,
  a.payload -> 'applicantInfo' ->> 'applicationType'      as application_type,
  a.payload -> 'academicPerformance' ->> 'completedCredits' as completed_credits,
  a.payload -> 'academicPerformance' ->> 'classRankPercent'  as class_rank_percent,
  -- 期刊/研討會統計
  coalesce(jsonb_array_length(a.payload -> 'journals'), 0)     as journal_count,
  coalesce(jsonb_array_length(a.payload -> 'conferences'), 0)  as conference_count,
  -- 檔案數量
  coalesce(jsonb_array_length(a.files), 0) as file_count,
  -- 審查教師資訊
  p.full_name as reviewer_name
from public.scholarship_applications a
left join public.profiles p on p.id = a.reviewed_by;

comment on view public.application_summary is '教師 Dashboard 用的申請案摘要，包含從 payload 提取的常用欄位';

-- ============================================================
-- 6. Helper Functions
-- ============================================================

-- 取得指定申請案的期刊列表
create or replace function public.get_journals(app_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(payload -> 'journals', '[]'::jsonb)
  from public.scholarship_applications
  where id = app_id;
$$;

-- 取得指定申請案的研討會列表
create or replace function public.get_conferences(app_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(payload -> 'conferences', '[]'::jsonb)
  from public.scholarship_applications
  where id = app_id;
$$;

-- ============================================================
-- 完成
-- ============================================================
-- 執行完畢後，請確認：
-- 1. profiles 表已建立 → 新用戶登入時會自動建立 profile
-- 2. scholarship_applications 表已更新 → 含 review_status、reviewer_remarks 等新欄位
-- 3. review_logs 表已建立 → 審核操作會自動記錄
-- 4. Storage bucket 已建立 → scholarship-documents
-- 5. 所有 RLS policies 已啟用
--
-- 設定教師帳號（用 SQL Editor 執行）：
--   update public.profiles
--   set role = 'teacher'
--   where email = '教師的Google信箱';
--
-- 設定管理者帳號：
--   update public.profiles
--   set role = 'admin'
--   where email = '管理者的Google信箱';
