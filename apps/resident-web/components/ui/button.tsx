"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm";

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const BOX: Record<Variant, string> = {
  primary: "bg-brand hover:opacity-90 active:opacity-80",
  ghost: "border border-line bg-surface hover:bg-page active:opacity-70",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-bg active:opacity-70",
};

const LABEL: Record<Variant, string> = {
  primary: "text-brand-foreground",
  ghost: "text-ink",
  danger: "text-danger",
};

/**
 * Shared button. `primary` is the brand-filled CTA; `ghost` is the neutral
 * secondary; `danger` is the destructive ghost. Pass `loading` for a spinner.
 */
export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={cn(
        "inline-flex cursor-pointer flex-row items-center justify-center gap-2 rounded-btn font-semibold",
        size === "sm" ? "px-3.5 py-2 text-[14px]" : "px-5 py-3.5 text-[15px]",
        BOX[variant],
        LABEL[variant],
        isDisabled && "cursor-not-allowed opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      <span>{title}</span>
    </button>
  );
}
