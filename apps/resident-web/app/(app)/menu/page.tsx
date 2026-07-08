"use client";

import { MealType } from "@pg/shared";
import { useMemo, useState } from "react";

import { Appbar } from "@/components/ui/appbar";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { ListSkeleton } from "@/components/ui/skeleton";
import { useMenu, useMenuConfig } from "@/lib/queries";
import { cn, ymd } from "@/lib/utils";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS: { type: MealType; label: string }[] = [
  { type: MealType.BREAKFAST, label: "Breakfast" },
  { type: MealType.LUNCH, label: "Lunch" },
  { type: MealType.SNACKS, label: "Snacks" },
  { type: MealType.DINNER, label: "Dinner" },
];

function mondayOf(offsetWeeks: number): Date {
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function MenuPage() {
  const [week, setWeek] = useState(0);
  useMenuConfig(); // auto-inits the cycle config server-side on first call

  const days = useMemo(() => {
    const monday = mondayOf(week);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [week]);

  const from = ymd(days[0]);
  const to = ymd(days[6]);
  const { data, isLoading } = useMenu(from, to);
  const todayYmd = ymd(new Date());

  const mealFor = (dateYmd: string, type: MealType) =>
    data?.find((m) => m.menuDate === dateYmd && m.mealType === type)?.items;

  const rangeLabel = `${days[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;

  return (
    <div className="min-h-full bg-page">
      <Appbar title="Mess menu" />
      <div className="flex flex-col gap-3 px-4 pb-8 pt-1">
        <div className="flex flex-row items-center justify-between rounded-btn bg-brand-soft px-2 py-1.5">
          <button
            type="button"
            onClick={() => setWeek((w) => w - 1)}
            className="p-2"
            aria-label="Previous week"
          >
            <Icon name="chevron-back" size={20} color="#0b7d73" />
          </button>
          <span className="text-[14px] font-bold text-brand-deep">
            {week === 0 ? "This week" : rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => setWeek((w) => w + 1)}
            className="p-2"
            aria-label="Next week"
          >
            <Icon name="chevron-forward" size={20} color="#0b7d73" />
          </button>
        </div>

        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : (
          days.map((d, i) => {
            const dYmd = ymd(d);
            const isToday = dYmd === todayYmd;
            return (
              <Card key={dYmd} className="flex flex-row gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-[12px]",
                    isToday ? "bg-brand" : "bg-page",
                  )}
                >
                  <span
                    className={cn(
                      "text-[11px] font-bold",
                      isToday ? "text-brand-foreground" : "text-ink2",
                    )}
                  >
                    {DAY_NAMES[i]}
                  </span>
                  <span
                    className={cn(
                      "text-[14px] font-extrabold",
                      isToday ? "text-brand-foreground" : "text-ink",
                    )}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  {(() => {
                    const served = MEALS.map((m) => ({
                      ...m,
                      items: mealFor(dYmd, m.type),
                    })).filter((m) => !!m.items);
                    if (served.length === 0) {
                      return (
                        <p className="text-[13px] text-ink3">
                          No menu set for this day
                        </p>
                      );
                    }
                    return served.map((m) => (
                      <div key={m.type}>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-ink3">
                          {m.label}
                        </p>
                        <p className="line-clamp-2 text-[13px] text-ink">
                          {m.items}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
