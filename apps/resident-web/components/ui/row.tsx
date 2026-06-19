"use client";

import * as React from "react";

import { Icon } from "./icon";
import { cn } from "@/lib/utils";

/** A 42px rounded square holding a stroke icon — the design's `.ricon`. */
export function Ricon({
  name,
  className,
  color = "#0b7d73",
}: {
  name: string;
  className?: string;
  color?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px] bg-brand-soft",
        className,
      )}
    >
      <Icon name={name} size={20} color={color} />
    </div>
  );
}

/**
 * A list row: [leading] [title/subtitle] [trailing]. Tappable when `onClick` is
 * given. Adds a hairline top border unless `first`.
 */
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  first = false,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
  first?: boolean;
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{title}</p>
        {subtitle ? (
          <p className="mt-0.5 line-clamp-2 text-[13px] text-ink2">{subtitle}</p>
        ) : null}
      </div>
      {trailing}
    </>
  );

  const cls = cn(
    "flex w-full flex-row items-center gap-3 py-3.5 text-left",
    !first && "border-t border-line2",
  );

  if (!onClick) return <div className={cls}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} className={cn(cls, "active:opacity-60")}>
      {inner}
    </button>
  );
}
