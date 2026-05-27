"use client";

import type { ReactNode } from "react";
import { AuthButton } from "@/components/auth-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardAuthProvider, DashboardRole } from "@/lib/types";

export function DashboardTabs({
  authProvider,
  applicationCount,
  displayName,
  role,
  reviewContent,
  adminContent,
}: {
  authProvider: DashboardAuthProvider;
  applicationCount: number;
  displayName: string;
  role: DashboardRole;
  reviewContent: ReactNode;
  adminContent: ReactNode;
}) {
  const sectionTabs = (
    <TabsList className="h-10 w-fit">
      <TabsTrigger value="review" className="text-sm px-4">
        審查列表
      </TabsTrigger>
      <TabsTrigger value="admin" className="text-sm px-4">
        權限管理
      </TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs defaultValue="review" className="w-full min-w-0 max-w-full space-y-6">
      <header className="border-b border-slate-300 pb-6">
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-700">
              竹師教育學院獎學金
            </p>
            <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">
              教師審查面板
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              共 {applicationCount} 件已送出申請案
              <span className="ml-2 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                {displayName}
              </span>
              {role === "admin" && (
                <span className="ml-2 inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-700">
                  管理員
                </span>
              )}
            </p>
          </div>
          <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            {sectionTabs}
            <AuthButton
              dashboardIdentity={
                authProvider === "password" ? { displayName } : undefined
              }
            />
          </div>
        </div>
      </header>
      <TabsContent value="review" className="min-w-0 max-w-full space-y-6 overflow-hidden">
        {reviewContent}
      </TabsContent>
      <TabsContent value="admin" className="min-w-0 max-w-full space-y-6 overflow-hidden">
        {adminContent}
      </TabsContent>
    </Tabs>
  );
}
