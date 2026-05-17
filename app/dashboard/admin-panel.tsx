"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Shield, Trash2, UserCheck } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  return (
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
}
