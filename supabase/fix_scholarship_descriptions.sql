-- ============================================================
-- 修正獎學金顯示文字：移除開發階段的佔位描述
-- 在 Supabase SQL Editor 執行一次即可。
-- 只會更新「仍是開發佔位文字」的資料列，不會覆蓋院辦已自訂的內容。
-- ============================================================

-- 教育部-博士生獎學金：標題描述（顯示為表單大標）
update public.scholarship_program_settings
set description = '填寫基本資料、請領資格、學術表現、研究參與與指定文件上傳。'
where program_key = 'moe-doctoral'
  and description like '%先沿用既有申請表樣式%';

-- 請領資格提醒：移除「頁面樣式先沿用…後續可依正式公告再調整」開發說明
update public.scholarship_program_settings
set eligibility_reminder = '本獎學金適用 114 學年度博士班 1 至 3 年級學生。請填寫基本資料、學術表現與指定文件；指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。'
where program_key = 'moe-doctoral'
  and eligibility_reminder like '%頁面樣式先沿用%';

update public.scholarship_program_settings
set eligibility_reminder = '本獎學金適用 114 學年度入學新生。請填寫基本資料、學術表現與指定文件；指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。'
where program_key = 'nstc-research-grant'
  and eligibility_reminder like '%頁面樣式先沿用%';

update public.scholarship_program_settings
set eligibility_reminder = '本獎學金為校長獎學金（新生獎學金）。請填寫基本資料、學術表現與指定文件；指定文件請掃描上傳，正本簽名資料仍依系所公告繳交。'
where program_key = 'presidential-new-student'
  and eligibility_reminder like '%頁面樣式先沿用%';
