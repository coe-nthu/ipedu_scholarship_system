-- ============================================================
-- Supabase Storage schema health check
-- ============================================================
-- Purpose:
--   Diagnose the Storage 503 error:
--   "The database schema is invalid or incompatible"
--
-- Usage:
--   Run this file in Supabase Dashboard > SQL Editor.
--
-- Important:
--   Supabase documents the `storage` schema as service-owned/read-only.
--   Do not directly alter `storage.objects` unless Supabase support confirms
--   the repair path or you have a tested backup/rollback plan.
-- ============================================================

-- 1. Check key storage.objects columns and nullability.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'storage'
  and table_name = 'objects'
  and column_name in (
    'id',
    'bucket_id',
    'name',
    'owner',
    'owner_id',
    'created_at',
    'updated_at',
    'last_accessed_at',
    'metadata',
    'path_tokens',
    'version',
    'user_metadata'
  )
order by ordinal_position;

-- Expected for a healthy hosted Supabase project:
--   bucket_id: NOT NULL
--   name:      NOT NULL
-- If either is nullable, Storage API may treat the schema as incompatible.

-- 2. Check constraints currently attached to storage.objects.
select
  c.conname as constraint_name,
  c.contype as constraint_type,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'storage'
  and t.relname = 'objects'
order by c.conname;

-- 3. Check Storage migration records, if available.
-- Do not assume a specific timestamp column name across versions.
select
  *
from storage.migrations
limit 20;

-- 4. Optional read-only summary.
select
  case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'storage'
        and table_name = 'objects'
        and column_name = 'bucket_id'
        and is_nullable = 'YES'
    ) then 'bucket_id is nullable: contact Supabase support or recreate project'
    else 'bucket_id nullability looks OK'
  end as bucket_id_check,
  case
    when exists (
      select 1
      from information_schema.columns
      where table_schema = 'storage'
        and table_name = 'objects'
        and column_name = 'name'
        and is_nullable = 'YES'
    ) then 'name is nullable: contact Supabase support or recreate project'
    else 'name nullability looks OK'
  end as name_check;

-- ============================================================
-- If this check reports nullable bucket_id/name:
--   Preferred: contact Supabase support with this output, or migrate to a new
--   Supabase project whose Storage schema is healthy.
--
-- Avoid ad-hoc repairs such as:
--   alter table storage.objects alter column bucket_id set not null;
--   alter table storage.objects alter column name set not null;
--
-- Those may be technically simple but can conflict with Supabase-managed
-- Storage migrations. Treat direct repair as a last resort only.
-- ============================================================
