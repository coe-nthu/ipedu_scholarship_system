-- Add an independent dashboard sort column for submitted applications.
-- Existing reviewer remarks like "排序1" are migrated into the new numeric
-- column and then cleared, while all other remarks are preserved.

alter table public.scholarship_applications
  add column if not exists review_sort_order integer not null default 0;

update public.scholarship_applications
set review_sort_order = substring(btrim(reviewer_remarks) from '^排序([0-9]+)$')::integer,
    reviewer_remarks = ''
where btrim(reviewer_remarks) ~ '^排序[0-9]+$';

update public.scholarship_applications
set review_sort_order = 0
where review_sort_order is null;

alter table public.scholarship_applications
  alter column review_sort_order set not null,
  alter column review_sort_order set default 0;

comment on column public.scholarship_applications.review_sort_order is '後台人工排序；0 代表未指定';

create index if not exists idx_applications_review_sort_order
  on public.scholarship_applications(review_sort_order);
