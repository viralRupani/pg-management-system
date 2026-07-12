"use client";

import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";

/**
 * Floating action button (design `.fab`): brand circle, bottom-right, floated
 * above the tab bar and pinned inside the centered mobile column.
 */
export function Fab({
  icon = "add",
  onPress,
  ariaLabel,
}: {
  icon?: string;
  onPress: () => void;
  ariaLabel?: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[84px] z-30 mx-auto max-w-[480px]">
      <PressableScale
        onClick={onPress}
        haptic="tap"
        pressedScale={0.92}
        aria-label={ariaLabel}
        className="pointer-events-auto absolute bottom-0 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg shadow-black/25"
      >
        <Icon name={icon} size={26} />
      </PressableScale>
    </div>
  );
}
