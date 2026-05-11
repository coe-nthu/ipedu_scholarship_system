"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Clock,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReviewStatus, ScholarshipApplication } from "@/lib/types";
import { REVIEW_STATUS_LABELS } from "@/lib/types";
import { ApplicationDetail } from "./application-detail";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SortColumn =
  | "rowNumber"
  | "department"
  | "studentId"
  | "name"
  | "gpa"
  | "journalCount"
  | "conferenceCount";

type SortDirection = "asc" | "desc";

type DashboardRow = {
  rowNumber: number;
  application: ScholarshipApplication;
  department: string;
  studentId: string;
  name: string;
  gpa: number | null;
  completedCredits: string;
  journalCount: number;
  conferenceCount: number;
  studyStatus: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const REMARKS_STORAGE_KEY = "dashboard_remarks";

function loadRemarks(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(REMARKS_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveRemarks(remarks: Record<string, string>) {
  localStorage.setItem(REMARKS_STORAGE_KEY, JSON.stringify(remarks));
}

function toRows(apps: ScholarshipApplication[]): DashboardRow[] {
  return apps.map((app, idx) => ({
    rowNumber: idx + 1,
    application: app,
    department: app.department,
    studentId: app.student_id,
    name: app.applicant_name,
    gpa: app.gpa,
    completedCredits:
      app.payload.academicPerformance?.completedCredits ?? "",
    journalCount: app.payload.journals?.length ?? 0,
    conferenceCount: app.payload.conferences?.length ?? 0,
    studyStatus: app.payload.applicantInfo?.studyStatus ?? "",
  }));
}

function comparePrimitive(
  a: string | number | null,
  b: string | number | null,
  dir: SortDirection,
): number {
  const factor = dir === "asc" ? 1 : -1;
  if (a == null && b == null) return 0;
  if (a == null) return factor;
  if (b == null) return -factor;
  if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
  return String(a).localeCompare(String(b), "zh-Hant") * factor;
}

/* ------------------------------------------------------------------ */
/*  Review status badge                                                */
/* ------------------------------------------------------------------ */

const REVIEW_STATUS_CONFIG: Record<
  ReviewStatus,
  { icon: typeof CheckCircle2; className: string }
> = {
  auto_verified: {
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  pending_manual: {
    icon: Clock,
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  manual_verified: {
    icon: CircleDot,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  data_error: {
    icon: CircleAlert,
    className: "bg-red-50 text-red-700 border-red-200",
  },
};

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const config = REVIEW_STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${config.className}`}
    >
      <Icon className="size-3" />
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Sort icon                                                          */
/* ------------------------------------------------------------------ */

function SortIcon({
  column,
  current,
  direction,
}: {
  column: SortColumn;
  current: SortColumn;
  direction: SortDirection;
}) {
  if (column !== current)
    return <ArrowUpDown className="ml-1 inline-block size-3.5 opacity-40" />;
  return direction === "asc" ? (
    <ArrowUp className="ml-1 inline-block size-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline-block size-3.5" />
  );
}

/* ------------------------------------------------------------------ */
/*  Editable remark cell                                               */
/* ------------------------------------------------------------------ */

function RemarkCell({
  appId,
  value,
  onChange,
}: {
  appId: string;
  value: string;
  onChange: (id: string, val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    if (draft !== value) onChange(appId, draft);
  }, [appId, draft, value, onChange]);

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full text-left text-xs text-slate-500 hover:text-slate-800 transition-colors min-h-[24px] rounded px-1 -mx-1 hover:bg-slate-50"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="點擊編輯備註"
      >
        {value || <span className="text-slate-300 italic">點擊新增備註</span>}
      </button>
    );
  }

  return (
    <Input
      ref={inputRef}
      className="h-7 text-xs min-w-[100px]"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardTable({
  applications,
}: {
  applications: ScholarshipApplication[];
}) {
  const [sortColumn, setSortColumn] = useState<SortColumn>("rowNumber");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedApp, setSelectedApp] =
    useState<ScholarshipApplication | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  // Load remarks from localStorage on mount
  useEffect(() => {
    setRemarks(loadRemarks());
  }, []);

  const handleRemarkChange = useCallback(
    (id: string, value: string) => {
      setRemarks((prev) => {
        const next = { ...prev, [id]: value };
        saveRemarks(next);
        return next;
      });
    },
    [],
  );

  const rows = useMemo(() => toRows(applications), [applications]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      switch (sortColumn) {
        case "rowNumber":
          return comparePrimitive(a.rowNumber, b.rowNumber, sortDirection);
        case "department":
          return comparePrimitive(a.department, b.department, sortDirection);
        case "studentId":
          return comparePrimitive(a.studentId, b.studentId, sortDirection);
        case "name":
          return comparePrimitive(a.name, b.name, sortDirection);
        case "gpa":
          return comparePrimitive(a.gpa, b.gpa, sortDirection);
        case "journalCount":
          return comparePrimitive(
            a.journalCount,
            b.journalCount,
            sortDirection,
          );
        case "conferenceCount":
          return comparePrimitive(
            a.conferenceCount,
            b.conferenceCount,
            sortDirection,
          );
        default:
          return 0;
      }
    });
  }, [rows, sortColumn, sortDirection]);

  function handleSort(col: SortColumn) {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  }

  const thClass =
    "cursor-pointer select-none hover:bg-slate-100 transition-colors";

  return (
    <>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            {/* ── Row 1: grouped header ── */}
            <TableRow className="bg-slate-50">
              <TableHead
                rowSpan={2}
                className={thClass}
                onClick={() => handleSort("rowNumber")}
              >
                編號
                <SortIcon
                  column="rowNumber"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
              <TableHead rowSpan={2}>備註</TableHead>
              <TableHead
                rowSpan={2}
                className={thClass}
                onClick={() => handleSort("department")}
              >
                系所
                <SortIcon
                  column="department"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
              <TableHead
                rowSpan={2}
                className={thClass}
                onClick={() => handleSort("studentId")}
              >
                學號
                <SortIcon
                  column="studentId"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
              <TableHead
                rowSpan={2}
                className={thClass}
                onClick={() => handleSort("name")}
              >
                姓名
                <SortIcon
                  column="name"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
              <TableHead
                rowSpan={2}
                className={thClass}
                onClick={() => handleSort("gpa")}
              >
                累計GPA（學分數）
                <SortIcon
                  column="gpa"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
              <TableHead colSpan={2} className="text-center border-b-0">
                <div>學術表現</div>
                <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                  新生統計五年內、非新生過去一年內
                </div>
              </TableHead>
              <TableHead rowSpan={2}>文獻真實性審核</TableHead>
              <TableHead rowSpan={2}>審查資料</TableHead>
            </TableRow>

            {/* ── Row 2: sub-headers for 學術表現 ── */}
            <TableRow className="bg-slate-50">
              <TableHead
                className={thClass}
                onClick={() => handleSort("journalCount")}
              >
                期刊（累計）
                <SortIcon
                  column="journalCount"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
              <TableHead
                className={thClass}
                onClick={() => handleSort("conferenceCount")}
              >
                研討會（累計）
                <SortIcon
                  column="conferenceCount"
                  current={sortColumn}
                  direction={sortDirection}
                />
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {sortedRows.map((row) => (
              <TableRow key={row.application.id}>
                <TableCell className="text-center font-medium">
                  {row.rowNumber}
                </TableCell>
                <TableCell>
                  <RemarkCell
                    appId={row.application.id}
                    value={remarks[row.application.id] ?? ""}
                    onChange={handleRemarkChange}
                  />
                </TableCell>
                <TableCell>{row.department}</TableCell>
                <TableCell className="font-mono text-xs">
                  {row.studentId}
                </TableCell>
                <TableCell>
                  <button
                    type="button"
                    className="text-emerald-700 underline underline-offset-2 decoration-emerald-300 hover:text-emerald-900 hover:decoration-emerald-600 transition-colors font-medium"
                    onClick={() => setSelectedApp(row.application)}
                  >
                    {row.name}
                  </button>
                </TableCell>
                <TableCell>
                  {row.gpa != null ? (
                    <>
                      {row.gpa.toFixed(2)}
                      <span className="text-slate-400 ml-0.5 text-xs">
                        （{row.completedCredits}）
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={row.journalCount > 0 ? "default" : "secondary"}
                  >
                    {row.journalCount}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={
                      row.conferenceCount > 0 ? "default" : "secondary"
                    }
                  >
                    {row.conferenceCount}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ReviewStatusBadge
                    status={row.application.review_status}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1"
                    onClick={() => setSelectedApp(row.application)}
                  >
                    <FileText className="size-3.5" />
                    附件
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ApplicationDetail
        application={selectedApp}
        open={selectedApp !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedApp(null);
        }}
      />
    </>
  );
}
