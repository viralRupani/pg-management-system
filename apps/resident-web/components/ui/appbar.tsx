"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { AppText } from "./text";

/**
 * Secondary-screen header (design `.appbar`): circular back button, title,
 * optional trailing action.
 */
export function Appbar({
  title,
  action,
  onBack,
}: {
  title: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-row items-center gap-3 pb-3 pt-1">
      <PressableScale
        onClick={onBack ?? (() => router.back())}
        pressedScale={0.9}
        aria-label="Go back"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink"
      >
        <Icon name="chevron-back" size={20} />
      </PressableScale>
      <AppText variant="heading" className="flex-1 text-[19px]" numberOfLines={1}>
        {title}
      </AppText>
      {action}
    </div>
  );
}
