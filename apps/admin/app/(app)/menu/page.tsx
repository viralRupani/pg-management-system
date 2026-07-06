"use client";

import {
  MealType,
  type MenuConfig,
  type MenuSlotSummary,
  type UpsertMenuSlotInput,
} from "@pg/shared";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { cn, toMessage } from "@/lib/utils";

/* ---------------------------------------------------------------- constants */

const MEALS: MealType[] = [
  MealType.BREAKFAST,
  MealType.LUNCH,
  MealType.SNACKS,
  MealType.DINNER,
];

// ISO day of week: index 0 = Mon (dayOfWeek=1) … index 6 = Sun (dayOfWeek=7)
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const mealLabel = (m: MealType) => m.charAt(0) + m.slice(1).toLowerCase();

/* ------------------------------------------------------------------- dates */

/** Zero-padded local YYYY-MM-DD. Never use toISOString() — UTC shifts in IST. */
function ymd(d: Date): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Monday of the week containing d (local midnight). */
function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - offset);
  m.setHours(0, 0, 0, 0);
  return m;
}

/** "Mon 9 Jun 2026" display string for a YYYY-MM-DD cycle start. */
function formatMonday(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ---------------------------------------------------------------- slot key */

function slotKey(
  weekNumber: number,
  dayOfWeek: number,
  meal: MealType,
): string {
  return `${weekNumber}|${dayOfWeek}|${meal}`;
}

/* ------------------------------------------------------------------- types */

interface EditTarget {
  weekNumber: number;
  dayOfWeek: number;
  meal: MealType;
  current: string;
}

/* -------------------------------------------------------------------- page */

export default function MenuPage() {
  const toast = useToast();
  const [config, setConfig] = useState<MenuConfig | null>(null);
  const [slots, setSlots] = useState<MenuSlotSummary[] | null>(null);
  const [activeWeek, setActiveWeek] = useState(1);
  const [loadFailed, setLoadFailed] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const [draftCycleLen, setDraftCycleLen] = useState<1 | 2 | 3>(1);
  const [draftStart, setDraftStart] = useState("");
  const [configBusy, setConfigBusy] = useState(false);

  const load = useCallback(async () => {
    const [cfg, sls] = await Promise.all([
      api.menu.config(),
      api.menu.slots(),
    ]);
    setConfig(cfg);
    setSlots(sls);
    setDraftCycleLen(cfg.cycleLengthWeeks);
    setDraftStart(cfg.cycleStartDate);
    setActiveWeek((w) => Math.min(w, cfg.cycleLengthWeeks));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, sls] = await Promise.all([
          api.menu.config(),
          api.menu.slots(),
        ]);
        if (!cancelled) {
          setConfig(cfg);
          setSlots(sls);
          setDraftCycleLen(cfg.cycleLengthWeeks);
          setDraftStart(cfg.cycleStartDate);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadFailed(true);
          toast.error(toMessage(err, "Could not load menu."));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const slotByKey = useMemo(() => {
    const map = new Map<string, MenuSlotSummary>();
    for (const s of slots ?? []) {
      map.set(slotKey(s.weekNumber, s.dayOfWeek, s.mealType), s);
    }
    return map;
  }, [slots]);

  const saveConfig = async () => {
    setConfigBusy(true);
    try {
      const updated = await api.menu.updateConfig({
        cycleLengthWeeks: draftCycleLen,
        cycleStartDate: draftStart,
      });
      setConfig(updated);
      setActiveWeek((w) => Math.min(w, updated.cycleLengthWeeks));
      const sls = await api.menu.slots();
      setSlots(sls);
    } catch (err) {
      toast.error(toMessage(err, "Could not save settings."));
    } finally {
      setConfigBusy(false);
    }
  };

  const handleDeleteSlot = async (
    weekNumber: number,
    dayOfWeek: number,
    meal: MealType,
  ) => {
    try {
      await api.menu.deleteSlot(weekNumber, dayOfWeek, meal);
      await load();
    } catch (err) {
      toast.error(toMessage(err, "Could not delete slot."));
    }
  };

  if (!config || !slots) {
    return (
      <div className="space-y-6">
        {loadFailed ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load the menu — try refreshing.
          </p>
        ) : (
          <>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </>
        )}
      </div>
    );
  }

  const weekTabs = Array.from(
    { length: config.cycleLengthWeeks },
    (_, i) => i + 1,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu"
        description="Define a repeating weekly cycle. Residents see their dates materialized from this template automatically."
      />

      {/* ── Cycle settings ─────────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-4 pt-5">
          <h2 className="text-sm font-semibold">Cycle settings</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full space-y-1.5 sm:w-36">
              <Label htmlFor="cycle-len">Cycle length</Label>
              <Select
                id="cycle-len"
                value={draftCycleLen}
                onChange={(e) =>
                  setDraftCycleLen(Number(e.target.value) as 1 | 2 | 3)
                }
              >
                <option value={1}>1 week</option>
                <option value={2}>2 weeks</option>
                <option value={3}>3 weeks</option>
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <Label htmlFor="cycle-start">Cycle starts (Monday)</Label>
              <Input
                id="cycle-start"
                type="date"
                value={draftStart}
                onChange={(e) => {
                  if (e.target.value) {
                    const snapped = mondayOf(
                      new Date(`${e.target.value}T00:00:00`),
                    );
                    setDraftStart(ymd(snapped));
                  }
                }}
              />
            </div>
            <Button onClick={saveConfig} loading={configBusy}>
              {configBusy ? "Saving…" : "Save settings"}
            </Button>
          </div>
          {draftStart && (
            <p className="text-xs text-muted-foreground">
              Anchored on {formatMonday(draftStart)}
            </p>
          )}
          {draftCycleLen < config.cycleLengthWeeks && (
            <p className="text-xs text-warning">
              Reducing the cycle length will permanently delete slots for{" "}
              {Array.from(
                { length: config.cycleLengthWeeks - draftCycleLen },
                (_, i) => `Week ${draftCycleLen + i + 1}`,
              ).join(" and ")}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Week tabs ───────────────────────────────────────────────────── */}
      <div className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
        {weekTabs.map((w) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={activeWeek === w}
            onClick={() => setActiveWeek(w)}
            className={cn(
              "shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              activeWeek === w
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Week {w}
          </button>
        ))}
      </div>

      {/* ── Template grid ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="overflow-x-auto pt-5">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className="w-24 pb-3 text-left text-xs font-medium text-muted-foreground" />
                {DAY_NAMES.map((name, i) => (
                  <th
                    key={i}
                    className="px-2 pb-3 text-center text-xs font-medium text-muted-foreground"
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEALS.map((meal) => (
                <tr key={meal} className="border-t border-border">
                  <td className="py-2 pr-2 align-top text-sm font-medium">
                    {mealLabel(meal)}
                  </td>
                  {Array.from({ length: 7 }, (_, i) => i + 1).map((dow) => {
                    const entry = slotByKey.get(
                      slotKey(activeWeek, dow, meal),
                    );
                    return (
                      <td key={dow} className="p-1 align-top">
                        <div className="group relative">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                weekNumber: activeWeek,
                                dayOfWeek: dow,
                                meal,
                                current: entry?.items ?? "",
                              })
                            }
                            className={cn(
                              "flex min-h-16 w-full rounded-md border p-2 text-left text-xs transition-colors",
                              entry
                                ? "border-border bg-card hover:border-brand"
                                : "border-dashed border-border text-muted-foreground hover:border-brand hover:text-foreground",
                            )}
                          >
                            {entry ? (
                              <span className="whitespace-pre-wrap pr-4">
                                {entry.items}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <Plus className="h-3 w-3" />
                                Add
                              </span>
                            )}
                          </button>
                          {entry && (
                            <button
                              type="button"
                              onClick={() =>
                                handleDeleteSlot(activeWeek, dow, meal)
                              }
                              className="absolute right-1 top-1 flex items-center justify-center rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                              title="Delete slot"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <EditSlotDialog
        target={editing}
        onClose={() => setEditing(null)}
        onDone={async () => {
          setEditing(null);
          await load();
        }}
      />
    </div>
  );
}

/* --------------------------------------------------------- EditSlotDialog */

function EditSlotDialog({
  target,
  onClose,
  onDone,
}: {
  target: EditTarget | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const toast = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setValue(target.current);
  }, [target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const items = value.trim();
    if (!items) return;
    setBusy(true);
    try {
      await api.menu.upsertSlot({
        weekNumber: target.weekNumber as UpsertMenuSlotInput["weekNumber"],
        dayOfWeek: target.dayOfWeek,
        mealType: target.meal,
        items,
      });
      await onDone();
    } catch (err) {
      toast.error(toMessage(err, "Could not save the slot."));
    } finally {
      setBusy(false);
    }
  };

  const weekLabel = target
    ? `Week ${target.weekNumber} · ${DAY_NAMES[target.dayOfWeek - 1]}`
    : "";

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? mealLabel(target.meal) : "Menu slot"}
      description={weekLabel}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="slot-items">Items</Label>
          <Textarea
            id="slot-items"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            maxLength={1000}
            rows={4}
            placeholder="e.g. Poha, Tea, Banana"
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated dishes. Saving replaces what&apos;s currently set.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={busy}
            disabled={value.trim() === ""}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
