-- ============================================================================
-- 系所／院辦後台帳號的「學生重新送出」通知信箱
-- ----------------------------------------------------------------------------
-- 背景：系所按「通知補正」把申請退回草稿後，案件會從審查列表消失
-- （GET /api/dashboard 只列 submission_status = 'submitted'）。學生修正並重新
-- 送出時，review_status 會被重設回「未審核」，代表一定要有人再審一次，但系所端
-- 完全沒有通知，只能自己反覆重整才會發現案件回來了。
--
-- dashboard_accounts.recovery_email 只用於忘記密碼驗證碼，而且僅管理員能改，
-- 不適合當通知信箱。本腳本另外新增 notification_emails（可存多組），由各帳號
-- 自行在後台維護。
--
-- 兩張後台帳號表都要加：帳密帳號在 dashboard_accounts，Google 登入的教師／
-- 管理員在 authorized_emails。通知信箱與登入用的 email 刻意分開 —— 系辦的收件
-- 信箱通常不是承辦人自己的 Google 帳號。
--
-- 可安全重複執行。在 Supabase SQL Editor 執行一次即可。
-- ============================================================================

alter table public.dashboard_accounts
  add column if not exists notification_emails jsonb not null default '[]'::jsonb;

alter table public.dashboard_accounts
  drop constraint if exists dashboard_accounts_notification_emails_check;
alter table public.dashboard_accounts
  add constraint dashboard_accounts_notification_emails_check
    check (jsonb_typeof(notification_emails) = 'array');

comment on column public.dashboard_accounts.notification_emails is
  '學生重新送出申請時的通知收件信箱，JSON 字串陣列，由帳號自行維護（與 recovery_email 分開）';

alter table public.authorized_emails
  add column if not exists notification_emails jsonb not null default '[]'::jsonb;

alter table public.authorized_emails
  drop constraint if exists authorized_emails_notification_emails_check;
alter table public.authorized_emails
  add constraint authorized_emails_notification_emails_check
    check (jsonb_typeof(notification_emails) = 'array');

comment on column public.authorized_emails.notification_emails is
  '學生重新送出申請時的通知收件信箱，JSON 字串陣列，由帳號自行維護（與登入用的 email 分開）';
