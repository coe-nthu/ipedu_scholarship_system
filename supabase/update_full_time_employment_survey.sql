-- ============================================================================
-- 全時博士生助學金：「兼職情形調查」改為「兼職與留職停薪情形調查」
-- ----------------------------------------------------------------------------
-- 依 115.8.4 修訂版紙本申請書調整：
-- 1. payload -> 'eligibility' ->> 'employmentStatus' 由單選改為可複選，多值以
--    「、」串接（沿用 lib/scholarship-form-options.ts 的 MULTI_OPTION_DELIMITER）。
--    新選項：
--      無兼職
--      報考時具專職工作，已辦理留職停薪
--      受獎期間符合全時就學資格
--      有兼職（非專職）
--    舊選項（擔任校內外教學助理／有校內外兼職）不改寫，保留申請人當初填答的
--    原始內容，後台編輯與後端驗證仍接受這兩個值。
-- 2. 新增 payload -> 'eligibility' 的 unpaidLeaveStartDate / unpaidLeaveEndDate
--    （留職停薪期間，YYYY-MM-DD）。
-- 3. 切結書第一條改為「通過申請之學生，如有休學、留職停薪期滿復職或申請後有專職
--    者，應主動通知院辦公室，並於事實發生次月取消得獎資格，取消資格後不再恢復
--    獲獎資格。」，同步寫回獎學金說明與資格提醒。
--
-- payload 為 jsonb，欄位新增不需要改結構；本腳本可安全重複執行。
-- ============================================================================

-- 1. 補上新欄位的預設空字串，讓既有全時博士生助學金申請案的 payload 形狀一致。
update public.scholarship_applications
set payload = jsonb_set(
      jsonb_set(
        payload,
        '{eligibility,unpaidLeaveStartDate}',
        coalesce(payload -> 'eligibility' -> 'unpaidLeaveStartDate', '""'::jsonb),
        true
      ),
      '{eligibility,unpaidLeaveEndDate}',
      coalesce(payload -> 'eligibility' -> 'unpaidLeaveEndDate', '""'::jsonb),
      true
    )
-- 用 jsonb_exists() 而非 `?` 運算子，避免部分用戶端把 `?` 當成參數佔位符。
where program_key = 'full-time-doctoral-grant'
  and jsonb_typeof(payload -> 'eligibility') = 'object'
  and (
    not jsonb_exists(payload -> 'eligibility', 'unpaidLeaveStartDate')
    or not jsonb_exists(payload -> 'eligibility', 'unpaidLeaveEndDate')
  );

-- 2. 更新前台顯示文字與資格提醒（含修正後的切結書第一條）。
update public.scholarship_program_settings
set description =
      '填寫基本資料、申請類型、兼職與留職停薪情形調查與指定文件上傳。',
    description_en =
      'Application for full-time doctoral students. Complete personal information, part-time work and unpaid leave status, academic records, and required PDF uploads.',
    eligibility_reminder =
      '限全時無專職就讀本院之博士生申請，以一至四年級為原則。通過申請之學生，如有休學、留職停薪期滿復職或申請後有專職者，應主動通知院辦公室，並於事實發生次月取消得獎資格，取消資格後不再恢復獲獎資格。'
where program_key = 'full-time-doctoral-grant';
