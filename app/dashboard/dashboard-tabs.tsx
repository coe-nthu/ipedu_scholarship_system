"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DashboardTabs({
  reviewContent,
  adminContent,
}: {
  reviewContent: ReactNode;
  adminContent: ReactNode;
}) {
  return (
    <Tabs defaultValue={0}>
      <TabsList className="w-full max-w-xs h-10">
        <TabsTrigger value={0} className="text-sm px-4">
          審查列表
        </TabsTrigger>
        <TabsTrigger value={1} className="text-sm px-4">
          權限管理
        </TabsTrigger>
      </TabsList>
      <TabsContent value={0}>{reviewContent}</TabsContent>
      <TabsContent value={1}>{adminContent}</TabsContent>
    </Tabs>
  );
}
