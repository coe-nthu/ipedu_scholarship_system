-- Supabase schema for 國科會-培育優秀博士生獎學金申請表單.
-- Run this in Supabase SQL Editor, then set:
-- SUPABASE_URL=https://<project-ref>.supabase.co
-- SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

create extension if not exists pgcrypto;

create table if not exists public.scholarship_applications (
  id uuid primary key default gen_random_uuid(),
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
  status text not null default 'draft'
    check (status in ('draft', 'submitted')),
  payload jsonb not null default '{}'::jsonb,
  files jsonb not null default '[]'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    new.submitted_at = now();
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

alter table public.scholarship_applications enable row level security;

drop policy if exists "Service role can manage scholarship applications"
  on public.scholarship_applications;

create policy "Service role can manage scholarship applications"
on public.scholarship_applications
for all
to service_role
using (true)
with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scholarship-documents',
  'scholarship-documents',
  false,
  20971520,
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
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Service role can manage scholarship documents"
  on storage.objects;

create policy "Service role can manage scholarship documents"
on storage.objects
for all
to service_role
using (bucket_id = 'scholarship-documents')
with check (bucket_id = 'scholarship-documents');
