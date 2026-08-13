"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Loader2, Mail, Plus, Trash2 } from "lucide-react";
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

/**
 * 「通知信箱」設定按鈕與對話框。
 *
 * 系所帳號看不到 AdminPanel，所以這是它們唯一的自助入口。只在後台 header 使用
 * （帳密與 Google 登入的教師／管理員都適用），學生頁面的 AuthButton 不會渲染它。
 */
export function NotificationEmailsButton({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState("");

  // 永遠留一列空白輸入框，讓「還沒設定」的狀態可以直接開始打字。
  const toEmailRows = (values: string[]) => (values.length ? values : [""]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setMessage("");
    setSuccess("");

    if (!next) {
      setEmails([""]);
      return;
    }

    setLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/dashboard/notification-emails");
        const result = (await response.json()) as {
          error?: string;
          notificationEmails?: string[];
          success?: boolean;
        };

        if (!response.ok || !result.success) {
          setMessage(result.error || "讀取通知信箱失敗，請重試。");
          return;
        }

        setEmails(toEmailRows(result.notificationEmails ?? []));
      } catch {
        setMessage("讀取通知信箱失敗，請重試。");
      } finally {
        setLoading(false);
      }
    })();
  };

  const updateEmail = (index: number, value: string) =>
    setEmails((prev) => prev.map((email, i) => (i === index ? value : email)));

  const removeEmail = (index: number) =>
    setEmails((prev) => toEmailRows(prev.filter((_, i) => i !== index)));

  const addEmail = () =>
    setEmails((prev) =>
      prev.length >= MAX_NOTIFICATION_EMAILS ? prev : [...prev, ""]
    );

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    // 先在本地擋掉明顯的錯誤，伺服器仍會再驗一次。
    const validation = validateNotificationEmails(emails);
    if (!validation.ok) {
      setMessage(validation.error);
      return;
    }

    setSaving(true);
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
        setMessage(result.error || "通知信箱更新失敗，請重試。");
        return;
      }

      const saved = result.notificationEmails ?? [];
      setEmails(toEmailRows(saved));
      setSuccess(
        saved.length ? "通知信箱已更新。" : "已清空通知信箱，將不再收到通知。"
      );
      window.setTimeout(() => {
        setOpen(false);
        setSuccess("");
      }, 900);
    } catch {
      setMessage("通知信箱更新失敗，請重試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        disabled={disabled}
      >
        <Mail className="size-4" />
        通知信箱
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-white text-slate-900 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>設定通知信箱</DialogTitle>
            <DialogDescription>
              學生補正或修改後重新送出申請時，系統會寄通知信到以下信箱，提醒您重新審核。最多可設定{" "}
              {MAX_NOTIFICATION_EMAILS} 組。
            </DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-slate-400" />
            </div>
          ) : (
            <form className="space-y-4" onSubmit={save}>
              <div className="space-y-2">
                {emails.map((email, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      autoComplete="email"
                      placeholder="dept@nthu.edu.tw"
                      type="email"
                      value={email}
                      onChange={(event) =>
                        updateEmail(index, event.target.value)
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="移除信箱"
                      disabled={saving}
                      onClick={() => removeEmail(index)}
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
                disabled={saving || emails.length >= MAX_NOTIFICATION_EMAILS}
                onClick={addEmail}
              >
                <Plus className="size-4" />
                新增信箱
              </Button>
              <p className="text-xs text-slate-500">
                全部留空即代表關閉通知。此信箱與登入用的帳號／重設密碼信箱是分開的，可填系辦共用信箱。
              </p>
              {message ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {message}
                </p>
              ) : null}
              {success ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {success}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? (
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
    </>
  );
}
