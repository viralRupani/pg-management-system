"use client";

import * as React from "react";

import { Button } from "./button";
import { Icon } from "./icon";
import { PressableScale } from "./pressable-scale";
import { Sheet } from "./sheet";
import { AppText } from "./text";
import { cn, formatDate, ymd } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const monthStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/**
 * Month-grid date picker in a bottom sheet (port of the mobile CalendarSheet —
 * fully theme-aware, unlike a native <input type=date>). Tap a day, confirm;
 * emits a local `Date` (callers format with `ymd()`, never ISO/UTC).
 */
export function CalendarSheet({
  visible,
  onClose,
  onSelect,
  value,
  minDate,
  title = "Pick a date",
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
  const min = minDate ? dayStart(minDate) : null;
  const [selected, setSelected] = React.useState<Date | null>(value ?? null);
  const [month, setMonth] = React.useState(() =>
    monthStart(value ?? minDate ?? new Date()),
  );

  React.useEffect(() => {
    if (visible) {
      setSelected(value ?? null);
      setMonth(monthStart(value ?? minDate ?? new Date()));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const today = dayStart(new Date());
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingBlanks = month.getDay(); // 0 = Sunday-first grid
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1),
    ),
  ];
  const canGoPrev = !min || month.getTime() > monthStart(min).getTime();

  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {/* Month pager */}
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

      {/* Weekday header */}
      <div className="flex flex-row">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="flex flex-1 items-center justify-center py-1">
            <AppText variant="caption" className="uppercase">
              {d}
            </AppText>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex flex-row flex-wrap">
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} className="h-[44px] w-[14.28%]" />;
          const disabled = Boolean(min && date.getTime() < min.getTime());
          const isSelected = Boolean(
            selected && date.getTime() === dayStart(selected).getTime(),
          );
          const isToday = date.getTime() === today.getTime();
          return (
            <div
              key={ymd(date)}
              className="flex h-[44px] w-[14.28%] items-center justify-center"
            >
              <PressableScale
                onClick={() => setSelected(date)}
                disabled={disabled}
                haptic="selection"
                pressedScale={0.9}
                aria-label={formatDate(ymd(date))}
                aria-pressed={isSelected}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full",
                  isSelected
                    ? "bg-brand"
                    : isToday
                      ? "border border-brand-line"
                      : undefined,
                  disabled && "opacity-30",
                )}
              >
                <span
                  className={cn(
                    "text-[14px] font-semibold",
                    isSelected
                      ? "text-brand-foreground"
                      : isToday
                        ? "text-brand-deep"
                        : "text-ink",
                  )}
                >
                  {date.getDate()}
                </span>
              </PressableScale>
            </div>
          );
        })}
      </div>

      <Button
        title={selected ? `${confirmLabel} · ${formatDate(ymd(selected))}` : "Pick a date"}
        disabled={!selected}
        onClick={() => {
          if (selected) {
            onSelect(selected);
            onClose();
          }
        }}
      />
    </Sheet>
  );
}
