"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Database,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  Trash2,
  Upload,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  DEPARTMENT_GROUP_KEYS,
  DEPARTMENT_GROUP_LABELS,
  groupKeysToScope,
  scopeToGroupKeys,
  type DepartmentGroupKey,
} from "@/lib/departments";
import { cn } from "@/lib/utils";
import type { ScholarshipProgramSetting } from "@/lib/scholarship-settings";
import type {
  DashboardAccountEntry,
  DashboardDepartmentScope,
  DashboardRole,
  JournalIndexImportSummary,
  JournalIndexRecord,
} from "@/lib/types";

/* ------------------------------------------------------------------ */
/*  Role badge                                                         */
/* ------------------------------------------------------------------ */

const ROLE_CONFIG: Record<
  DashboardRole,
  { label: string; icon: typeof Shield; className: string }
> = {
  admin: {
    label: "管理員",
    icon: Shield,
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  teacher: {
    label: "教師",
    icon: UserCheck,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

function RoleBadge({ role }: { role: DashboardRole }) {
  const config = ROLE_CONFIG[role];
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${config.className}`}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Role selector dropdown                                             */
/* ------------------------------------------------------------------ */

function RoleSelect({
  role,
  onRoleChange,
}: {
  role: DashboardRole;
  onRoleChange: (r: DashboardRole) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        <RoleBadge role={role} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="bg-white min-w-[140px]">
        {(["teacher", "admin"] as const).map((r) => {
          const config = ROLE_CONFIG[r];
          const Icon = config.icon;
          return (
            <DropdownMenuItem
              key={r}
              className={`text-xs gap-2 cursor-pointer ${r === role ? "font-semibold" : ""}`}
              onClick={() => onRoleChange(r)}
            >
              <Icon
                className={`size-3.5 ${r === role ? "opacity-100" : "opacity-50"}`}
              />
              {config.label}
              {r === role && (
                <span className="ml-auto text-emerald-600">✓</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  Add email dialog                                                   */
/* ------------------------------------------------------------------ */

function AddEmailDialog({ onAdd }: { onAdd: (email: string, role: DashboardRole) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DashboardRole>("teacher");
  const [open, setOpen] = useState(false);

  const handleSubmit = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      toast.error("請輸入 Email。");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("請輸入有效的 Email 格式。");
      return;
    }
    onAdd(trimmed, role);
    setEmail("");
    setRole("teacher");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" />
            新增授權 Email
          </Button>
        }
      />
      <DialogContent className="bg-white text-slate-900">
        <DialogHeader>
          <DialogTitle>新增授權 Email</DialogTitle>
          <DialogDescription>
            將此 Email 加入白名單後，該帳號登入即可存取教師審查面板。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <Input
              type="email"
              placeholder="teacher@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">角色</label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRole("teacher")}
                className={`gap-1.5 ${role === "teacher" ? "bg-emerald-100 border-emerald-400 text-emerald-800 hover:bg-emerald-200" : "text-slate-500"}`}
              >
                <UserCheck className="size-3.5" />
                教師
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRole("admin")}
                className={`gap-1.5 ${role === "admin" ? "bg-violet-100 border-violet-400 text-violet-800 hover:bg-violet-200" : "text-slate-500"}`}
              >
                <Shield className="size-3.5" />
                管理員
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button onClick={handleSubmit}>確認新增</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Scholarship program settings                                       */
/* ------------------------------------------------------------------ */

function ScholarshipProgramsPanel() {
  const [programs, setPrograms] = useState<ScholarshipProgramSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/scholarship-programs")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPrograms(data.programs);
        } else {
          toast.error(data.error || "載入獎學金設定失敗。");
        }
      })
      .catch(() => toast.error("載入獎學金設定失敗。"))
      .finally(() => setLoading(false));
  }, []);

  const updateProgram = useCallback(
    (
      programKey: string,
      patch: Partial<ScholarshipProgramSetting>
    ) => {
      setPrograms((prev) =>
        prev.map((program) =>
          program.program_key === programKey ? { ...program, ...patch } : program
        )
      );
    },
    []
  );

  const handleSave = useCallback((program: ScholarshipProgramSetting) => {
    setSavingKey(program.program_key);
    fetch("/api/dashboard/scholarship-programs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(program),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setPrograms((prev) =>
            prev.map((item) =>
              item.program_key === data.program.program_key
                ? data.program
                : item
            )
          );
          toast.success("獎學金設定已更新。");
        } else {
          toast.error(data.error || "更新獎學金設定失敗。");
        }
      })
      .catch(() => toast.error("更新獎學金設定失敗。"))
      .finally(() => setSavingKey(null));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          獎學金介面設定
        </h2>
        <p className="text-sm text-slate-500">
          調整首頁卡片與表單頁文字；名稱異動不會批次改寫既有申請資料。
        </p>
      </div>

      <div className="grid gap-4">
        {programs.map((program) => (
          <div
            key={program.program_key}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">
                    {program.title}
                  </h3>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-500">
                    {program.program_key}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {program.route_path}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={savingKey === program.program_key}
                onClick={() => handleSave(program)}
              >
                <Save className="size-4" />
                {savingKey === program.program_key ? "儲存中" : "儲存"}
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  獎學金名稱
                </span>
                <Input
                  value={program.title}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      title: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  狀態標籤
                </span>
                <Input
                  value={program.status_label}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      status_label: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  適用對象
                </span>
                <Input
                  value={program.period}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      period: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  金額
                </span>
                <Input
                  value={program.amount}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      amount: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1.5 lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  首頁卡片說明
                </span>
                <Textarea
                  value={program.description}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      description: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1.5 lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  表單請領資格提醒
                </span>
                <Textarea
                  value={program.eligibility_reminder}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      eligibility_reminder: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  排序
                </span>
                <Input
                  type="number"
                  min={0}
                  max={9999}
                  value={program.display_order}
                  onChange={(event) =>
                    updateProgram(program.program_key, {
                      display_order: Number(event.target.value),
                    })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border p-3 transition-colors",
                    program.is_visible
                      ? "border-emerald-300 bg-emerald-50/60"
                      : "border-slate-200 bg-slate-50"
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    {program.is_visible ? (
                      <Eye className="size-4 text-emerald-600" />
                    ) : (
                      <EyeOff className="size-4 text-slate-400" />
                    )}
                    顯示於首頁
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        program.is_visible
                          ? "text-emerald-700"
                          : "text-slate-400"
                      )}
                    >
                      {program.is_visible ? "顯示中" : "已隱藏"}
                    </span>
                    <Switch
                      className="data-checked:bg-emerald-500 data-unchecked:bg-slate-300"
                      checked={program.is_visible}
                      onCheckedChange={(checked) =>
                        updateProgram(program.program_key, {
                          is_visible: checked,
                        })
                      }
                    />
                  </span>
                </label>
                <label
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-md border p-3 transition-colors",
                    program.is_open
                      ? "border-emerald-300 bg-emerald-50/60"
                      : "border-slate-200 bg-slate-50"
                  )}
                >
                  <span className="text-sm font-medium text-slate-700">
                    開放填寫
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        program.is_open ? "text-emerald-700" : "text-slate-400"
                      )}
                    >
                      {program.is_open ? "開放中" : "已關閉"}
                    </span>
                    <Switch
                      className="data-checked:bg-emerald-500 data-unchecked:bg-slate-300"
                      checked={program.is_open}
                      onCheckedChange={(checked) =>
                        updateProgram(program.program_key, { is_open: checked })
                      }
                    />
                  </span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Journal index import                                               */
/* ------------------------------------------------------------------ */

type JournalIndexState = {
  canUpload: boolean;
  count: number;
  latest: Pick<
    JournalIndexRecord,
    "created_at" | "source_file_name" | "uploaded_by"
  > | null;
  preview: JournalIndexRecord[];
};

function JournalIndexesPanel() {
  const [state, setState] = useState<JournalIndexState | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [query, setQuery] = useState("");
  const [lastSummary, setLastSummary] =
    useState<JournalIndexImportSummary | null>(null);

  const load = useCallback(() => {
    return fetch("/api/dashboard/journal-indexes?all=1")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setState({
            canUpload: Boolean(data.canUpload),
            count: Number(data.count ?? 0),
            latest: data.latest ?? null,
            preview: data.preview ?? [],
          });
        } else {
          toast.error(data.error || "載入期刊索引失敗。");
        }
      })
      .catch(() => toast.error("載入期刊索引失敗。"))
      .finally(() => setLoading(false));
  }, []);

  const refresh = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const records = useMemo(() => state?.preview ?? [], [state?.preview]);
  const filteredRecords = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return records;
    return records.filter((record) =>
      [
        record.journal_title,
        record.issn,
        record.eissn,
        record.edition,
        record.category,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(keyword))
    );
  }, [records, query]);

  const handleUpload = () => {
    if (selectedFiles.length === 0) {
      toast.error("請先選擇 CSV 檔案。");
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append("files", file));
    setUploading(true);
    setLastSummary(null);

    fetch("/api/dashboard/journal-indexes", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setLastSummary(data.summary);
          setSelectedFiles([]);
          toast.success(`已匯入 ${data.summary.count} 筆期刊索引。`);
          return load();
        }

        toast.error(data.error || "匯入期刊索引失敗。");
      })
      .catch(() => toast.error("匯入期刊索引失敗。"))
      .finally(() => setUploading(false));
  };

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">期刊索引</h2>
          <p className="text-sm text-slate-500">
            上傳 JCR JournalResults CSV，供學生 DOI 自動帶入與後台重新驗證使用。
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={refresh}>
          <RefreshCw className="size-4" />
          重新整理
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Database className="size-5 text-[#1f6f78]" />
            <div>
              <h3 className="font-semibold text-slate-900">目前索引狀態</h3>
              <p className="text-xs text-slate-500">
                共 {state?.count ?? 0} 筆
                {query.trim() ? `（符合搜尋 ${filteredRecords.length} 筆）` : ""}
                ；來源：{state?.latest?.source_file_name ?? "尚未匯入"}
              </p>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋期刊名稱、ISSN、Edition 或類別"
              className="pl-8"
            />
          </div>

          <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50">
                <TableRow>
                  <TableHead>期刊名稱</TableHead>
                  <TableHead className="w-28">ISSN</TableHead>
                  <TableHead className="w-28">eISSN</TableHead>
                  <TableHead className="w-24">Edition</TableHead>
                  <TableHead className="w-24">Quartile</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center text-slate-400"
                    >
                      {records.length === 0
                        ? "尚無期刊索引資料"
                        : "沒有符合搜尋的期刊"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record, index) => (
                    <TableRow
                      key={`${record.journal_title}-${record.issn}-${index}`}
                    >
                      <TableCell>
                        <div className="font-medium text-slate-900">
                          {record.journal_title}
                        </div>
                        {record.category ? (
                          <div className="text-xs text-slate-500">
                            {record.category}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{record.issn || "—"}</TableCell>
                      <TableCell>{record.eissn || "—"}</TableCell>
                      <TableCell>{record.edition}</TableCell>
                      <TableCell>{record.quartile || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-[#1f6f78]" />
            <h3 className="font-semibold text-slate-900">上傳 CSV</h3>
          </div>
          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={!state?.canUpload || uploading}
              onChange={(event) =>
                setSelectedFiles(Array.from(event.currentTarget.files ?? []))
              }
            />
            <p className="text-xs leading-5 text-slate-500">
              請使用 JCR 匯出的 JournalResults CSV，可一次選取多個 category
              CSV。匯入會合併去重並整批取代目前索引。
            </p>
            {selectedFiles.length > 0 ? (
              <p className="text-xs text-slate-500">
                已選擇 {selectedFiles.length} 個檔案
              </p>
            ) : null}
            <Button
              className="w-full gap-1.5 bg-[#1f6f78] hover:bg-[#185d65]"
              disabled={!state?.canUpload || uploading || selectedFiles.length === 0}
              onClick={handleUpload}
            >
              <Upload className="size-4" />
              {uploading ? "匯入中" : "匯入期刊索引"}
            </Button>
            {!state?.canUpload ? (
              <p className="text-xs text-amber-700">
                只有管理員可以上傳期刊索引。
              </p>
            ) : null}
          </div>

          {lastSummary ? (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">
                已匯入 {lastSummary.count} 筆期刊索引
              </p>
              <p className="mt-1 text-xs">
                檔案：{lastSummary.sourceFileName}；略過重複：
                {lastSummary.duplicatesSkipped} 筆
              </p>
              {lastSummary.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                  {lastSummary.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Account-type badge                                                 */
/* ------------------------------------------------------------------ */

function AccountKindBadge({ kind }: { kind: DashboardAccountEntry["kind"] }) {
  const config =
    kind === "password"
      ? {
          label: "帳密帳號",
          icon: KeyRound,
          className: "bg-sky-50 text-sky-700 border-sky-200",
        }
      : {
          label: "Google",
          icon: Mail,
          className: "bg-amber-50 text-amber-700 border-amber-200",
        };
  const Icon = config.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${config.className}`}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Department scope display + editor                                  */
/* ------------------------------------------------------------------ */

function ScopeBadges({ scope }: { scope: DashboardDepartmentScope }) {
  if (scope === "all") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
        <Building2 className="size-3" />
        全部系所
      </span>
    );
  }

  const keys = scopeToGroupKeys(scope);
  if (keys.length === 0) {
    return <span className="text-xs text-slate-400">未指定系所</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((key) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
        >
          <Building2 className="size-3" />
          {DEPARTMENT_GROUP_LABELS[key]}
        </span>
      ))}
    </div>
  );
}

function ScopeEditorDialog({
  account,
  onSave,
}: {
  account: DashboardAccountEntry;
  onSave: (scope: DashboardDepartmentScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<DepartmentGroupKey[]>(() =>
    scopeToGroupKeys(account.departmentScope)
  );

  // Reset selection to the current scope each time the dialog opens.
  const handleOpenChange = (next: boolean) => {
    if (next) setSelected(scopeToGroupKeys(account.departmentScope));
    setOpen(next);
  };

  const toggle = (key: DepartmentGroupKey, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((k) => k !== key)
    );
  };

  const allSelected = selected.length === DEPARTMENT_GROUP_KEYS.length;

  const handleSave = () => {
    onSave(groupKeysToScope(selected));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Pencil className="size-3.5" />
            編輯系所
          </Button>
        }
      />
      <DialogContent className="bg-white text-slate-900">
        <DialogHeader>
          <DialogTitle>編輯可審查系所</DialogTitle>
          <DialogDescription>
            設定「{account.displayName}」可審查的系所範圍。未勾選任何系所代表無可審查範圍。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="flex items-center gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelected(checked ? [...DEPARTMENT_GROUP_KEYS] : [])
              }
            />
            <span className="text-sm font-medium text-slate-800">
              全部系所
            </span>
          </label>
          <div className="grid gap-2">
            {DEPARTMENT_GROUP_KEYS.map((key) => (
              <label
                key={key}
                className="flex items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2"
              >
                <Checkbox
                  checked={selected.includes(key)}
                  onCheckedChange={(checked) => toggle(key, checked === true)}
                />
                <span className="text-sm text-slate-700">
                  {DEPARTMENT_GROUP_LABELS[key]}
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>取消</DialogClose>
          <Button onClick={handleSave}>儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function accountId(account: Pick<DashboardAccountEntry, "kind" | "key">) {
  return `${account.kind}:${account.key}`;
}

export function AdminPanel() {
  const [accounts, setAccounts] = useState<DashboardAccountEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccounts = useCallback(() => {
    return fetch("/api/dashboard/accounts")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAccounts(data.accounts);
        } else {
          toast.error(data.error || "載入帳號失敗。");
        }
      })
      .catch(() => toast.error("載入帳號失敗。"));
  }, []);

  useEffect(() => {
    loadAccounts().finally(() => setLoading(false));
  }, [loadAccounts]);

  // Add a Google authorized email, then refresh the unified list.
  const handleAdd = useCallback(
    (email: string, role: DashboardRole) => {
      fetch("/api/dashboard/authorized-emails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            toast.success(`已新增 ${email}`);
            return loadAccounts();
          }
          toast.error(data.error || "新增失敗。");
        })
        .catch(() => toast.error("新增失敗。"));
    },
    [loadAccounts]
  );

  // Optimistically patch an account, reverting on failure.
  const patchAccount = useCallback(
    (
      account: DashboardAccountEntry,
      patch: Partial<Pick<DashboardAccountEntry, "role" | "departmentScope">>,
      body: Record<string, unknown>,
      successMessage: string
    ) => {
      const id = accountId(account);
      const previous = account;
      setAccounts((prev) =>
        prev.map((a) => (accountId(a) === id ? { ...a, ...patch } : a))
      );

      const revert = () =>
        setAccounts((prev) =>
          prev.map((a) => (accountId(a) === id ? previous : a))
        );

      fetch("/api/dashboard/accounts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: account.kind,
          key: account.key,
          ...body,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            toast.success(successMessage);
          } else {
            revert();
            toast.error(data.error || "更新失敗。");
          }
        })
        .catch(() => {
          revert();
          toast.error("更新失敗。");
        });
    },
    []
  );

  const handleRoleChange = useCallback(
    (account: DashboardAccountEntry, newRole: DashboardRole) => {
      if (newRole === account.role) return;
      patchAccount(
        account,
        { role: newRole },
        { role: newRole },
        "角色已更新。"
      );
    },
    [patchAccount]
  );

  const handleScopeChange = useCallback(
    (account: DashboardAccountEntry, newScope: DashboardDepartmentScope) => {
      patchAccount(
        account,
        { departmentScope: newScope },
        { departmentScope: newScope },
        "系所範圍已更新。"
      );
    },
    [patchAccount]
  );

  // Delete a Google authorized email (password accounts are not deletable here).
  const handleDelete = useCallback((account: DashboardAccountEntry) => {
    fetch("/api/dashboard/authorized-emails", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: account.key }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setAccounts((prev) =>
            prev.filter((a) => accountId(a) !== accountId(account))
          );
          toast.success(`已移除 ${account.label}`);
        } else {
          toast.error(data.error || "刪除失敗。");
        }
      })
      .catch(() => toast.error("刪除失敗。"));
  }, []);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const passwordCount = accounts.filter((a) => a.kind === "password").length;
  const googleCount = accounts.filter((a) => a.kind === "google").length;

  const accountsPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            帳號與權限管理
          </h2>
          <p className="text-sm text-slate-500">
            帳密帳號 {passwordCount} 個 · Google 帳號 {googleCount} 個
          </p>
        </div>
        <AddEmailDialog onAdd={handleAdd} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>類型</TableHead>
              <TableHead>帳號</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>可審查系所</TableHead>
              <TableHead className="w-[80px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-slate-400 py-8"
                >
                  尚無帳號
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => (
                <TableRow key={accountId(account)}>
                  <TableCell>
                    <AccountKindBadge kind={account.kind} />
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm text-slate-800">
                      {account.label}
                    </div>
                    {account.kind === "password" &&
                      account.displayName !== account.label && (
                        <div className="text-xs text-slate-400">
                          {account.displayName}
                        </div>
                      )}
                  </TableCell>
                  <TableCell>
                    <RoleSelect
                      role={account.role}
                      onRoleChange={(r) => handleRoleChange(account, r)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ScopeBadges scope={account.departmentScope} />
                      <ScopeEditorDialog
                        account={account}
                        onSave={(scope) => handleScopeChange(account, scope)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    {account.kind === "google" ? (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          }
                        />
                        <AlertDialogContent className="bg-white text-slate-900">
                          <AlertDialogHeader>
                            <AlertDialogTitle>確認移除授權</AlertDialogTitle>
                            <AlertDialogDescription>
                              確定要將 {account.label} 從授權名單中移除嗎？
                              移除後該帳號將無法存取審查面板。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => handleDelete(account)}
                            >
                              確認移除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-slate-400">
        帳密帳號的新增與密碼設定由系統 script 管理，此處僅能調整其角色與系所範圍。
      </p>
    </div>
  );

  return (
    <Tabs defaultValue="programs" className="space-y-4">
      <TabsList className="h-10 w-fit">
        <TabsTrigger value="programs" className="gap-1.5 text-sm">
          <Settings className="size-4" />
          獎學金設定
        </TabsTrigger>
        <TabsTrigger value="journal-indexes" className="gap-1.5 text-sm">
          <Database className="size-4" />
          期刊索引
        </TabsTrigger>
        <TabsTrigger value="accounts" className="gap-1.5 text-sm">
          <Shield className="size-4" />
          帳號與權限
        </TabsTrigger>
      </TabsList>
      <TabsContent value="programs" className="space-y-4">
        <ScholarshipProgramsPanel />
      </TabsContent>
      <TabsContent value="journal-indexes" className="space-y-4">
        <JournalIndexesPanel />
      </TabsContent>
      <TabsContent value="accounts" className="space-y-4">
        {accountsPanel}
      </TabsContent>
    </Tabs>
  );
}
