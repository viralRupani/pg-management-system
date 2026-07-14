"use client";

import * as React from "react";

import { Button } from "./button";
import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { Sheet } from "./sheet";
import { AppText } from "./text";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/**
 * Month+year picker in a bottom sheet — like CalendarSheet but without day
 * precision. For choosing "which month" (e.g. a move-out) when billing is
 * monthly anyway, so a specific day just adds friction. Emits the 1st of the
 * picked month; callers format with `ymd()`.
 */
export function MonthYearSheet({
  visible,
  onClose,
  onSelect,
  value,
  minDate,
  title = "Pick a month",
  subtitle,
  confirmLabel = "Confirm",
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
  value?: Date | null;
  minDate?: Date;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
}) {
  const min = minDate ? monthStart(minDate) : null;
  const [month, setMonth] = React.useState(() =>
    monthStart(value ?? minDate ?? new Date()),
  );

  React.useEffect(() => {
    if (visible) setMonth(monthStart(value ?? minDate ?? new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const canGoPrev = !min || month.getTime() > min.getTime();

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <div className="flex flex-row items-center justify-between">
        <PressableScale
          onClick={() => canGoPrev && setMonth(addMonths(month, -1))}
          disabled={!canGoPrev}
          haptic="selection"
          aria-label="Previous month"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink2",
            !canGoPrev && "opacity-30",
          )}
        >
          <Icon name="chevron-back" size={18} />
        </PressableScale>
        <AppText variant="heading">
          {MONTHS[month.getMonth()]} {month.getFullYear()}
        </AppText>
        <PressableScale
          onClick={() => setMonth(addMonths(month, 1))}
          haptic="selection"
          aria-label="Next month"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink2"
        >
          <Icon name="chevron-forward" size={18} />
        </PressableScale>
      </div>

      <Button
        title={`${confirmLabel} · ${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
        onClick={() => {
          onSelect(month);
          onClose();
        }}
      />
    </Sheet>
  );
}
