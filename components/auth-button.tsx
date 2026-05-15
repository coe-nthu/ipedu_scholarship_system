"use client";

import { useEffect, useState, useTransition } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut, UserCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

function getSiteOrigin() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    window.location.origin
  );
}

export function AuthButton() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

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

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      {user ? (
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
