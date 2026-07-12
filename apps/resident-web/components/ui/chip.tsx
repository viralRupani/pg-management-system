"use client";

import * as React from "react";

import { PressableScale } from "./pressable-scale";
import { cn } from "@/lib/utils";

/** A filter pill (design `.chip`); `active` fills with the brand accent. */
export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <PressableScale
      onClick={onPress}
      haptic="selection"
      aria-pressed={active}
      className={cn(
        "flex min-h-[36px] shrink-0 items-center justify-center rounded-pill border px-3.5 py-1.5",
        active ? "border-brand bg-brand" : "border-line bg-surface",
      )}
    >
      <span
        className={cn(
          "text-[13px] font-semibold leading-[18px]",
          active ? "text-brand-foreground" : "text-ink2",
        )}
      >
        {label}
      </span>
    </PressableScale>
  );
}

/** A horizontally scrollable row of chips. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-row gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}
