"use client";

import * as React from "react";

import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { AppText } from "./text";
import { cn } from "@/lib/utils";

export type RiconTone = "brand" | "amber" | "success" | "danger" | "info" | "neutral";

const TONE_BOX: Record<RiconTone, string> = {
  brand: "bg-brand-soft",
  amber: "bg-amber-bg",
  success: "bg-success-bg",
  danger: "bg-danger-bg",
  info: "bg-info-bg",
  neutral: "bg-surface2",
};

const TONE_ICON: Record<RiconTone, string> = {
  brand: "text-brand-deep",
  amber: "text-amber",
  success: "text-success",
  danger: "text-danger",
  info: "text-info",
  neutral: "text-ink2",
};

/**
 * A 42px rounded square holding a stroke icon — the design's `.ricon`.
 * `tone` picks the soft-fill + icon color pair from the theme (scheme + accent
 * aware).
 */
export function Ricon({
  name,
  tone = "brand",
  className,
}: {
  name: string;
  tone?: RiconTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[12px]",
        TONE_BOX[tone],
        TONE_ICON[tone],
        className,
      )}
    >
      <Icon name={name} size={20} />
    </span>
  );
}

/**
 * A list row (design `.row`): [leading] [title/subtitle] [trailing]. Tappable
 * when `onPress` is given (shows a chevron when no trailing slot is passed).
 * Adds a hairline top border unless `first`.
 */
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  first = false,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const content = (
    <div
      className={cn(
        "flex min-h-[56px] flex-row items-center gap-3 py-3",
        !first && "border-t border-line2",
      )}
    >
      {leading}
      <div className="min-w-0 flex-1">
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="sub" className="mt-0.5" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </div>
      {trailing ??
        (onPress ? (
          <Icon name="chevron-forward" size={18} className="shrink-0 text-ink4" />
        ) : null)}
    </div>
  );

  if (!onPress) return content;
  return (
    <PressableScale onClick={onPress} pressedScale={0.99} className="block w-full">
      {content}
    </PressableScale>
  );
}
