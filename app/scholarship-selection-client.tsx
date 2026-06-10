"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import { LanguageToggle } from "@/components/language-toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getInitialScholarshipLanguage,
  SCHOLARSHIP_LANGUAGE_STORAGE_KEY,
  textForLanguage,
  type ScholarshipLanguage,
} from "@/lib/scholarship-language";
import type { ScholarshipProgramSetting } from "@/lib/scholarship-settings";
import { createClient } from "@/lib/supabase/client";

const BILINGUAL_PROGRAM_KEYS = new Set([
  "nstc-doctoral",
  "nstc-research-grant",
  "full-time-doctoral-grant",
]);

const PROGRAM_ENGLISH_COPY: Record<
  string,
  { amount: string; description: string; period: string; title: string }
> = {
  "full-time-doctoral-grant": {
    amount:
      "The final amount and award period are determined by the college review committee.",
    description:
      "Application for full-time doctoral students. Complete personal information, employment status, academic records, and required PDF uploads.",
    period: "For full-time doctoral students in the College.",
    title: "Full-Time Doctoral Student Grant",
  },
  "nstc-doctoral": {
    amount: "NT$40,000 per month, up to 4 academic years.",
    description:
      "NSTC scholarship application for outstanding doctoral students. Complete personal information, eligibility, academic achievements, research experience, and required PDF uploads.",
    period: "For eligible 111-112 academic year students.",
    title:
      "NSTC Scholarship for Outstanding Doctoral Students",
  },
  "nstc-research-grant": {
    amount: "NT$40,000 per month, up to 3 academic years.",
    description:
      "NSTC doctoral research grant application for incoming doctoral students. Complete personal information, academic records, research achievements, and required PDF uploads.",
    period: "For incoming doctoral students in the specified academic year.",
    title: "NSTC Doctoral Research Grant",
  },
};

function ProgramText({
  children,
  enabled,
  english,
}: {
  children: ReactNode;
  enabled: boolean;
  english?: string;
}) {
  return (
    <>{enabled && english ? <span>{english}</span> : <span>{children}</span>}</>
  );
}

export function ScholarshipSelectionClient({
  initialPrograms,
}: {
  initialPrograms: ScholarshipProgramSetting[];
}) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [language, setLanguage] = useState<ScholarshipLanguage>(
    getInitialScholarshipLanguage
  );

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

  const updateLanguage = (nextLanguage: ScholarshipLanguage) => {
    setLanguage(nextLanguage);
    window.localStorage.setItem(
      SCHOLARSHIP_LANGUAGE_STORAGE_KEY,
      nextLanguage
    );
  };

  const visiblePrograms = initialPrograms.filter((program) => program.is_visible);
  const isEnglish = language === "en";

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
                    {textForLanguage(language, "竹師教育學院", "College of Education")}
                  </p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-950">
                    {textForLanguage(
                      language,
                      "獎學金申請入口",
                      "Scholarship Application Portal"
                    )}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {textForLanguage(
                      language,
                      "請選擇要申請的獎學金項目。不同獎學金會導向各自的申請表與文件需求。",
                      "Choose a scholarship program to begin. Each program has its own application form and required documents."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <LanguageToggle
                    language={language}
                    onChange={updateLanguage}
                  />
                  <AuthButton />
                </div>
              </div>
            </header>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {visiblePrograms.map((program) => {
                const bilingual =
                  isEnglish && BILINGUAL_PROGRAM_KEYS.has(program.program_key);
                const english = PROGRAM_ENGLISH_COPY[program.program_key];

                return (
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
                        <ProgramText
                          enabled={bilingual}
                          english={english?.title}
                        >
                          {program.title}
                        </ProgramText>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-6 text-slate-600">
                        <ProgramText
                          enabled={bilingual}
                          english={english?.description}
                        >
                          {program.description}
                        </ProgramText>
                      </p>
                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex items-start gap-2">
                          <CalendarDays className="mt-0.5 size-4 text-slate-400" />
                          <span>
                            <ProgramText
                              enabled={bilingual}
                              english={english?.period}
                            >
                              {program.period}
                            </ProgramText>
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 size-4 text-slate-400" />
                          <span>
                            <ProgramText
                              enabled={bilingual}
                              english={english?.amount}
                            >
                              {program.amount}
                            </ProgramText>
                          </span>
                        </div>
                      </div>
                      {program.is_open ? (
                        <Link
                          href={program.route_path}
                          className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#1f6f78] px-3 py-2 text-sm font-medium text-white hover:bg-[#185d65]"
                        >
                          <span>
                            {bilingual ? "Start application" : "開始填寫"}
                          </span>
                          <ArrowRight className="size-4" />
                        </Link>
                      ) : (
                        <div
                          aria-disabled="true"
                          className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500"
                        >
                          {bilingual ? "Not open yet" : "尚未開放"}
                          <Clock className="size-4" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
