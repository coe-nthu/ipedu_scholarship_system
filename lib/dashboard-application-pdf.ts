import { existsSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import {
  formatSubmittedAt,
  getAcademicDisplayRows,
  getEligibilityDisplayRows,
} from "@/lib/dashboard-application-display";
import {
  getNonEmptyConferences,
  getNonEmptyJournals,
} from "@/lib/publication-records";
import type {
  Conference,
  Journal,
  PlannedResearch,
  ResearchAward,
  ResearchExperience,
  ScholarshipApplication,
  SupabaseFileRecord,
} from "@/lib/types";

type DisplayRow = {
  label: string;
  value: string;
};

const PAGE_MARGIN = 44;
const LABEL_WIDTH = 112;
const LINE_GAP = 4;

const FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH,
  path.join(process.cwd(), "assets", "fonts", "NotoSansTC-VF.ttf"),
  "C:/Windows/Fonts/NotoSansTC-VF.ttf",
  "C:/Windows/Fonts/msjh.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
  "/usr/share/fonts/opentype/noto/NotoSansCJKtc-Regular.otf",
].filter(Boolean) as string[];

function resolveFontPath() {
  return FONT_CANDIDATES.find((path) => existsSync(path));
}

function text(value: unknown) {
  if (value === null || value === undefined) return "-";
  const normalized = String(value).trim();
  return normalized || "-";
}

function yesNo(value: boolean) {
  return value ? "是" : "否";
}

function collectPdf(doc: PDFKit.PDFDocument) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - PAGE_MARGIN * 2;
}

function ensureSpace(doc: PDFKit.PDFDocument, height: number) {
  if (doc.y + height > doc.page.height - PAGE_MARGIN) {
    doc.addPage();
  }
}

function addFooter(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(
        `第 ${i + 1} 頁`,
        PAGE_MARGIN,
        doc.page.height - 30,
        { align: "center", width: contentWidth(doc) }
      );
  }
}

function addSectionTitle(doc: PDFKit.PDFDocument, title: string) {
  ensureSpace(doc, 34);
  doc.moveDown(0.8);
  doc
    .fontSize(13)
    .fillColor("#0f766e")
    .text(title, PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
  doc
    .moveTo(PAGE_MARGIN, doc.y + 4)
    .lineTo(doc.page.width - PAGE_MARGIN, doc.y + 4)
    .strokeColor("#ccfbf1")
    .lineWidth(1)
    .stroke();
  doc.moveDown(0.8);
}

function addRows(doc: PDFKit.PDFDocument, rows: DisplayRow[]) {
  const valueWidth = contentWidth(doc) - LABEL_WIDTH - 14;

  for (const row of rows) {
    const value = text(row.value);
    const labelHeight = doc.heightOfString(row.label, { width: LABEL_WIDTH });
    const valueHeight = doc.heightOfString(value, { width: valueWidth });
    const rowHeight = Math.max(labelHeight, valueHeight) + 10;
    ensureSpace(doc, rowHeight);

    const y = doc.y;
    doc
      .fontSize(9)
      .fillColor("#64748b")
      .text(row.label, PAGE_MARGIN, y, { width: LABEL_WIDTH });
    doc
      .fontSize(9.5)
      .fillColor("#0f172a")
      .text(value, PAGE_MARGIN + LABEL_WIDTH + 14, y, {
        width: valueWidth,
        lineGap: LINE_GAP,
      });
    doc
      .moveTo(PAGE_MARGIN, y + rowHeight - 2)
      .lineTo(doc.page.width - PAGE_MARGIN, y + rowHeight - 2)
      .strokeColor("#e2e8f0")
      .lineWidth(0.5)
      .stroke();
    doc.y = y + rowHeight;
  }
}

function addRecordBlock(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: DisplayRow[]
) {
  ensureSpace(doc, 30);
  doc
    .fontSize(10.5)
    .fillColor("#334155")
    .text(title, PAGE_MARGIN, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.3);
  addRows(doc, rows);
  doc.moveDown(0.3);
}

function addEmpty(doc: PDFKit.PDFDocument, message = "無") {
  ensureSpace(doc, 18);
  doc.fontSize(9.5).fillColor("#94a3b8").text(message, PAGE_MARGIN, doc.y);
}

function journalRows(journal: Journal): DisplayRow[] {
  const verification = journal.verification;
  return [
    { label: "題名", value: journal.title },
    { label: "作者", value: journal.author },
    { label: "申請人作者名", value: journal.applicantAuthorName },
    { label: "期刊", value: journal.journal },
    { label: "發表日期", value: journal.date },
    { label: "DOI", value: journal.doi },
    { label: "審查單位", value: journal.reviewUnit },
    { label: "期刊等級", value: journal.journalLevel },
    { label: "索引來源", value: journal.indexSource },
    { label: "資料庫別", value: journal.database },
    { label: "作者排序", value: journal.authorOrder },
    { label: "通訊作者", value: yesNo(journal.isCorrespondingAuthor) },
    { label: "附件說明", value: journal.attachmentNote },
    {
      label: "自動驗證",
      value: verification
        ? `${verification.status} - ${verification.message || "無訊息"}`
        : "未驗證",
    },
  ];
}

function conferenceRows(conference: Conference): DisplayRow[] {
  return [
    { label: "論文題名", value: conference.title },
    { label: "作者", value: conference.author },
    { label: "研討會", value: conference.conference },
    { label: "主辦單位", value: conference.organizer },
    { label: "日期", value: conference.date },
    { label: "類型", value: conference.type },
    { label: "資料庫別", value: conference.database },
    { label: "作者排序", value: conference.authorOrder },
  ];
}

function researchExperienceRows(item: ResearchExperience): DisplayRow[] {
  return [
    { label: "機構", value: item.institution },
    { label: "角色", value: item.role },
    { label: "性質", value: item.nature },
    { label: "期間", value: item.duration },
  ];
}

function researchAwardRows(item: ResearchAward): DisplayRow[] {
  return [
    { label: "名稱", value: item.name },
    { label: "編號", value: item.projectNumber },
    { label: "金額/項目", value: item.amountOrItem },
    { label: "貢獻", value: item.contribution },
  ];
}

function plannedResearchRows(item: PlannedResearch): DisplayRow[] {
  return [
    { label: "議題", value: item.title },
    { label: "預計投稿", value: item.targetVenue },
    { label: "預計時間", value: item.expectedDate },
    { label: "指導教授", value: item.advisor },
    { label: "具公信力資料庫", value: item.hasTrustedDatabase },
    { label: "資料庫別", value: item.database },
  ];
}

function fileRows(file: SupabaseFileRecord): DisplayRow[] {
  return [
    { label: "檔名", value: file.name },
    { label: "欄位", value: file.label ?? file.field },
    { label: "大小", value: `${Math.round(file.size / 1024)} KB` },
  ];
}

export async function createApplicationDetailPdf(
  application: ScholarshipApplication
) {
  const fontPath = resolveFontPath();
  if (!fontPath) {
    throw new Error("PDF font file not found. Set PDF_FONT_PATH or include assets/fonts/NotoSansTC-VF.ttf.");
  }

  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    font: fontPath,
    info: {
      Title: `${application.applicant_name} 申請資料詳情`,
      Author: "IPEDU Scholarship System",
      Subject: application.scholarship_program,
    },
    margin: PAGE_MARGIN,
    size: "A4",
  });
  const pdfBuffer = collectPdf(doc);

  doc.addPage();
  doc.font(fontPath);

  const { applicantInfo, otherAchievements } = application.payload;
  doc
    .fontSize(18)
    .fillColor("#0f172a")
    .text("獎學金申請資料詳情", PAGE_MARGIN, PAGE_MARGIN, {
      width: contentWidth(doc),
    });
  doc.moveDown(0.35);
  doc
    .fontSize(10)
    .fillColor("#64748b")
    .text(
      `${application.scholarship_program} / 匯出時間：${formatSubmittedAt(new Date().toISOString())}`,
      PAGE_MARGIN,
      doc.y,
      { width: contentWidth(doc) }
    );

  addSectionTitle(doc, "申請基本資料");
  addRows(doc, [
    { label: "姓名", value: applicantInfo.applicantName },
    { label: "學號", value: applicantInfo.studentId },
    { label: "系所", value: applicantInfo.department },
    { label: "Email", value: applicantInfo.email },
    { label: "電話", value: applicantInfo.phone },
    { label: "指導教授", value: applicantInfo.advisorName },
    { label: "入學學年度", value: applicantInfo.admissionAcademicYear },
    {
      label: "入學管道",
      value: application.payload.academicPerformance.admissionChannel,
    },
    { label: "請領別", value: applicantInfo.studyStatus },
    { label: "申請類別", value: applicantInfo.applicationType },
    { label: "送出時間", value: formatSubmittedAt(application.submitted_at) },
    { label: "審查狀態", value: application.review_status },
    { label: "審查備註", value: application.reviewer_remarks },
  ]);

  addSectionTitle(doc, "資格檢核");
  addRows(doc, getEligibilityDisplayRows(application));

  addSectionTitle(doc, "學業表現");
  addRows(doc, getAcademicDisplayRows(application));

  addSectionTitle(doc, "期刊論文");
  const journals = getNonEmptyJournals(application.payload.journals);
  if (journals.length === 0) {
    addEmpty(doc, "無期刊資料");
  } else {
    journals.forEach((journal, index) =>
      addRecordBlock(doc, `第 ${index + 1} 篇`, journalRows(journal))
    );
  }

  addSectionTitle(doc, "研討會論文");
  const conferences = getNonEmptyConferences(application.payload.conferences);
  if (conferences.length === 0) {
    addEmpty(doc, "無研討會資料");
  } else {
    conferences.forEach((conference, index) =>
      addRecordBlock(doc, `第 ${index + 1} 筆`, conferenceRows(conference))
    );
  }

  addSectionTitle(doc, "研究經驗");
  const experiences = application.payload.researchExperiences ?? [];
  if (experiences.length === 0) {
    addEmpty(doc, "無研究經驗");
  } else {
    experiences.forEach((item, index) =>
      addRecordBlock(doc, `第 ${index + 1} 筆`, researchExperienceRows(item))
    );
  }

  addSectionTitle(doc, "研究獲獎/獎助");
  const awards = application.payload.researchAwards ?? [];
  if (awards.length === 0) {
    addEmpty(doc, "無獲獎紀錄");
  } else {
    awards.forEach((item, index) =>
      addRecordBlock(doc, `第 ${index + 1} 筆`, researchAwardRows(item))
    );
  }

  addSectionTitle(doc, "預計研究議題");
  const plannedResearch = application.payload.plannedResearch ?? [];
  if (plannedResearch.length === 0) {
    addEmpty(doc, "無預計研究議題");
  } else {
    plannedResearch.forEach((item, index) =>
      addRecordBlock(doc, `第 ${index + 1} 筆`, plannedResearchRows(item))
    );
  }

  addSectionTitle(doc, "其他優秀事蹟");
  addRows(doc, [{ label: "內容", value: otherAchievements }]);

  addSectionTitle(doc, "上傳檔案清單");
  const files = application.files ?? [];
  if (files.length === 0) {
    addEmpty(doc, "無上傳檔案");
  } else {
    files.forEach((file, index) =>
      addRecordBlock(doc, `第 ${index + 1} 個檔案`, fileRows(file))
    );
  }

  addFooter(doc);
  doc.end();
  return pdfBuffer;
}
