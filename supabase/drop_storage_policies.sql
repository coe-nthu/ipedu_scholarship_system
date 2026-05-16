-- ============================================================
-- Remove app-managed Supabase Storage policies
-- ============================================================
-- The app uses server-issued signed upload URLs for Storage writes.
-- Do not disable RLS on storage.objects; Supabase manages that table.
-- This migration only removes policies previously created by this repo.
-- ============================================================

drop policy if exists "Service role can manage scholarship documents"
  on storage.objects;

drop policy if exists "Students can upload own documents"
  on storage.objects;

drop policy if exists "Students can view own documents"
  on storage.objects;

drop policy if exists "Teachers can view all documents"
  on storage.objects;

select
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
order by policyname;
