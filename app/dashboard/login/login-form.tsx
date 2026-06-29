"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { KeyRound, LogIn, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FormMode = "login" | "request-reset" | "confirm-reset";

export function DashboardLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<FormMode>("login");
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");
  const [isPending, startTransition] = useTransition();

  const showMessage = (kind: "error" | "success", value: string) => {
    setMessageKind(kind);
    setMessage(value);
  };

  const clearMessage = () => setMessage("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessage();

    startTransition(async () => {
      const response = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || !result.success) {
        showMessage("error", result.error || "登入失敗，請重新確認帳密。");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  };

  const handleRequestReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessage();

    startTransition(async () => {
      const response = await fetch("/api/dashboard/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recoveryEmail,
          username: resetUsername,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        success?: boolean;
      };

      if (!response.ok || !result.success) {
        showMessage("error", result.error || "驗證碼寄送失敗，請稍後再試。");
        return;
      }

      showMessage(
        "success",
        result.message || "若帳號與重設信箱正確，系統已寄出驗證碼。"
      );
      setMode("confirm-reset");
    });
  };

  const handleConfirmReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearMessage();

    startTransition(async () => {
      const response = await fetch("/api/dashboard/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: resetCode,
          confirmPassword,
          newPassword,
          recoveryEmail,
          username: resetUsername,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        message?: string;
        success?: boolean;
      };

      if (!response.ok || !result.success) {
        showMessage("error", result.error || "密碼重設失敗，請稍後再試。");
        return;
      }

      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setUsername(resetUsername);
      setMode("login");
      showMessage("success", result.message || "密碼已重設，請使用新密碼登入。");
    });
  };

  const messageClassName =
    messageKind === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";

  if (mode === "request-reset") {
    return (
      <form className="space-y-4" onSubmit={handleRequestReset}>
        <div className="space-y-2">
          <Label htmlFor="reset-username">帳號</Label>
          <Input
            id="reset-username"
            autoComplete="username"
            value={resetUsername}
            onChange={(event) => setResetUsername(event.target.value)}
            placeholder="college"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recovery-email">重設信箱</Label>
          <Input
            id="recovery-email"
            autoComplete="email"
            type="email"
            value={recoveryEmail}
            onChange={(event) => setRecoveryEmail(event.target.value)}
            required
          />
        </div>
        {message ? (
          <p className={`rounded-md border px-3 py-2 text-sm ${messageClassName}`}>
            {message}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full bg-[#1f6f78] text-white hover:bg-[#185d65]"
          disabled={isPending}
        >
          <Mail className="size-4" />
          {isPending ? "寄送中..." : "寄送驗證碼"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isPending}
          onClick={() => {
            setMode("login");
            clearMessage();
          }}
        >
          返回登入
        </Button>
      </form>
    );
  }

  if (mode === "confirm-reset") {
    return (
      <form className="space-y-4" onSubmit={handleConfirmReset}>
        <div className="space-y-2">
          <Label htmlFor="reset-code">驗證碼</Label>
          <Input
            id="reset-code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={resetCode}
            onChange={(event) => setResetCode(event.target.value)}
            placeholder="000000"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password">新密碼</Label>
          <Input
            id="new-password"
            autoComplete="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-new-password">確認新密碼</Label>
          <Input
            id="confirm-new-password"
            autoComplete="new-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
        {message ? (
          <p className={`rounded-md border px-3 py-2 text-sm ${messageClassName}`}>
            {message}
          </p>
        ) : null}
        <Button
          type="submit"
          className="w-full bg-[#1f6f78] text-white hover:bg-[#185d65]"
          disabled={isPending}
        >
          <KeyRound className="size-4" />
          {isPending ? "重設中..." : "重設密碼"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isPending}
          onClick={() => {
            setMode("request-reset");
            clearMessage();
          }}
        >
          重新寄送驗證碼
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="dashboard-username">帳號</Label>
        <Input
          id="dashboard-username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="college"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dashboard-password">密碼</Label>
        <Input
          id="dashboard-password"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {message ? (
        <p className={`rounded-md border px-3 py-2 text-sm ${messageClassName}`}>
          {message}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full bg-[#1f6f78] text-white hover:bg-[#185d65]"
        disabled={isPending}
      >
        <LogIn className="size-4" />
        {isPending ? "登入中..." : "登入審查面板"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full text-slate-600"
        disabled={isPending}
        onClick={() => {
          setResetUsername(username);
          setMode("request-reset");
          clearMessage();
        }}
      >
        忘記密碼？
      </Button>
    </form>
  );
}
