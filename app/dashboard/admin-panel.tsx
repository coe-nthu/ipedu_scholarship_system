"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Save, Settings, Shield, Trash2, UserCheck } from "lucide-react";
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
import type { ScholarshipProgramSetting } from "@/lib/scholarship-settings";
import type { AuthorizedEmail, DashboardRole } from "@/lib/types";

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
      <DialogContent>
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
              <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    {program.is_visible ? (
                      <Eye className="size-4 text-emerald-600" />
                    ) : (
                      <EyeOff className="size-4 text-slate-400" />
                    )}
                    顯示於首頁
                  </span>
                  <Switch
                    checked={program.is_visible}
                    onCheckedChange={(checked) =>
                      updateProgram(program.program_key, {
                        is_visible: checked,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-700">
                    開放填寫
                  </span>
                  <Switch
                    checked={program.is_open}
                    onCheckedChange={(checked) =>
                      updateProgram(program.program_key, { is_open: checked })
                    }
                  />
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
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AdminPanel() {
  const [entries, setEntries] = useState<AuthorizedEmail[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch authorized emails on mount
  useEffect(() => {
    fetch("/api/dashboard/authorized-emails")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEntries(data.entries);
        } else {
          toast.error(data.error || "載入授權名單失敗。");
        }
      })
      .catch(() => toast.error("載入授權名單失敗。"))
      .finally(() => setLoading(false));
  }, []);

  // Add email
  const handleAdd = useCallback((email: string, role: DashboardRole) => {
    fetch("/api/dashboard/authorized-emails", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEntries((prev) => [...prev, data.entry]);
          toast.success(`已新增 ${email}`);
        } else {
          toast.error(data.error || "新增失敗。");
        }
      })
      .catch(() => toast.error("新增失敗。"));
  }, []);

  // Update role
  const handleRoleChange = useCallback(
    (id: string, newRole: DashboardRole) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, role: newRole } : e))
      );

      fetch("/api/dashboard/authorized-emails", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, role: newRole }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            // Revert
            setEntries((prev) =>
              prev.map((e) => {
                if (e.id === id) {
                  const oldRole = newRole === "admin" ? "teacher" : "admin";
                  return { ...e, role: oldRole };
                }
                return e;
              })
            );
            toast.error(data.error || "角色更新失敗。");
          } else {
            toast.success("角色已更新。");
          }
        })
        .catch(() => {
          setEntries((prev) =>
            prev.map((e) => {
              if (e.id === id) {
                const oldRole = newRole === "admin" ? "teacher" : "admin";
                return { ...e, role: oldRole };
              }
              return e;
            })
          );
          toast.error("角色更新失敗。");
        });
    },
    []
  );

  // Delete entry
  const handleDelete = useCallback((id: string) => {
    const entry = entries.find((e) => e.id === id);

    fetch("/api/dashboard/authorized-emails", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setEntries((prev) => prev.filter((e) => e.id !== id));
          toast.success(`已移除 ${entry?.email ?? ""}`);
        } else {
          toast.error(data.error || "刪除失敗。");
        }
      })
      .catch(() => toast.error("刪除失敗。"));
  }, [entries]);

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const emailPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            授權名單管理
          </h2>
          <p className="text-sm text-slate-500">
            共 {entries.length} 位授權使用者
          </p>
        </div>
        <AddEmailDialog onAdd={handleAdd} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Email</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>新增時間</TableHead>
              <TableHead className="w-[80px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-slate-400 py-8"
                >
                  尚無授權 Email
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-sm">
                    {entry.email}
                  </TableCell>
                  <TableCell>
                    <RoleSelect
                      role={entry.role}
                      onRoleChange={(r) => handleRoleChange(entry.id, r)}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {new Date(entry.created_at).toLocaleDateString("zh-TW")}
                  </TableCell>
                  <TableCell>
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
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>確認移除授權</AlertDialogTitle>
                          <AlertDialogDescription>
                            確定要將 {entry.email} 從授權名單中移除嗎？
                            移除後該帳號將無法存取審查面板。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={() => handleDelete(entry.id)}
                          >
                            確認移除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <Tabs defaultValue="programs" className="space-y-4">
      <TabsList className="h-10 w-fit">
        <TabsTrigger value="programs" className="gap-1.5 text-sm">
          <Settings className="size-4" />
          獎學金設定
        </TabsTrigger>
        <TabsTrigger value="emails" className="gap-1.5 text-sm">
          <Shield className="size-4" />
          授權名單
        </TabsTrigger>
      </TabsList>
      <TabsContent value="programs" className="space-y-4">
        <ScholarshipProgramsPanel />
      </TabsContent>
      <TabsContent value="emails" className="space-y-4">
        {emailPanel}
      </TabsContent>
    </Tabs>
  );
}
