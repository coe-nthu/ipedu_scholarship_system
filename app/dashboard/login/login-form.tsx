"use client";

import type { FormEvent } from "react";
import { useState, useTransition } from "react";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DashboardLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");

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
        setMessage(result.error || "登入失敗，請重新確認帳密。");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    });
  };

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
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
    </form>
  );
}
