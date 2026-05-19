"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ScholarshipApplication } from "@/lib/types";
import { DashboardTable } from "./dashboard-table";

const ALL_PROGRAMS_VALUE = "all";

const scholarshipPrograms = [
  "國科會-培育優秀博士生獎學金",
  "國科會-博士生研究獎助學金(適用114學年度入學新生)",
  "校長獎學金 (新生獎學金)",
  "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)",
] as const;

function getProgramLabel(program: string) {
  switch (program) {
    case "國科會-培育優秀博士生獎學金":
      return "國科會培優";
    case "國科會-博士生研究獎助學金(適用114學年度入學新生)":
      return "國科會研究獎助";
    case "校長獎學金 (新生獎學金)":
      return "校長獎學金";
    case "教育部-博士生獎學金(適用114學年度博士班1至3年級學生)":
      return "教育部博士生";
    default:
      return program;
  }
}

function ProgramCount({
  count,
  selected,
}: {
  count: number;
  selected?: boolean;
}) {
  return (
    <span
      className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] ${
        selected
          ? "bg-white/20 text-current"
          : "bg-slate-100 text-slate-500"
      }`}
    >
      {count}
    </span>
  );
}

export function ScholarshipProgramSwitcher({
  applications,
}: {
  applications: ScholarshipApplication[];
}) {
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const application of applications) {
      const program = application.scholarship_program || "";
      map.set(program, (map.get(program) ?? 0) + 1);
    }
    return map;
  }, [applications]);

  return (
    <Tabs defaultValue={ALL_PROGRAMS_VALUE} className="space-y-4">
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
        <TabsTrigger
          value={ALL_PROGRAMS_VALUE}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm data-[state=active]:border-[#1f6f78] data-[state=active]:bg-[#1f6f78] data-[state=active]:text-white"
        >
          全部
          <ProgramCount count={applications.length} />
        </TabsTrigger>
        {scholarshipPrograms.map((program) => (
          <TabsTrigger
            key={program}
            value={program}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm data-[state=active]:border-[#1f6f78] data-[state=active]:bg-[#1f6f78] data-[state=active]:text-white"
          >
            {getProgramLabel(program)}
            <ProgramCount count={counts.get(program) ?? 0} />
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value={ALL_PROGRAMS_VALUE}>
        <DashboardTable applications={applications} />
      </TabsContent>
      {scholarshipPrograms.map((program) => {
        const filteredApplications = applications.filter(
          (application) => application.scholarship_program === program
        );

        return (
          <TabsContent key={program} value={program}>
            <DashboardTable
              key={program}
              applications={filteredApplications}
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
