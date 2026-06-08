"use client";

import { ApiError } from "@pg/api-client";
import { MealType, type MenuItemSummary } from "@pg/shared";
import { AlertCircle, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const inputClass =
  "flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-50";

const toMessage = (err: unknown, fallback: string) =>
  err instanceof ApiError ? err.message : fallback;

// Display order is chronological (the enum/API order is alphabetical).
const MEALS: MealType[] = [
  MealType.BREAKFAST,
  MealType.LUNCH,
  MealType.SNACKS,
  MealType.DINNER,
];
const mealLabel = (m: MealType) => m.charAt(0) + m.slice(1).toLowerCase();

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local YYYY-MM-DD (zero-padded). NOT toISOString — that's UTC and shifts the
 * date in IST. Both menu endpoints reject unpadded dates (\d{2} / z.date()). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `d`, at local midnight. */
function mondayOf(d: Date): Date {
  const offset = (d.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, ...
  const m = new Date(d);
  m.setDate(d.getDate() - offset);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}

const cellKey = (date: string, meal: MealType) => `${date}|${meal}`;

interface EditTarget {
  date: string;
  meal: MealType;
  current: string;
}

export default function MenuPage() {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [items, setItems] = useState<MenuItemSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = ymd(days[0]);
  const to = ymd(days[6]);
  const todayYmd = ymd(new Date());

  const load = useCallback(async (fromD: string, toD: string) => {
    setItems(await api.menu.list(fromD, toD));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      try {
        const list = await api.menu.list(from, to);
        if (!cancelled) setItems(list);
      } catch (err) {
        if (!cancelled) setError(toMessage(err, "Could not load the menu."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  // Lookup by date+meal for O(1) cell rendering.
  const byCell = new Map<string, MenuItemSummary>();
  for (const it of items ?? []) byCell.set(cellKey(it.menuDate, it.mealType), it);

  const monthLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="text-sm text-muted-foreground">
            Publish the weekly meal plan. Click any cell to set or update it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(mondayOf(new Date()))}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-sm font-medium text-muted-foreground">{monthLabel}</p>

      <ErrorBanner message={error} />

      <Card>
        <CardContent className="overflow-x-auto pt-5">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className="w-24 pb-3 text-left text-xs font-medium text-muted-foreground" />
                {days.map((d) => {
                  const ds = ymd(d);
                  const isToday = ds === todayYmd;
                  return (
                    <th
                      key={ds}
                      className="px-2 pb-3 text-center text-xs font-medium"
                    >
                      <span
                        className={cn(
                          "inline-flex flex-col rounded-md px-2 py-1",
                          isToday
                            ? "bg-brand/10 text-brand"
                            : "text-muted-foreground",
                        )}
                      >
                        <span>{DAY_NAMES[d.getDay()]}</span>
                        <span className="text-sm font-semibold text-foreground">
                          {d.getDate()}
                        </span>
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MEALS.map((meal) => (
                <tr key={meal} className="border-t border-border">
                  <td className="py-2 pr-2 align-top text-sm font-medium">
                    {mealLabel(meal)}
                  </td>
                  {days.map((d) => {
                    const ds = ymd(d);
                    const entry = byCell.get(cellKey(ds, meal));
                    return (
                      <td key={ds} className="p-1 align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              date: ds,
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
                          {items === null ? (
                            <span className="h-3 w-full animate-pulse rounded bg-muted" />
                          ) : entry ? (
                            <span className="whitespace-pre-wrap">
                              {entry.items}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <Plus className="h-3 w-3" />
                              Add
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <EditMealDialog
        target={editing}
        onClose={() => setEditing(null)}
        onDone={async () => {
          setEditing(null);
          await load(from, to);
        }}
        onError={setError}
      />
    </div>
  );
}

function EditMealDialog({
  target,
  onClose,
  onDone,
  onError,
}: {
  target: EditTarget | null;
  onClose: () => void;
  onDone: () => Promise<void> | void;
  onError: (m: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) setValue(target.current);
  }, [target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const items = value.trim();
    if (!items) return; // API requires min(1); there is no clear/delete.
    setBusy(true);
    try {
      await api.menu.upsert({
        menuDate: target.date,
        mealType: target.meal,
        items,
      });
      await onDone();
    } catch (err) {
      onError(toMessage(err, "Could not save the menu."));
    } finally {
      setBusy(false);
    }
  };

  const prettyDate = target
    ? new Date(`${target.date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "long",
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={target ? `${mealLabel(target.meal)}` : "Menu"}
      description={target ? prettyDate : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="menu-items">Items</Label>
          <textarea
            id="menu-items"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            maxLength={1000}
            rows={4}
            placeholder="e.g. Poha, Tea, Banana"
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated dishes. Saving replaces what's currently set.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || value.trim() === ""}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5 text-danger">
        <AlertCircle className="h-5 w-5" />
        <span className="text-sm">{message}</span>
      </CardContent>
    </Card>
  );
}
