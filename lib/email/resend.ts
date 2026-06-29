const RESEND_EMAIL_API_URL = "https://api.resend.com/emails";

type SendScholarshipConfirmationEmailInput = {
  applicationId: string;
  applicantName: string;
  department: string;
  recipientEmail: string;
  scholarshipProgram: string;
  submittedAt: string | null;
};

type SendScholarshipCorrectionEmailInput = {
  applicationId: string;
  applicantName: string;
  department: string;
  message: string;
  recipientEmail: string;
  scholarshipProgram: string;
};

type SendDashboardPasswordResetCodeEmailInput = {
  code: string;
  displayName: string;
  expiresMinutes: number;
  recipientEmail: string;
  username: string;
};

type ResendEmailResponse = {
  id?: string;
  message?: string;
  name?: string;
};

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.RESEND_FROM_EMAIL ||
    "IPEDU Scholarship <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error("尚未設定 RESEND_API_KEY。");
  }

  return { apiKey, fromEmail };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSubmittedAt(value: string | null) {
  if (!value) {
    return "系統已完成收件";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

function buildConfirmationHtml({
  applicationId,
  applicantName,
  department,
  scholarshipProgram,
  submittedAt,
}: SendScholarshipConfirmationEmailInput) {
  const safeApplicantName = escapeHtml(applicantName || "同學");
  const safeDepartment = escapeHtml(department || "未填寫");
  const safeApplicationId = escapeHtml(applicationId);
  const safeScholarshipProgram = escapeHtml(scholarshipProgram);
  const safeSubmittedAt = escapeHtml(formatSubmittedAt(submittedAt));

  return `
    <div style="font-family: Arial, 'Noto Sans TC', sans-serif; line-height: 1.7; color: #0f172a;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">獎學金申請已送出</h1>
      <p>${safeApplicantName} 您好：</p>
      <p>系統已收到您的「${safeScholarshipProgram}」申請資料。</p>
      <table style="border-collapse: collapse; margin: 20px 0; width: 100%; max-width: 560px;">
        <tbody>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">申請項目</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeScholarshipProgram}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">申請編號</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeApplicationId}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">系所</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeDepartment}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">送出時間</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeSubmittedAt}</td>
          </tr>
        </tbody>
      </table>
      <p>後續審查進度請以系統或承辦單位通知為準。</p>
      <p style="color: #475569; font-size: 13px;">此信件由系統自動寄出，請勿直接回覆。</p>
    </div>
  `;
}

function buildConfirmationText({
  applicationId,
  applicantName,
  department,
  scholarshipProgram,
  submittedAt,
}: SendScholarshipConfirmationEmailInput) {
  return [
    `${applicantName || "同學"} 您好：`,
    "",
    `系統已收到您的「${scholarshipProgram}」申請資料。`,
    `申請項目：${scholarshipProgram}`,
    `申請編號：${applicationId}`,
    `系所：${department || "未填寫"}`,
    `送出時間：${formatSubmittedAt(submittedAt)}`,
    "",
    "後續審查進度請以系統或承辦單位通知為準。",
    "此信件由系統自動寄出，請勿直接回覆。",
  ].join("\n");
}

function buildCorrectionHtml({
  applicationId,
  applicantName,
  department,
  message,
  scholarshipProgram,
}: SendScholarshipCorrectionEmailInput) {
  const safeApplicantName = escapeHtml(applicantName || "同學");
  const safeDepartment = escapeHtml(department || "未填寫");
  const safeApplicationId = escapeHtml(applicationId);
  const safeScholarshipProgram = escapeHtml(scholarshipProgram);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br />");

  return `
    <div style="font-family: Arial, 'Noto Sans TC', sans-serif; line-height: 1.7; color: #0f172a;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">獎學金申請資料需補正</h1>
      <p>${safeApplicantName} 您好：</p>
      <p>系辦審查您的「${safeScholarshipProgram}」申請資料後，發現下列項目需要補正。</p>
      <table style="border-collapse: collapse; margin: 20px 0; width: 100%; max-width: 560px;">
        <tbody>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">申請項目</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeScholarshipProgram}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">申請編號</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeApplicationId}</td>
          </tr>
          <tr>
            <th style="text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; background: #f8fafc;">系所</th>
            <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${safeDepartment}</td>
          </tr>
        </tbody>
      </table>
      <div style="margin: 20px 0; padding: 14px 16px; border-left: 4px solid #f59e0b; background: #fffbeb;">
        <p style="margin: 0 0 8px; font-weight: 700;">需補正內容</p>
        <p style="margin: 0;">${safeMessage}</p>
      </div>
      <p>系統已將您的申請退回可修改狀態，請登入原申請頁修正資料後重新送出。</p>
      <p style="color: #475569; font-size: 13px;">此信件由系統自動寄出，請勿直接回覆。</p>
    </div>
  `;
}

function buildCorrectionText({
  applicationId,
  applicantName,
  department,
  message,
  scholarshipProgram,
}: SendScholarshipCorrectionEmailInput) {
  return [
    `${applicantName || "同學"} 您好：`,
    "",
    `系辦審查您的「${scholarshipProgram}」申請資料後，發現下列項目需要補正。`,
    `申請項目：${scholarshipProgram}`,
    `申請編號：${applicationId}`,
    `系所：${department || "未填寫"}`,
    "",
    "需補正內容：",
    message,
    "",
    "系統已將您的申請退回可修改狀態，請登入原申請頁修正資料後重新送出。",
    "此信件由系統自動寄出，請勿直接回覆。",
  ].join("\n");
}

function buildDashboardPasswordResetHtml({
  code,
  displayName,
  expiresMinutes,
  username,
}: SendDashboardPasswordResetCodeEmailInput) {
  const safeCode = escapeHtml(code);
  const safeDisplayName = escapeHtml(displayName || username);
  const safeExpiresMinutes = escapeHtml(String(expiresMinutes));
  const safeUsername = escapeHtml(username);

  return `
    <div style="font-family: Arial, 'Noto Sans TC', sans-serif; line-height: 1.7; color: #0f172a;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">後台密碼重設驗證碼</h1>
      <p>${safeDisplayName} 您好：</p>
      <p>您正在重設獎學金系統後台帳號「${safeUsername}」的密碼。</p>
      <div style="margin: 20px 0; padding: 18px 20px; border: 1px solid #cbd5e1; background: #f8fafc; width: fit-content;">
        <p style="margin: 0 0 6px; color: #475569; font-size: 13px;">驗證碼</p>
        <p style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 4px;">${safeCode}</p>
      </div>
      <p>此驗證碼將於 ${safeExpiresMinutes} 分鐘後失效。若您沒有提出重設密碼要求，請忽略此信件。</p>
      <p style="color: #475569; font-size: 13px;">此信件由系統自動寄出，請勿直接回覆。</p>
    </div>
  `;
}

function buildDashboardPasswordResetText({
  code,
  displayName,
  expiresMinutes,
  username,
}: SendDashboardPasswordResetCodeEmailInput) {
  return [
    `${displayName || username} 您好：`,
    "",
    `您正在重設獎學金系統後台帳號「${username}」的密碼。`,
    `驗證碼：${code}`,
    `此驗證碼將於 ${expiresMinutes} 分鐘後失效。`,
    "",
    "若您沒有提出重設密碼要求，請忽略此信件。",
    "此信件由系統自動寄出，請勿直接回覆。",
  ].join("\n");
}

async function sendResendEmail({
  html,
  idempotencyKey,
  recipientEmail,
  subject,
  text,
}: {
  html: string;
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  text: string;
}) {
  const { apiKey, fromEmail } = getResendConfig();
  const response = await fetch(RESEND_EMAIL_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject,
      html,
      text,
    }),
  });

  const result = (await response.json().catch(() => ({}))) as ResendEmailResponse;

  if (!response.ok) {
    throw new Error(result.message || "Resend 寄信失敗。");
  }

  return result.id;
}

export async function sendScholarshipConfirmationEmail(
  input: SendScholarshipConfirmationEmailInput
) {
  return sendResendEmail({
    html: buildConfirmationHtml(input),
    idempotencyKey: `scholarship-confirmation-${input.applicationId}`,
    recipientEmail: input.recipientEmail,
    subject: "獎學金申請已送出",
    text: buildConfirmationText(input),
  });
}

export async function sendScholarshipCorrectionEmail(
  input: SendScholarshipCorrectionEmailInput
) {
  return sendResendEmail({
    html: buildCorrectionHtml(input),
    idempotencyKey: `scholarship-correction-${input.applicationId}-${Date.now()}`,
    recipientEmail: input.recipientEmail,
    subject: "獎學金申請資料需補正",
    text: buildCorrectionText(input),
  });
}

export async function sendDashboardPasswordResetCodeEmail(
  input: SendDashboardPasswordResetCodeEmailInput
) {
  return sendResendEmail({
    html: buildDashboardPasswordResetHtml(input),
    idempotencyKey: `dashboard-password-reset-${input.username}-${Date.now()}`,
    recipientEmail: input.recipientEmail,
    subject: "後台密碼重設驗證碼",
    text: buildDashboardPasswordResetText(input),
  });
}
