"use client";

import type { FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import type { User } from "@supabase/supabase-js";
import {
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Plus,
  Trash2,
  UserCircle,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MAX_NOTIFICATION_EMAILS,
  validateNotificationEmails,
} from "@/lib/notification-emails";
import { createClient } from "@/lib/supabase/client";

function getSiteOrigin() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    window.location.origin
  );
}

export function AuthButton({
  dashboardIdentity,
}: {
  dashboardIdentity?: { displayName: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [notificationEmails, setNotificationEmails] = useState<string[]>([""]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationSuccess, setNotificationSuccess] = useState("");

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const signInWithGoogle = () => {
    setErrorMessage("");
    startTransition(async () => {
      const supabase = createClient();
      const next = pathname || "/";
      const redirectTo = `${getSiteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        setErrorMessage(error.message);
      }
    });
  };

  const signOut = () => {
    setErrorMessage("");
    startTransition(async () => {
      if (dashboardIdentity) {
        const response = await fetch("/api/dashboard/logout", {
          method: "POST",
        });

        if (!response.ok) {
          setErrorMessage("登出失敗，請稍後再試。");
          return;
        }

        router.push("/dashboard/login");
        router.refresh();
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setUser(null);
      router.refresh();
    });
  };

  const resetPasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage("");
    setPasswordSuccess("");
  };

  const handlePasswordDialogChange = (open: boolean) => {
    setPasswordDialogOpen(open);
    if (!open) resetPasswordForm();
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordSuccess("");
    setPasswordSaving(true);

    try {
      const response = await fetch("/api/dashboard/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmPassword,
          currentPassword,
          newPassword,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || !result.success) {
        setPasswordMessage(result.error || "密碼更新失敗，請重試。");
        return;
      }

      setPasswordSuccess("密碼已更新。");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      window.setTimeout(() => {
        setPasswordDialogOpen(false);
        setPasswordSuccess("");
      }, 900);
      router.refresh();
    } catch {
      setPasswordMessage("密碼更新失敗，請重試。");
    } finally {
      setPasswordSaving(false);
    }
  };

  // 永遠留一列空白輸入框，讓「還沒設定」的狀態可以直接開始打字。
  const toEmailRows = (emails: string[]) => (emails.length ? emails : [""]);

  const handleNotificationDialogChange = (open: boolean) => {
    setNotificationDialogOpen(open);
    setNotificationMessage("");
    setNotificationSuccess("");

    if (!open) {
      setNotificationEmails([""]);
      return;
    }

    setNotificationLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/dashboard/notification-emails");
        const result = (await response.json()) as {
          error?: string;
          notificationEmails?: string[];
          success?: boolean;
        };

        if (!response.ok || !result.success) {
          setNotificationMessage(result.error || "讀取通知信箱失敗，請重試。");
          return;
        }

        setNotificationEmails(toEmailRows(result.notificationEmails ?? []));
      } catch {
        setNotificationMessage("讀取通知信箱失敗，請重試。");
      } finally {
        setNotificationLoading(false);
      }
    })();
  };

  const updateNotificationEmail = (index: number, value: string) =>
    setNotificationEmails((prev) =>
      prev.map((email, i) => (i === index ? value : email))
    );

  const removeNotificationEmail = (index: number) =>
    setNotificationEmails((prev) =>
      toEmailRows(prev.filter((_, i) => i !== index))
    );

  const addNotificationEmail = () =>
    setNotificationEmails((prev) =>
      prev.length >= MAX_NOTIFICATION_EMAILS ? prev : [...prev, ""]
    );

  const saveNotificationEmails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotificationMessage("");
    setNotificationSuccess("");

    // 先在本地擋掉明顯的錯誤，伺服器仍會再驗一次。
    const validation = validateNotificationEmails(notificationEmails);
    if (!validation.ok) {
      setNotificationMessage(validation.error);
      return;
    }

    setNotificationSaving(true);
    try {
      const response = await fetch("/api/dashboard/notification-emails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notificationEmails: validation.emails }),
      });
      const result = (await response.json()) as {
        error?: string;
        notificationEmails?: string[];
        success?: boolean;
      };

      if (!response.ok || !result.success) {
        setNotificationMessage(result.error || "通知信箱更新失敗，請重試。");
        return;
      }

      const saved = result.notificationEmails ?? [];
      setNotificationEmails(toEmailRows(saved));
      setNotificationSuccess(
        saved.length
          ? "通知信箱已更新。"
          : "已清空通知信箱，將不再收到通知。"
      );
      window.setTimeout(() => {
        setNotificationDialogOpen(false);
        setNotificationSuccess("");
      }, 900);
    } catch {
      setNotificationMessage("通知信箱更新失敗，請重試。");
    } finally {
      setNotificationSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {dashboardIdentity ? (
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <UserCircle className="size-4" />
            <span className="max-w-56 truncate">
              {dashboardIdentity.displayName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPasswordDialogOpen(true)}
              disabled={isPending}
            >
              <KeyRound className="size-4" />
              修改密碼
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleNotificationDialogChange(true)}
              disabled={isPending}
            >
              <Mail className="size-4" />
              通知信箱
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={isPending}
            >
              <LogOut className="size-4" />
              登出
            </Button>
          </div>
          <Dialog
            open={passwordDialogOpen}
            onOpenChange={handlePasswordDialogChange}
          >
            <DialogContent className="bg-white text-slate-900 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>修改後台密碼</DialogTitle>
                <DialogDescription>
                  請先輸入目前密碼，再設定新的登入密碼。
                </DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={changePassword}>
                <div className="space-y-2">
                  <label
                    htmlFor="dashboard-current-password"
                    className="text-sm font-medium text-slate-700"
                  >
                    目前密碼
                  </label>
                  <Input
                    id="dashboard-current-password"
                    autoComplete="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) =>
                      setCurrentPassword(event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="dashboard-new-password"
                    className="text-sm font-medium text-slate-700"
                  >
                    新密碼
                  </label>
                  <Input
                    id="dashboard-new-password"
                    autoComplete="new-password"
                    minLength={8}
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="dashboard-confirm-password"
                    className="text-sm font-medium text-slate-700"
                  >
                    確認新密碼
                  </label>
                  <Input
                    id="dashboard-confirm-password"
                    autoComplete="new-password"
                    minLength={8}
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    required
                  />
                </div>
                {passwordMessage ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {passwordMessage}
                  </p>
                ) : null}
                {passwordSuccess ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {passwordSuccess}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={passwordSaving}
                    onClick={() => handlePasswordDialogChange(false)}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={passwordSaving}>
                    {passwordSaving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    更新密碼
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog
            open={notificationDialogOpen}
            onOpenChange={handleNotificationDialogChange}
          >
            <DialogContent className="bg-white text-slate-900 sm:max-w-md">
              <DialogHeader>
                <DialogTitle>設定通知信箱</DialogTitle>
                <DialogDescription>
                  學生補正或修改後重新送出申請時，系統會寄通知信到以下信箱，提醒貴系所重新審核。最多可設定{" "}
                  {MAX_NOTIFICATION_EMAILS} 組。
                </DialogDescription>
              </DialogHeader>
              {notificationLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-4 animate-spin text-slate-400" />
                </div>
              ) : (
                <form className="space-y-4" onSubmit={saveNotificationEmails}>
                  <div className="space-y-2">
                    {notificationEmails.map((email, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          autoComplete="email"
                          placeholder="dept@nthu.edu.tw"
                          type="email"
                          value={email}
                          onChange={(event) =>
                            updateNotificationEmail(index, event.target.value)
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="移除信箱"
                          disabled={notificationSaving}
                          onClick={() => removeNotificationEmail(index)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      notificationSaving ||
                      notificationEmails.length >= MAX_NOTIFICATION_EMAILS
                    }
                    onClick={addNotificationEmail}
                  >
                    <Plus className="size-4" />
                    新增信箱
                  </Button>
                  <p className="text-xs text-slate-500">
                    全部留空即代表關閉通知。此信箱與「忘記密碼」的重設信箱是分開的。
                  </p>
                  {notificationMessage ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {notificationMessage}
                    </p>
                  ) : null}
                  {notificationSuccess ? (
                    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      {notificationSuccess}
                    </p>
                  ) : null}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={notificationSaving}
                      onClick={() => handleNotificationDialogChange(false)}
                    >
                      取消
                    </Button>
                    <Button type="submit" disabled={notificationSaving}>
                      {notificationSaving ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Mail className="size-4" />
                      )}
                      儲存
                    </Button>
                  </div>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </div>
      ) : user ? (
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <UserCircle className="size-4" />
            <span className="max-w-56 truncate">{user.email}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={signOut}
            disabled={isPending}
          >
            <LogOut className="size-4" />
            登出
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="bg-[#1f6f78] text-white hover:bg-[#185d65]"
          onClick={signInWithGoogle}
          disabled={isPending}
        >
          <LogIn className="size-4" />
          使用 Google 登入
        </Button>
      )}
      {errorMessage ? (
        <p className="max-w-72 text-sm leading-6 text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
