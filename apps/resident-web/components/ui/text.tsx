import * as React from "react";

import { cn } from "@/lib/utils";

export type TextVariant =
  | "display" // hero numbers / screen-defining figures
  | "title" // screen titles
  | "heading" // card/section headings
  | "body" // default copy
  | "sub" // secondary copy (ink2)
  | "label" // emphasized small text (buttons, field labels)
  | "caption"; // overlines, timestamps (ink3)

export type FontWeight = "regular" | "medium" | "semibold" | "bold" | "heavy";

const WEIGHT_CLS: Record<FontWeight, string> = {
  regular: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  heavy: "font-extrabold",
};

const VARIANT: Record<TextVariant, { weight: FontWeight; cls: string }> = {
  display: { weight: "heavy", cls: "text-[28px] leading-[34px] text-ink" },
  title: { weight: "bold", cls: "text-[22px] leading-[28px] text-ink" },
  heading: { weight: "semibold", cls: "text-[17px] leading-[24px] text-ink" },
  body: { weight: "regular", cls: "text-[15px] leading-[22px] text-ink" },
  sub: { weight: "regular", cls: "text-[13px] leading-[18px] text-ink2" },
  label: { weight: "semibold", cls: "text-[13px] leading-[18px] text-ink" },
  caption: { weight: "medium", cls: "text-[11px] leading-[14px] text-ink3" },
};

const CLAMP: Record<number, string> = {
  1: "truncate",
  2: "line-clamp-2",
  3: "line-clamp-3",
};

type AppTextProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: TextVariant;
  /** Override the variant's weight (e.g. a bold `body`). */
  weight?: FontWeight;
  /** RN parity: truncate to N lines (1 = single-line ellipsis). */
  numberOfLines?: number;
  className?: string;
};

/**
 * The typographic surface — the web port of the mobile AppText. Size /
 * line-height / color come from the variant and are overridable via className.
 * Renders a block-level <span> (RN <Text> stacks in column layouts).
 */
export function AppText({
  variant = "body",
  weight,
  numberOfLines,
  className,
  ...props
}: AppTextProps) {
  const v = VARIANT[variant];
  return (
    <span
      className={cn(
        "block",
        v.cls,
        WEIGHT_CLS[weight ?? v.weight],
        numberOfLines ? (CLAMP[numberOfLines] ?? "line-clamp-3") : undefined,
        className,
      )}
      {...props}
    />
  );
}
