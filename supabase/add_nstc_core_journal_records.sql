-- ============================================================
-- 國科會人社中心核心期刊名單 (nstc_core_journal_records)
-- 在 Supabase SQL Editor 執行一次即可。
-- 用途：DOI 自動帶入時比對期刊名稱（中/英），命中即為「I級期刊」並帶入
--       國科會資料庫別（TSSCI / THCI / THCI、TSSCI）。
-- ============================================================

create table if not exists public.nstc_core_journal_records (
  id uuid primary key default gen_random_uuid(),
  journal_title_zh text,
  journal_title_en text,
  discipline text,                 -- 學門
  database text not null,          -- TSSCI / THCI / THCI、TSSCI
  tier text,                       -- 第一級 / 第二級
  source_file_name text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.nstc_core_journal_records is '院辦上傳的國科會人社中心核心期刊名單（TSSCI/THCI）';

create index if not exists idx_nstc_core_title_en
  on public.nstc_core_journal_records(lower(journal_title_en));
create index if not exists idx_nstc_core_title_zh
  on public.nstc_core_journal_records(lower(journal_title_zh));
create index if not exists idx_nstc_core_created_at
  on public.nstc_core_journal_records(created_at desc);

drop trigger if exists handle_nstc_core_journal_records_updated_at
  on public.nstc_core_journal_records;
create trigger handle_nstc_core_journal_records_updated_at
  before update on public.nstc_core_journal_records
  for each row
  execute function moddatetime(updated_at);

alter table public.nstc_core_journal_records enable row level security;

drop policy if exists "Service role can manage nstc core journal records"
  on public.nstc_core_journal_records;
create policy "Service role can manage nstc core journal records"
  on public.nstc_core_journal_records for all
  to service_role
  using (true)
  with check (true);
