-- ============================================================
-- Sync Supabase database to the current repo schema
-- ============================================================
-- Use this when the remote Supabase database still has the older SQL Editor
-- schema with `status` and English review_status values.
--
-- This script is intentionally non-destructive for application data:
-- - It does not drop application/profile/review tables.
-- - It migrates `status` to `submission_status`.
-- - It converts English review_status values to the Chinese values used by
--   the current app/dashboard.
-- - It recreates views, triggers, policies, indexes, bucket settings, and
--   helper functions to match the repo design.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- ============================================================

begin;

create extension if not exists pgcrypto;
create extension if not exists moddatetime;

drop view if exists public.application_summary;

-- ============================================================
-- 1. profiles
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text not null default 'student',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.profiles
set role = 'student'
where role is null
  or role not in ('student', 'teacher', 'admin');

alter table public.profiles
  alter column role set not null,
  alter column role set default 'student',
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now(),
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check
    check (role in ('student', 'teacher', 'admin'));

comment on table public.profiles is '使用者角色與基本資料';
comment on column public.profiles.role is 'student=學生, teacher=教師, admin=管理者';

drop trigger if exists handle_profiles_updated_at on public.profiles;
create trigger handle_profiles_updated_at
  before update on public.profiles
  for each row
  execute function moddatetime(updated_at);

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
      select 1
      from public.profiles p
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
    email = excluded.email,
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
-- 2. scholarship_applications
-- ============================================================

create table if not exists public.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  scholarship_program text not null,
  applicant_name text not null,
  student_id text,
  department text not null,
  email text,
  phone text,
  advisor_name text,
  admission_academic_year text,
  application_type text,
  gpa numeric(4, 2),
  gpa_scale numeric(3, 1),
  submission_status text not null default 'draft',
  review_status text not null default '等待人工審核',
  reviewer_remarks text not null default '',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  files jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scholarship_applications
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists scholarship_program text,
  add column if not exists applicant_name text,
  add column if not exists student_id text,
  add column if not exists department text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists advisor_name text,
  add column if not exists admission_academic_year text,
  add column if not exists application_type text,
  add column if not exists gpa numeric(4, 2),
  add column if not exists gpa_scale numeric(3, 1),
  add column if not exists submission_status text not null default 'draft',
  add column if not exists review_status text not null default '等待人工審核',
  add column if not exists reviewer_remarks text not null default '',
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists files jsonb not null default '[]'::jsonb,
  add column if not exists submitted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.scholarship_applications
  drop constraint if exists scholarship_applications_status_check,
  drop constraint if exists scholarship_applications_submission_status_check,
  drop constraint if exists scholarship_applications_review_status_check;

drop index if exists public.idx_applications_status;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scholarship_applications'
      and column_name = 'status'
  ) then
    execute '
      update public.scholarship_applications
      set submission_status = status
      where status in (''draft'', ''submitted'')
    ';
    alter table public.scholarship_applications drop column status;
  end if;
end;
$$;

update public.scholarship_applications
set review_status = case review_status
  when 'auto_verified' then '自動審核完成'
  when 'pending_manual' then '等待人工審核'
  when 'manual_verified' then '人工審核完成'
  when 'data_error' then '資料錯誤'
  else review_status
end;

update public.scholarship_applications
set review_status = '等待人工審核'
where review_status is null
  or review_status not in ('自動審核完成', '等待人工審核', '人工審核完成', '資料錯誤');

update public.scholarship_applications
set submission_status = 'draft'
where submission_status is null
  or submission_status not in ('draft', 'submitted');

alter table public.scholarship_applications
  alter column scholarship_program set not null,
  alter column applicant_name set not null,
  alter column department set not null,
  alter column submission_status set not null,
  alter column submission_status set default 'draft',
  alter column review_status set not null,
  alter column review_status set default '等待人工審核',
  alter column reviewer_remarks set not null,
  alter column reviewer_remarks set default '',
  alter column payload set not null,
  alter column payload set default '{}'::jsonb,
  alter column files set not null,
  alter column files set default '[]'::jsonb,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now(),
  add constraint scholarship_applications_submission_status_check
    check (submission_status in ('draft', 'submitted')),
  add constraint scholarship_applications_review_status_check
    check (review_status in ('自動審核完成', '等待人工審核', '人工審核完成', '資料錯誤'));

comment on table public.scholarship_applications is '獎學金申請案';
comment on column public.scholarship_applications.user_id is '申請人的 auth.users ID';
comment on column public.scholarship_applications.submission_status is '學生填寫狀態：draft=草稿, submitted=已送出';
comment on column public.scholarship_applications.review_status is '文獻真實性審查狀態：自動審核完成、等待人工審核、人工審核完成、資料錯誤';
comment on column public.scholarship_applications.reviewer_remarks is '審查教師備註';
comment on column public.scholarship_applications.reviewed_by is '最後審核的教師 auth.users ID';
comment on column public.scholarship_applications.reviewed_at is '最後審核時間';
comment on column public.scholarship_applications.payload is '完整表單 JSON 資料';
comment on column public.scholarship_applications.files is '上傳檔案 metadata JSON 陣列';

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();

  if new.submission_status = 'submitted' then
    if tg_op = 'INSERT' or old.submission_status is distinct from 'submitted' then
      new.submitted_at = coalesce(new.submitted_at, now());
    end if;
  end if;

  if tg_op = 'UPDATE' and new.review_status is distinct from old.review_status then
    new.reviewed_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists set_scholarship_applications_updated_at
  on public.scholarship_applications;
create trigger set_scholarship_applications_updated_at
  before insert or update on public.scholarship_applications
  for each row
  execute function public.set_updated_at();

alter table public.scholarship_applications enable row level security;

drop policy if exists "Students can view own applications" on public.scholarship_applications;
create policy "Students can view own applications"
  on public.scholarship_applications for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Students can insert own applications" on public.scholarship_applications;
create policy "Students can insert own applications"
  on public.scholarship_applications for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Students can update own draft applications" on public.scholarship_applications;
create policy "Students can update own draft applications"
  on public.scholarship_applications for update
  to authenticated
  using (user_id = auth.uid() and submission_status = 'draft')
  with check (user_id = auth.uid());

drop policy if exists "Teachers can view submitted applications" on public.scholarship_applications;
create policy "Teachers can view submitted applications"
  on public.scholarship_applications for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

drop policy if exists "Teachers can review applications" on public.scholarship_applications;
create policy "Teachers can review applications"
  on public.scholarship_applications for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

drop policy if exists "Service role can manage scholarship applications"
  on public.scholarship_applications;
create policy "Service role can manage scholarship applications"
  on public.scholarship_applications for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 3. review_logs
-- ============================================================

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.scholarship_applications(id) on delete cascade,
  reviewer_id uuid references auth.users(id) on delete set null,
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.review_logs
  add column if not exists application_id uuid references public.scholarship_applications(id) on delete cascade,
  add column if not exists reviewer_id uuid references auth.users(id) on delete set null,
  add column if not exists action text,
  add column if not exists old_value text,
  add column if not exists new_value text,
  add column if not exists created_at timestamptz not null default now();

alter table public.review_logs
  alter column application_id set not null,
  alter column action set not null,
  alter column created_at set not null,
  alter column created_at set default now();

comment on table public.review_logs is '審核操作紀錄（審計軌跡）';
comment on column public.review_logs.action is '操作類型：status_change=審核狀態變更, remark_update=備註修改';

create index if not exists idx_review_logs_application_id
  on public.review_logs(application_id);
create index if not exists idx_review_logs_created_at
  on public.review_logs(created_at desc);

alter table public.review_logs enable row level security;

drop policy if exists "Teachers can view review logs" on public.review_logs;
create policy "Teachers can view review logs"
  on public.review_logs for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
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

create or replace function public.log_review_changes()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.review_status is distinct from old.review_status then
    insert into public.review_logs (application_id, reviewer_id, action, old_value, new_value)
    values (new.id, new.reviewed_by, 'status_change', old.review_status, new.review_status);
  end if;

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
-- 4. Storage bucket and policies
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scholarship-documents',
  'scholarship-documents',
  false,
  104857600,
  array[
    'application/pdf'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Service role can manage scholarship documents"
  on storage.objects;
create policy "Service role can manage scholarship documents"
  on storage.objects for all
  to service_role
  using (bucket_id = 'scholarship-documents')
  with check (bucket_id = 'scholarship-documents');

drop policy if exists "Students can upload own documents"
  on storage.objects;
create policy "Students can upload own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'scholarship-documents'
    and exists (
      select 1
      from public.scholarship_applications a
      where a.user_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Students can view own documents"
  on storage.objects;
create policy "Students can view own documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'scholarship-documents'
    and exists (
      select 1
      from public.scholarship_applications a
      where a.user_id = auth.uid()
        and a.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "Teachers can view all documents"
  on storage.objects;
create policy "Teachers can view all documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'scholarship-documents'
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher', 'admin')
    )
  );

-- ============================================================
-- 5. View and helper functions
-- ============================================================

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
  a.payload -> 'applicantInfo' ->> 'studyStatus' as study_status,
  a.payload -> 'applicantInfo' ->> 'applicationType' as application_type,
  a.payload -> 'academicPerformance' ->> 'completedCredits' as completed_credits,
  a.payload -> 'academicPerformance' ->> 'classRankPercent' as class_rank_percent,
  coalesce(jsonb_array_length(a.payload -> 'journals'), 0) as journal_count,
  coalesce(jsonb_array_length(a.payload -> 'conferences'), 0) as conference_count,
  coalesce(jsonb_array_length(a.files), 0) as file_count,
  p.full_name as reviewer_name
from public.scholarship_applications a
left join public.profiles p on p.id = a.reviewed_by;

comment on view public.application_summary is '教師 Dashboard 用的申請案摘要，包含從 payload 提取的常用欄位';

create or replace function public.get_journals(app_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(payload -> 'journals', '[]'::jsonb)
  from public.scholarship_applications
  where id = app_id;
$$;

create or replace function public.get_conferences(app_id uuid)
returns jsonb
language sql
stable
as $$
  select coalesce(payload -> 'conferences', '[]'::jsonb)
  from public.scholarship_applications
  where id = app_id;
$$;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.scholarship_applications to authenticated;
grant select on public.review_logs to authenticated;
grant select on public.application_summary to authenticated;
grant execute on function public.get_journals(uuid) to authenticated;
grant execute on function public.get_conferences(uuid) to authenticated;

commit;
