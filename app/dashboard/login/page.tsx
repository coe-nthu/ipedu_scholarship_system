import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { checkDashboardAccess } from "@/lib/auth";
import { DashboardLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "審查面板登入 — 獎學金申請",
  description: "竹師教育學院獎學金審查面板帳密登入",
};

export default async function DashboardLoginPage() {
  const auth = await checkDashboardAccess();
  if (auth.authorized) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <Card className="w-full border-slate-200 bg-white shadow-sm">
          <CardHeader className="space-y-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <ShieldCheck className="size-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-slate-950">
                審查面板登入
              </CardTitle>
              <CardDescription className="mt-2 leading-6">
                學院端與系所端請使用固定帳密登入。
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <DashboardLoginForm />
            <div className="border-t border-slate-200 pt-5">
              <p className="mb-3 text-sm text-slate-500">
                既有授權 Google 帳號仍可登入管理。
              </p>
              <AuthButton />
            </div>
            <div className="text-center text-sm">
              <Link className="text-[#1f6f78] underline-offset-4 hover:underline" href="/">
                返回申請首頁
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
