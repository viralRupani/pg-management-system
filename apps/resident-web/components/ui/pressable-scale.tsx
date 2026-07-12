"use client";

import * as React from "react";

import { haptics } from "@/lib/haptics";
import { cn } from "@/lib/utils";

type PressableScaleProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Fire a haptic on press. */
  haptic?: "selection" | "tap" | "none";
  /** How far to shrink when pressed (1 = none). */
  pressedScale?: number;
};

const SCALE_CLS: Record<string, string> = {
  "0.85": "active:scale-[0.85]",
  "0.88": "active:scale-[0.88]",
  "0.9": "active:scale-90",
  "0.92": "active:scale-[0.92]",
  "0.94": "active:scale-[0.94]",
  "0.97": "active:scale-[0.97]",
  "0.98": "active:scale-[0.98]",
  "0.99": "active:scale-[0.99]",
};

/**
 * The app's tactile pressable (web port of the mobile PressableScale): shrinks
 * + dims slightly while pressed. Use for every tappable surface (buttons,
 * rows, tiles, chips, tab items). Renders a real <button> for a11y.
 */
export function PressableScale({
  haptic = "none",
  pressedScale = 0.97,
  className,
  onPointerDown,
  type,
  ...props
}: PressableScaleProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "text-left transition-[transform,opacity] duration-100 ease-out active:opacity-90 disabled:pointer-events-none",
        SCALE_CLS[String(pressedScale)] ?? "active:scale-[0.97]",
        className,
      )}
      onPointerDown={(e) => {
        if (haptic !== "none") haptics[haptic]();
        onPointerDown?.(e);
      }}
      {...props}
    />
  );
}
