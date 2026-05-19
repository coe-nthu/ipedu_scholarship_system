# 獎學金申請資料庫欄位說明

本文件說明「國科會-培育優秀博士生獎學金」表單送出後，在 Supabase 中儲存的資料結構，供後續製作列表、後台管理頁或資料匯出使用。

## 資料表

資料表名稱：

```text
public.scholarship_applications
```

## 主要資料表欄位

| 欄位 | 型別 | 定義 |
|---|---|---|
| `id` | `uuid` | 申請案唯一識別碼 |
| `scholarship_program` | `text` | 獎學金名稱，固定為「國科會-培育優秀博士生獎學金」 |
| `applicant_name` | `text` | 申請人姓名 |
| `student_id` | `text` | 學號 |
| `department` | `text` | 所屬學系所 |
| `email` | `text` | Email |
| `phone` | `text` | 手機 |
| `advisor_name` | `text` | 指導教授姓名 |
| `admission_academic_year` | `text` | 入學學年度 |
| `application_type` | `text` | 申請類別 |
| `gpa` | `numeric(4,2)` | 學業表現 GPA |
| `gpa_scale` | `numeric(3,1)` | GPA 滿分制，例如 `4.3` |
| `submission_status` | `text` | 學生填寫狀態：`draft` 草稿、`submitted` 已送出 |
| `review_status` | `text` | 文獻真實性審查狀態：`自動審核完成`、`等待人工審核`、`人工審核完成`、`資料錯誤` |
| `reviewer_remarks` | `text` | 審查備註（審查人員可讀寫的文字備註） |
| `payload` | `jsonb` | 完整表單資料 JSON |
| `files` | `jsonb` | 上傳檔案資料 JSON |
| `submitted_at` | `timestamptz` | 送出時間 |
| `created_at` | `timestamptz` | 建立時間 |
| `updated_at` | `timestamptz` | 更新時間 |

## `payload` 結構

`payload` 是完整表單 JSON，包含所有前端表單資料。後台列表可以直接取資料表欄位，也可以從 `payload` 取較細的表格資料。

| JSON key | 定義 |
|---|---|
| `applicantInfo` | 基本資料 |
| `eligibility` | 請領資格 |
| `academicPerformance` | 學業表現與 GPA |
| `journals` | 期刊發表 |
| `conferences` | 國際研討會發表 |
| `researchExperiences` | 相關研究參與表現 |
| `researchAwards` | 研究獲獎/獎助 |
| `plannedResearch` | 獲獎當學年預計研究議題 |
| `otherAchievements` | 其他優秀事蹟文字說明 |
| `otherReviewDocuments` | 其他有利審查文件名稱列表，目前限制最多 1 件 |

## 基本資料：`payload.applicantInfo`

| 欄位 | 定義 |
|---|---|
| `applicantName` | 申請人姓名 |
| `studentId` | 學號 |
| `department` | 所屬學系所 |
| `email` | Email |
| `phone` | 手機 |
| `advisorName` | 指導教授 |
| `admissionAcademicYear` | 入學學年度 |
| `studyStatus` | 請領別，目前固定為續領 |
| `applicationType` | 申請類別 |

## 請領資格：`payload.eligibility`

| 欄位 | 定義 |
|---|---|
| `bachelorRankPercent` | 學士班排名百分比 |
| `masterGpa` | 碩士班累計 GPA |
| `gpaScale` | 碩士班 GPA 滿分制 |
| `masterPercentScore` | 碩士班百分制成績 |
| `hasSpecialRecommendation` | 是否有特殊表現並經推薦 |
| `noFullTimeJob` | 是否確認未從事專職工作 |
| `notReceivingOtherScholarship` | 是否確認未重複請領其他獎助學金 |
| `eligibilityNotes` | 資格補充說明 |

## 學業表現：`payload.academicPerformance`

| 欄位 | 定義 |
|---|---|
| `cumulativeGpa` | 本獎學金申請用 GPA |
| `cumulativeGpaScale` | GPA 滿分制 |
| `classRankPercent` | 班排名百分比 |
| `completedCredits` | 已修畢學分 |
| `conductScore` | 操行或其他學業表現 |
| `transcriptNotes` | 成績單或學業表現備註 |

## 期刊發表：`payload.journals[]`

| 欄位 | 定義 |
|---|---|
| `doi` | DOI 碼 |
| `date` | 發表日期 |
| `author` | DOI 自動帶出的作者清單，可手動補登 |
| `applicantAuthorName` | 申請人在論文中的作者姓名 |
| `doiAuthorNames` | DOI 回傳的作者姓名陣列 |
| `issns` | DOI 回傳的 ISSN 陣列，用於期刊索引對照 |
| `title` | 論文名稱 |
| `journal` | 期刊名稱與期數 |
| `reviewUnit` | 審查單位 |
| `journalLevel` | 期刊等級：I級期刊、非I級期刊 |
| `indexSource` | 期刊等級/資料庫判別來源 |
| `isCorrespondingAuthor` | 是否標記為通訊作者 |
| `hasTrustedDatabase` | 是否發表於具公信力之資料庫 |
| `database` | 資料庫名稱，如 SSCI、SCIE、TSSCI、SCOPUS |
| `authorOrder` | 作者順位，例如第一作者、第二作者、通訊作者 |
| `authorOrderOriginal` | 系統依 DOI 比對出的原始作者順位 |
| `authorOrderModified` | 是否由申請人手動更改作者順位 |
| `authorOrderChangeNote` | 作者順位更改註記 |
| `attachmentNote` | 附件或佐證資料備註 |

期刊等級與資料庫判別方式：

1. DOI 查詢會從 Crossref 帶回期刊名稱與 ISSN。
2. 系統會用 `lib/journal-indexes.ts` 的期刊索引對照表比對 ISSN 或期刊名稱。
3. 若命中對照表，會自動填入 `database` 與 `journalLevel`，並將 `indexSource` 設為「依期刊索引對照表自動判別」。
4. 若未命中，會保留人工選擇，並將 `indexSource` 設為「未命中索引對照表，請人工選擇」。

`lib/journal-indexes.ts` 需要由系所或院辦維護官方認可清單，例如：

```ts
{
  journalTitle: "Journal of Educational Psychology",
  issns: ["0022-0663", "1939-2176"],
  database: "SSCI",
  level: "I級期刊",
}
```

## 國際研討會發表：`payload.conferences[]`

| 欄位 | 定義 |
|---|---|
| `date` | 發表日期 |
| `author` | 作者 |
| `title` | 論文名稱 |
| `conference` | 研討會名稱 |
| `organizer` | 主辦單位 |
| `type` | 發表類別：口頭發表、壁報發表 |
| `database` | 會議資料庫，如 WOS proceedings、SCOPUS proceedings |
| `authorOrder` | 作者順位 |

## 研究經歷：`payload.researchExperiences[]`

| 欄位 | 定義 |
|---|---|
| `institution` | 機構或主持人 |
| `role` | 職稱，例如研究者本人、研究助理 |
| `nature` | 研究案性質 |
| `duration` | 研究案起訖日期 |

每筆研究經歷需上傳證明文件，對應檔案欄位為 `document_researchExperiences_{index}`（如 `document_researchExperiences_0`）。

## 研究獲獎/獎助：`payload.researchAwards[]`

| 欄位 | 定義 |
|---|---|
| `name` | 名稱 |
| `projectNumber` | 計畫或成果編號 |
| `amountOrItem` | 獎助金額或項目 |
| `contribution` | 主要參與部分 |

每筆研究獲獎需上傳證明文件，對應檔案欄位為 `document_researchAwards_{index}`（如 `document_researchAwards_0`）。

## 預計研究議題：`payload.plannedResearch[]`

| 欄位 | 定義 |
|---|---|
| `title` | 預計論文名稱 |
| `expectedDate` | 預計發表時間 |
| `targetVenue` | 預計投稿期刊或研討會 |
| `hasTrustedDatabase` | 是否預計發表於具公信力之資料庫 |
| `database` | 資料庫名稱 |
| `advisor` | 指導教授 |

## 其他有利審查文件：`payload.otherReviewDocuments[]`

目前前端與後端皆限制最多上傳 1 件其他有利審查文件。

| 欄位 | 定義 |
|---|---|
| `name` | 其他有利審查文件名稱 |

對應檔案會存在 `files` 欄位中，並透過 `field` 與順序對應。例如：

```json
{
  "field": "otherReviewDocuments_0",
  "label": "語言能力證明",
  "name": "toeic.pdf",
  "path": "申請案ID/otherReviewDocuments_0/uuid.pdf",
  "type": "application/pdf",
  "size": 123456
}
```

## 上傳檔案欄位

| 前端檔案欄位 name | 定義 | 是否必繳 |
|---|---|---|
| `document_transcript` | 歷年成績單 | 是 |
| `document_advisorRecommendation` | 指導教授推薦函 | 是 |
| `document_learningPlan` | 個人學習計畫書，最多 3 頁 | 是 |
| `document_noFullTimeDeclaration` | 無專職切結書 | 是 |
| `document_researchExperiences_{index}` | 研究經歷證明文件（每筆一份） | 否 |
| `document_researchAwards_{index}` | 研究獲獎證明文件（每筆一份） | 否 |
| `document_otherReviewDocuments_0` | 其他有利審查文件，限 1 件 | 否 |

## `files` 結構

每個上傳檔案會寫入 Supabase Storage bucket：

```text
scholarship-documents
```

資料表的 `files` 欄位會保存每個檔案的 metadata：

| 欄位 | 定義 |
|---|---|
| `field` | 檔案欄位代號 |
| `label` | 檔案對應名稱，主要用於其他有利審查文件 |
| `name` | 原始檔名，可包含中文 |
| `path` | Supabase Storage 中的路徑；檔名由系統產生 UUID，避免中文或特殊字元造成 Storage 相容性問題 |
| `type` | MIME type |
| `size` | 檔案大小，單位 bytes |

## 常用列表查詢

### 申請列表

```sql
select
  id,
  applicant_name,
  student_id,
  department,
  advisor_name,
  gpa,
  gpa_scale,
  status,
  created_at,
  submitted_at
from public.scholarship_applications
order by created_at desc;
```

### 含期刊與研討會摘要

```sql
select
  id,
  applicant_name,
  department,
  gpa,
  status,
  payload->'journals' as journals,
  payload->'conferences' as conferences,
  created_at
from public.scholarship_applications
order by created_at desc;
```

### 其他有利審查文件列表

```sql
select
  id,
  applicant_name,
  payload->'otherReviewDocuments' as other_review_documents,
  files
from public.scholarship_applications
order by created_at desc;
```

### 只列出已送出申請

```sql
select
  id,
  applicant_name,
  student_id,
  department,
  gpa,
  submitted_at
from public.scholarship_applications
where status = 'submitted'
order by submitted_at desc;
```
