"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function DashboardTabs({
  headerContent,
  reviewContent,
  adminContent,
}: {
  headerContent: (sectionTabs: ReactNode) => ReactNode;
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
    <Tabs defaultValue="review" className="space-y-6">
      {headerContent(sectionTabs)}
      <TabsContent value="review" className="space-y-6">
        {reviewContent}
      </TabsContent>
      <TabsContent value="admin" className="space-y-6">
        {adminContent}
      </TabsContent>
    </Tabs>
  );
}
