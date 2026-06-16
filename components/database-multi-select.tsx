"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  joinDatabaseValues,
  parseDatabaseValues,
} from "@/lib/scholarship-form-options";
import { cn } from "@/lib/utils";

/**
 * Multi-select for the Edition / 資料庫別 field. A journal can be indexed in
 * several editions, so the user (or auto-detect) may pick more than one. The
 * value is a single string with editions joined by "、".
 */
export function DatabaseMultiSelect({
  value,
  onChange,
  options,
  placeholder = "選擇資料庫",
  className,
  disabled,
  renderOption,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  renderOption?: (option: string) => React.ReactNode;
}) {
  const selected = new Set(parseDatabaseValues(value));

  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) {
      next.delete(option);
    } else {
      next.add(option);
    }
    // Keep the original option order in the stored string.
    onChange(joinDatabaseValues(options.filter((item) => next.has(item))));
  };

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex min-h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span
          className={cn(
            "line-clamp-1",
            selected.size === 0 && "text-muted-foreground"
          )}
        >
          {selected.size > 0 ? Array.from(selected).join("、") : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 gap-0.5 p-1.5">
        {options.map((option) => {
          const isSelected = selected.has(option);
          return (
            <button
              key={option}
              type="button"
              role="menuitemcheckbox"
              aria-checked={isSelected}
              onClick={() => toggle(option)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded border",
                  isSelected
                    ? "border-[#1f6f78] bg-[#1f6f78] text-white"
                    : "border-input"
                )}
              >
                {isSelected ? <Check className="size-3" /> : null}
              </span>
              <span>{renderOption ? renderOption(option) : option}</span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
