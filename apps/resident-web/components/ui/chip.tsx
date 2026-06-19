"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** A filter pill; `active` fills with the brand accent. */
export function Chip({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-pill border px-3.5 py-2 text-[13px] font-semibold active:opacity-70",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "border-line bg-surface text-ink2",
      )}
    >
      {label}
    </button>
  );
}

/** A horizontally scrollable row of chips. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 flex flex-row gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
