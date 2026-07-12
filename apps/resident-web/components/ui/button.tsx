"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { PressableScale } from "./pressable-scale";
import { Icon } from "./icon";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger";
type Size = "md" | "sm";

type ButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "title"
> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Optional leading icon (mobile Ionicons vocabulary). */
  icon?: string;
  className?: string;
};

const BOX: Record<Variant, string> = {
  primary: "bg-brand text-brand-foreground",
  ghost: "border border-line bg-surface text-ink",
  danger: "border border-danger-line bg-surface text-danger",
};

const LABEL: Record<Variant, string> = {
  primary: "text-brand-foreground",
  ghost: "text-ink",
  danger: "text-danger",
};

/**
 * The shared button. `primary` is the brand-filled CTA; `ghost` is the neutral
 * secondary (cancel); `danger` is the destructive ghost (logout). Pass `loading`
 * to show a spinner and disable. md height ≥ 48px for touch targets.
 */
export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const iconSize = size === "sm" ? 16 : 18;
  return (
    <PressableScale
      disabled={isDisabled}
      haptic="tap"
      aria-busy={loading}
      className={cn(
        "flex flex-row items-center justify-center gap-2 rounded-btn text-center",
        size === "sm" ? "min-h-[40px] px-4 py-2" : "min-h-[48px] px-5 py-3",
        BOX[variant],
        isDisabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      <span
        className={cn(
          "font-semibold",
          size === "sm"
            ? "text-[14px] leading-[18px]"
            : "text-[15px] leading-[20px]",
          LABEL[variant],
        )}
      >
        {title}
      </span>
    </PressableScale>
  );
}
