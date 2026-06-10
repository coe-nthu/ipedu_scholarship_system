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

create table if not exists public.dashboard_accounts (
  username text primary key,
  display_name text not null,
  password_hash text not null,
  role text not null,
  department_scope jsonb not null default '"all"'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.dashboard_accounts
  add column if not exists display_name text,
  add column if not exists password_hash text,
  add column if not exists role text,
  add column if not exists department_scope jsonb not null default '"all"'::jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.dashboard_accounts
  alter column display_name set not null,
  alter column password_hash set not null,
  alter column role set not null,
  alter column department_scope set not null,
  alter column department_scope set default '"all"'::jsonb,
  alter column is_active set not null,
  alter column is_active set default true,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now(),
  drop constraint if exists dashboard_accounts_role_check,
  add constraint dashboard_accounts_role_check
    check (role in ('teacher', 'admin'));

comment on table public.dashboard_accounts is '後台固定帳密登入帳號';
comment on column public.dashboard_accounts.password_hash is '後台帳密登入密碼雜湊，格式 sha256:<hex>';
comment on column public.dashboard_accounts.department_scope is '後台可檢視系所範圍，JSON 字串 "all" 或字串陣列';

drop trigger if exists handle_dashboard_accounts_updated_at on public.dashboard_accounts;
create trigger handle_dashboard_accounts_updated_at
  before update on public.dashboard_accounts
  for each row
  execute function moddatetime(updated_at);

alter table public.dashboard_accounts enable row level security;

drop policy if exists "Service role can manage dashboard accounts" on public.dashboard_accounts;
create policy "Service role can manage dashboard accounts"
  on public.dashboard_accounts for all
  to service_role
  using (true)
  with check (true);

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
-- 2. scholarship_program_settings
-- ============================================================

create table if not exists public.scholarship_program_settings (
  program_key text primary key,
  route_path text not null,
  title text not null,
  description text not null,
  period text not null,
  amount text not null,
  status_label text not null,
  eligibility_reminder text not null,
  is_visible boolean not null default true,
  is_open boolean not null default true,
  display_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scholarship_program_settings
  add column if not exists route_path text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists period text,
  add column if not exists amount text,
  add column if not exists status_label text,
  add column if not exists eligibility_reminder text,
  add column if not exists is_visible boolean not null default true,
  add column if not exists is_open boolean not null default true,
  add column if not exists display_order integer not null default 0,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.scholarship_program_settings
  drop constraint if exists scholarship_program_settings_program_key_check,
  add constraint scholarship_program_settings_program_key_check
    check (program_key in ('nstc-doctoral', 'nstc-research-grant', 'presidential-new-student', 'moe-doctoral', 'full-time-doctoral-grant'));

insert into public.scholarship_program_settings (
  program_key,
  route_path,
  title,
  description,
  period,
  amount,
  status_label,
  eligibility_reminder,
  is_visible,
  is_open,
  display_order
)
values
  (
    'nstc-doctoral',
    '/scholarships/nstc-doctoral',
    '國科會-培育優秀博士生獎學金',
    '填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。',
    '適用 111-112 學年度學生申請',
    '每月 4 萬元，至多 4 學年',
    '已開放',
    '學士班排名前 20%、碩士班累計 GPA 3.76/4.3 或百分制 85 分以上，或有特殊表現經指導教授及院系所推薦。指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。',
    true,
    true,
    10
  ),
  (
    'nstc-research-grant',
    '/scholarships/nstc-research-grant',
    '國科會-博士生研究獎助學金(適用114學年度入學新生)',
    '填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。',
    '適用 114 學年度入學新生',
    '每月 4 萬元，至多 3 學年',
    '測試中',
    '本項目適用 114 學年度入學新生。頁面樣式先沿用既有獎學金申請表，欄位與指定文件後續可依正式公告再調整。',
    true,
    true,
    20
  ),
  (
    'presidential-new-student',
    '/scholarships/presidential-new-student',
    '校長獎學金 (新生獎學金)',
    '填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。',
    '新生獎學金',
    '每月 4 萬元，至多 4 學年',
    '測試中',
    '本項目為校長獎學金新生獎學金。頁面樣式先沿用既有獎學金申請表，欄位與指定文件後續可依正式公告再調整。',
    true,
    true,
    30
  ),
  (
    'moe-doctoral',
    '/scholarships/moe-doctoral',
    '教育部-博士生獎學金(適用114學年度博士班1至3年級學生)',
    '先沿用既有申請表樣式，提供博士班學生填寫資料與文件上傳。',
    '適用 114 學年度博士班 1 至 3 年級學生',
    '每月 4 萬元，至多 3 學年',
    '測試中',
    '本項目適用 114 學年度博士班 1 至 3 年級學生。頁面樣式先沿用既有獎學金申請表，欄位與指定文件後續可依正式公告再調整。',
    true,
    true,
    40
  ),
  (
    'full-time-doctoral-grant',
    '/scholarships/full-time-doctoral-grant',
    '全時博士生助學金',
    '填寫基本資料、申請類型、兼職情形調查與指定文件上傳。',
    '適用本院全時博士生',
    '實際核發金額及核發月數由學院審查委員會核定',
    '測試中',
    '限全時無專職就讀本院之博士生申請，以一至四年級為原則。通過申請後如有休學或專職情形，應主動通知院辦公室。',
    true,
    true,
    50
  )
on conflict (program_key) do nothing;

alter table public.scholarship_program_settings
  alter column route_path set not null,
  alter column title set not null,
  alter column description set not null,
  alter column period set not null,
  alter column amount set not null,
  alter column status_label set not null,
  alter column eligibility_reminder set not null,
  alter column is_visible set not null,
  alter column is_visible set default true,
  alter column is_open set not null,
  alter column is_open set default true,
  alter column display_order set not null,
  alter column display_order set default 0,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now(),
  drop constraint if exists scholarship_program_settings_program_key_check,
  add constraint scholarship_program_settings_program_key_check
    check (program_key in ('nstc-doctoral', 'nstc-research-grant', 'presidential-new-student', 'moe-doctoral', 'full-time-doctoral-grant')),
  drop constraint if exists scholarship_program_settings_display_order_check,
  add constraint scholarship_program_settings_display_order_check
    check (display_order between 0 and 9999);

comment on table public.scholarship_program_settings is '獎學金前台與表單顯示設定';

drop trigger if exists handle_scholarship_program_settings_updated_at
  on public.scholarship_program_settings;
create trigger handle_scholarship_program_settings_updated_at
  before update on public.scholarship_program_settings
  for each row
  execute function moddatetime(updated_at);

alter table public.scholarship_program_settings enable row level security;

drop policy if exists "Anyone can view scholarship program settings"
  on public.scholarship_program_settings;
create policy "Anyone can view scholarship program settings"
  on public.scholarship_program_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can update scholarship program settings"
  on public.scholarship_program_settings;
create policy "Admins can update scholarship program settings"
  on public.scholarship_program_settings for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    )
  );

drop policy if exists "Service role can manage scholarship program settings"
  on public.scholarship_program_settings;
create policy "Service role can manage scholarship program settings"
  on public.scholarship_program_settings for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 3. journal_index_records
-- ============================================================

create table if not exists public.journal_index_records (
  id uuid primary key default gen_random_uuid(),
  journal_title text not null,
  issn text,
  eissn text,
  category text,
  edition text not null,
  jif text,
  jci text,
  quartile text,
  jcr_year integer,
  source_file_name text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_index_records
  add column if not exists journal_title text,
  add column if not exists issn text,
  add column if not exists eissn text,
  add column if not exists category text,
  add column if not exists edition text,
  add column if not exists jif text,
  add column if not exists jci text,
  add column if not exists quartile text,
  add column if not exists jcr_year integer,
  add column if not exists source_file_name text,
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.journal_index_records
set
  journal_title = coalesce(journal_title, ''),
  edition = coalesce(edition, '')
where journal_title is null
  or edition is null;

alter table public.journal_index_records
  alter column journal_title set not null,
  alter column edition set not null,
  alter column created_at set not null,
  alter column created_at set default now(),
  alter column updated_at set not null,
  alter column updated_at set default now();

comment on table public.journal_index_records is '院辦上傳的 JCR JournalResults 期刊索引';
comment on column public.journal_index_records.edition is 'JCR Edition，例如 SSCI、SCIE、ESCI、AHCI';

create index if not exists idx_journal_index_records_title
  on public.journal_index_records(lower(journal_title));
create index if not exists idx_journal_index_records_issn
  on public.journal_index_records(issn);
create index if not exists idx_journal_index_records_eissn
  on public.journal_index_records(eissn);
create index if not exists idx_journal_index_records_created_at
  on public.journal_index_records(created_at desc);

drop trigger if exists handle_journal_index_records_updated_at
  on public.journal_index_records;
create trigger handle_journal_index_records_updated_at
  before update on public.journal_index_records
  for each row
  execute function moddatetime(updated_at);

alter table public.journal_index_records enable row level security;

drop policy if exists "Service role can manage journal index records"
  on public.journal_index_records;
create policy "Service role can manage journal index records"
  on public.journal_index_records for all
  to service_role
  using (true)
  with check (true);

-- ============================================================
-- 4. scholarship_applications
-- ============================================================

create table if not exists public.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  program_key text not null default 'nstc-doctoral',
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
  review_status text not null default '未審核',
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
  add column if not exists program_key text,
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
  when 'auto_verified' then '未審核'
  when 'pending_manual' then '未審核'
  when 'manual_verified' then '系所審核通過'
  when 'data_error' then '未審核'
  else '未審核'
end;

update public.scholarship_applications
set review_status = '未審核'
where review_status is null
  or review_status not in ('未審核', '系所審核通過', '院辦審核通過');

update public.scholarship_applications
set submission_status = 'draft'
where submission_status is null
  or submission_status not in ('draft', 'submitted');

update public.scholarship_applications
set program_key = case scholarship_program
  when '國科會-博士生研究獎助學金(適用114學年度入學新生)' then 'nstc-research-grant'
  when '校長獎學金 (新生獎學金)' then 'presidential-new-student'
  when '教育部-博士生獎學金(適用114學年度博士班1至3年級學生)' then 'moe-doctoral'
  when '全時博士生助學金' then 'full-time-doctoral-grant'
  else 'nstc-doctoral'
end
where program_key is null
  or program_key not in ('nstc-doctoral', 'nstc-research-grant', 'presidential-new-student', 'moe-doctoral', 'full-time-doctoral-grant');

alter table public.scholarship_applications
  drop constraint if exists unique_user_per_program,
  drop constraint if exists unique_user_per_program_key,
  drop constraint if exists scholarship_applications_program_key_check,
  alter column scholarship_program set not null,
  alter column program_key set not null,
  alter column program_key set default 'nstc-doctoral',
  alter column applicant_name set not null,
  alter column department set not null,
  alter column submission_status set not null,
  alter column submission_status set default 'draft',
  alter column review_status set not null,
  alter column review_status set default '未審核',
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
    check (review_status in ('未審核', '系所審核通過', '院辦審核通過')),
  add constraint scholarship_applications_program_key_check
    check (program_key in ('nstc-doctoral', 'nstc-research-grant', 'presidential-new-student', 'moe-doctoral', 'full-time-doctoral-grant')),
  add constraint unique_user_per_program_key unique (user_id, program_key);

comment on table public.scholarship_applications is '獎學金申請案';
comment on column public.scholarship_applications.user_id is '申請人的 auth.users ID';
comment on column public.scholarship_applications.program_key is '穩定獎學金代碼，用於改名後維持草稿與申請案關聯';
comment on column public.scholarship_applications.submission_status is '學生填寫狀態：draft=草稿, submitted=已送出';
comment on column public.scholarship_applications.review_status is '文獻真實性審查狀態：未審核、系所審核通過、院辦審核通過';
comment on column public.scholarship_applications.reviewer_remarks is '審查教師備註';
comment on column public.scholarship_applications.reviewed_by is '最後審核的教師 auth.users ID';
comment on column public.scholarship_applications.reviewed_at is '最後審核時間';
comment on column public.scholarship_applications.payload is '完整表單 JSON 資料';
comment on column public.scholarship_applications.files is '上傳檔案 metadata JSON 陣列';

create index if not exists idx_applications_user_id
  on public.scholarship_applications(user_id);
create index if not exists idx_applications_program_key
  on public.scholarship_applications(program_key);
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
-- 4. review_logs
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
-- 5. Storage setup
-- ============================================================
-- Supabase documents the `storage` schema as Storage-managed metadata.
-- This migration intentionally does not insert/update/delete rows or alter/drop
-- tables in `storage.*`. It only manages app-owned RLS policies, which Supabase
-- supports for Storage access control.
--
-- Create the bucket outside SQL via Supabase Dashboard or Storage API:
--   id/name: scholarship-documents
--   public: false
--   file size limit: 104857600 bytes (100 MB)
--   allowed MIME types: application/pdf
--
-- File writes use server-issued signed upload URLs.
-- Supabase Storage still checks storage.objects INSERT policies when creating
-- the object row, so authenticated users may only upload files under their own
-- application id folder.

drop policy if exists "Students can upload own documents"
  on storage.objects;
create policy "Students can upload own documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'scholarship-documents'
    and lower(right(name, 4)) = '.pdf'
    and exists (
      select 1
      from public.scholarship_applications a
      where a.id::text = (storage.foldername(name))[1]
        and a.user_id = auth.uid()
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
      where a.id::text = (storage.foldername(name))[1]
        and a.user_id = auth.uid()
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
-- 6. View and helper functions
-- ============================================================

create or replace view public.application_summary as
select
  a.id,
  a.user_id,
  a.program_key,
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
grant select on public.scholarship_program_settings to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.scholarship_applications to authenticated;
grant select on public.review_logs to authenticated;
grant select on public.application_summary to authenticated;
grant execute on function public.get_journals(uuid) to authenticated;
grant execute on function public.get_conferences(uuid) to authenticated;

commit;
