import type { Metadata } from "next";
import { AuthButton } from "@/components/auth-button";
import { dummyApplications } from "@/lib/dashboard-dummy-data";
import { DashboardTable } from "./dashboard-table";

export const metadata: Metadata = {
  title: "教師審查面板 — 培育優秀博士生獎學金",
  description: "國科會培育優秀博士生獎學金申請案教師審查面板",
};

export default function DashboardPage() {
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
                共 {dummyApplications.length} 件已送出申請案
              </p>
            </div>
            <AuthButton />
          </div>
        </header>

        <DashboardTable applications={dummyApplications} />
      </div>
    </main>
  );
}
