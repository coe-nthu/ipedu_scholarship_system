import type { Metadata } from "next";
import { AuthButton } from "@/components/auth-button";
import type { ScholarshipApplication } from "@/lib/types";
import { DashboardTable } from "./dashboard-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "教師審查面板 — 培育優秀博士生獎學金",
  description: "國科會培育優秀博士生獎學金申請案教師審查面板",
};

async function fetchApplications(): Promise<ScholarshipApplication[]> {
  const url = (
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  ).replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return [];
  }

  try {
    const response = await fetch(
      `${url}/rest/v1/scholarship_applications?submission_status=eq.submitted&order=submitted_at.desc&select=id,applicant_name,student_id,department,advisor_name,gpa,gpa_scale,submission_status,review_status,reviewer_remarks,payload,files,submitted_at,created_at,updated_at`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) return [];
    return (await response.json()) as ScholarshipApplication[];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const applications = await fetchApplications();

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="border-b border-slate-300 pb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-700">
                國科會-培育優秀博士生獎學金
              </p>
              <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
                教師審查面板
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                共 {applications.length} 件已送出申請案
              </p>
            </div>
            <AuthButton />
          </div>
        </header>

        <DashboardTable applications={applications} />
      </div>
    </main>
  );
}
