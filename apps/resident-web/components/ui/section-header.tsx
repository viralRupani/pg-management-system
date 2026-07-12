"use client";

import * as React from "react";

import { PressableScale } from "./pressable-scale";
import { AppText } from "./text";
import { cn } from "@/lib/utils";

/** Overline section title with an optional trailing action ("See all"). */
export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-row items-end justify-between px-1", className)}>
      <AppText variant="caption" className="uppercase tracking-wider">
        {title}
      </AppText>
      {action && onAction ? (
        <PressableScale onClick={onAction} className="min-h-[24px]">
          <AppText variant="label" className="text-brand-deep">
            {action}
          </AppText>
        </PressableScale>
      ) : null}
    </div>
  );
}
