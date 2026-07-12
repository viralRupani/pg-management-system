"use client";

import * as React from "react";

import { PressableScale } from "./pressable-scale";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

/**
 * Segmented control with a sliding thumb — for small mutually-exclusive sets
 * (filters, payment method, appearance). For >4 options use Chips instead.
 * The thumb glides via a CSS left/width transition (no overshoot).
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const pct = 100 / options.length;

  return (
    <div className={cn("relative flex flex-row rounded-pill bg-surface2 p-1", className)}>
      <div
        className="absolute bottom-1 top-1 rounded-pill border border-line bg-surface shadow-sm shadow-black/10 transition-[left] duration-200 ease-out"
        style={{
          width: `calc(${pct}% - 8px / ${options.length})`,
          left: `calc(4px + ${index} * (100% - 8px) / ${options.length})`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            haptic="selection"
            pressedScale={0.98}
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className="relative flex min-h-[36px] flex-1 items-center justify-center rounded-pill"
          >
            <span
              className={cn(
                "text-[13px] font-semibold leading-[18px]",
                selected ? "text-ink" : "text-ink3",
              )}
            >
              {option.label}
            </span>
          </PressableScale>
        );
      })}
    </div>
  );
}
