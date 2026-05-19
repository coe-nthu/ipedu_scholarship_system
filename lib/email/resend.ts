const RESEND_EMAIL_API_URL = "https://api.resend.com/emails";

type SendScholarshipConfirmationEmailInput = {
  applicationId: string;
  applicantName: string;
  department: string;
  recipientEmail: string;
  scholarshipProgram: string;
  submittedAt: string | null;
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

export async function sendScholarshipConfirmationEmail(
  input: SendScholarshipConfirmationEmailInput
) {
  const { apiKey, fromEmail } = getResendConfig();
  const response = await fetch(RESEND_EMAIL_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "Idempotency-Key": `scholarship-confirmation-${input.applicationId}`,
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [input.recipientEmail],
      subject: "獎學金申請已送出",
      html: buildConfirmationHtml(input),
      text: buildConfirmationText(input),
    }),
  });

  const result = (await response.json().catch(() => ({}))) as ResendEmailResponse;

  if (!response.ok) {
    throw new Error(result.message || "Resend 寄信失敗。");
  }

  return result.id;
}
