"use client";

import { Button } from "@/components/ui/button";
import type { ScholarshipLanguage } from "@/lib/scholarship-language";
import { cn } from "@/lib/utils";

export function LanguageToggle({
  className,
  language,
  onChange,
}: {
  className?: string;
  language: ScholarshipLanguage;
  onChange: (language: ScholarshipLanguage) => void;
}) {
  return (
    <div
      aria-label="Language"
      className={cn(
        "inline-flex w-fit overflow-hidden rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm",
        className
      )}
    >
      <Button
        type="button"
        size="sm"
        variant={language === "zh" ? "default" : "ghost"}
        className={cn(
          "h-7 rounded-md px-3",
          language === "zh"
            ? "bg-[#1f6f78] text-white hover:bg-[#185d65]"
            : "text-slate-600 hover:text-slate-950"
        )}
        onClick={() => onChange("zh")}
      >
        中文
      </Button>
      <Button
        type="button"
        size="sm"
        variant={language === "en" ? "default" : "ghost"}
        className={cn(
          "h-7 rounded-md px-3",
          language === "en"
            ? "bg-[#1f6f78] text-white hover:bg-[#185d65]"
            : "text-slate-600 hover:text-slate-950"
        )}
        onClick={() => onChange("en")}
      >
        English
      </Button>
    </div>
  );
}
