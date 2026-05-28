"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  GraduationCap,
} from "lucide-react";
import { AuthButton } from "@/components/auth-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScholarshipProgramSetting } from "@/lib/scholarship-settings";
import { createClient } from "@/lib/supabase/client";

export function ScholarshipSelectionClient({
  initialPrograms,
}: {
  initialPrograms: ScholarshipProgramSetting[];
}) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setCurrentUser(data.user);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const visiblePrograms = initialPrograms.filter((program) => program.is_visible);

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {isAuthLoading ? (
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">正在確認登入狀態</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-slate-600">
                請稍候，系統正在確認你的 Google 登入狀態。
              </p>
            </CardContent>
          </Card>
        ) : currentUser ? (
          <>
            <header className="border-b border-slate-300 pb-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-medium text-emerald-700">
                    竹師教育學院
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-950">
                    獎學金申請入口
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    請選擇要申請的獎學金項目。不同獎學金會導向各自的申請表與文件需求。
                  </p>
                </div>
                <AuthButton />
              </div>
            </header>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visiblePrograms.map((program) => (
                <Card
                  key={program.program_key}
                  className={`shadow-sm ${
                    program.is_open
                      ? "border-[#1f6f78]/30"
                      : "border-slate-200 opacity-75"
                  }`}
                >
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="rounded-md border border-slate-200 bg-white p-2 text-[#1f6f78]">
                        {program.is_open ? (
                          <GraduationCap className="size-5" />
                        ) : (
                          <Award className="size-5" />
                        )}
                      </div>
                      <Badge
                        className={
                          program.is_open
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                        }
                      >
                        {program.status_label}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg leading-7">
                      {program.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-slate-600">
                      {program.description}
                    </p>
                    <div className="space-y-2 text-sm text-slate-600">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-slate-400" />
                        <span>{program.period}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-slate-400" />
                        <span>{program.amount}</span>
                      </div>
                    </div>
                    {program.is_open ? (
                      <Link
                        href={program.route_path}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#1f6f78] px-3 text-sm font-medium text-white hover:bg-[#185d65]"
                      >
                        開始填寫
                        <ArrowRight className="size-4" />
                      </Link>
                    ) : (
                      <div
                        aria-disabled="true"
                        className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500"
                      >
                        尚未開放
                        <Clock className="size-4" />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>
          </>
        ) : (
          <Card className="mx-auto max-w-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">請先登入 Google 帳戶</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-slate-600">
                登入後即可選擇獎學金項目並開始填寫申請表。
              </p>
              <AuthButton />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
