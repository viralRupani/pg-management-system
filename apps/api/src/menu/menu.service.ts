import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, gt } from "drizzle-orm";
import type {
  MealType,
  MenuConfig,
  MenuItemSummary,
  MenuSlotSummary,
  UpdateMenuConfigInput,
  UpsertMenuSlotInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { menuConfig, menuSlots } from "../db/schema";

/** Monday=1 … Sunday=7 (ISO). JS getUTCDay() returns 0 for Sunday. */
function isoWeekday(d: Date): number {
  return d.getUTCDay() || 7;
}

/** Returns true when a YYYY-MM-DD string falls on a Monday (UTC). */
function isMonday(dateStr: string): boolean {
  return isoWeekday(new Date(dateStr + "T12:00:00Z")) === 1;
}

/** Enumerate every YYYY-MM-DD in [from..to] inclusive using UTC noon to avoid DST shifts. */
function datesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const cur = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z");
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cur.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Menu is tenant-SHARED. The manager defines a repeating cycle of 1–3 weeks
 * (stored as abstract slots keyed by week_number + day_of_week + meal_type).
 * `GET /menu?from=&to=` materializes those slots onto actual calendar dates.
 * Resident API contract (MenuItemSummary[]) is unchanged.
 */
@Injectable()
export class MenuService {
  constructor(private readonly ctx: TenantContextService) {}

  /**
   * Get the tenant's cycle config. Auto-creates a default row (cycle=1,
   * cycleStartDate=nearest past Monday) on first call using INSERT … ON CONFLICT
   * DO NOTHING so concurrent first-reads don't race to a PK violation.
   */
  async getConfig(): Promise<MenuConfig> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    const today = new Date();
    const offset = (today.getUTCDay() + 6) % 7;
    const mon = new Date(today);
    mon.setUTCDate(today.getUTCDate() - offset);
    const defaultStart = [
      mon.getUTCFullYear(),
      String(mon.getUTCMonth() + 1).padStart(2, "0"),
      String(mon.getUTCDate()).padStart(2, "0"),
    ].join("-");

    await db
      .insert(menuConfig)
      .values({ tenantId, cycleLengthWeeks: 1, cycleStartDate: defaultStart })
      .onConflictDoNothing();

    const [row] = await db
      .select()
      .from(menuConfig)
      .where(eq(menuConfig.tenantId, tenantId));

    return {
      cycleLengthWeeks: row.cycleLengthWeeks as 1 | 2 | 3,
      cycleStartDate: row.cycleStartDate,
    };
  }

  /** Update cycle config. Prunes slots for weeks beyond the new cycle length. */
  async updateConfig(input: UpdateMenuConfigInput): Promise<MenuConfig> {
    const tenantId = this.ctx.currentTenantId()!;
    const db = this.ctx.db();

    if (!isMonday(input.cycleStartDate)) {
      throw new BadRequestException("cycleStartDate must be a Monday");
    }

    await db
      .insert(menuConfig)
      .values({
        tenantId,
        cycleLengthWeeks: input.cycleLengthWeeks,
        cycleStartDate: input.cycleStartDate,
      })
      .onConflictDoUpdate({
        target: [menuConfig.tenantId],
        set: {
          cycleLengthWeeks: input.cycleLengthWeeks,
          cycleStartDate: input.cycleStartDate,
          updatedAt: new Date(),
        },
      });

    await db
      .delete(menuSlots)
      .where(
        and(
          eq(menuSlots.tenantId, tenantId),
          gt(menuSlots.weekNumber, input.cycleLengthWeeks),
        ),
      );

    return {
      cycleLengthWeeks: input.cycleLengthWeeks,
      cycleStartDate: input.cycleStartDate,
    };
  }

  /** List all template slots for this tenant. */
  async listSlots(): Promise<MenuSlotSummary[]> {
    const rows = await this.ctx
      .db()
      .select()
      .from(menuSlots)
      .where(eq(menuSlots.tenantId, this.ctx.currentTenantId()!));
    return rows.map((r) => ({
      id: r.id,
      weekNumber: r.weekNumber,
      dayOfWeek: r.dayOfWeek,
      mealType: r.mealType as MealType,
      items: r.items,
    }));
  }

  /** Upsert one template slot. */
  async upsertSlot(input: UpsertMenuSlotInput): Promise<{ id: string }> {
    const tenantId = this.ctx.currentTenantId()!;
    const [row] = await this.ctx
      .db()
      .insert(menuSlots)
      .values({
        tenantId,
        weekNumber: input.weekNumber,
        dayOfWeek: input.dayOfWeek,
        mealType: input.mealType,
        items: input.items,
      })
      .onConflictDoUpdate({
        target: [
          menuSlots.tenantId,
          menuSlots.weekNumber,
          menuSlots.dayOfWeek,
          menuSlots.mealType,
        ],
        set: { items: input.items, updatedAt: new Date() },
      })
      .returning({ id: menuSlots.id });
    return { id: row.id };
  }

  /** Delete one template slot by natural composite key. */
  async deleteSlot(
    weekNumber: number,
    dayOfWeek: number,
    mealType: string,
  ): Promise<void> {
    const deleted = await this.ctx
      .db()
      .delete(menuSlots)
      .where(
        and(
          eq(menuSlots.tenantId, this.ctx.currentTenantId()!),
          eq(menuSlots.weekNumber, weekNumber),
          eq(menuSlots.dayOfWeek, dayOfWeek),
          eq(menuSlots.mealType, mealType),
        ),
      )
      .returning({ id: menuSlots.id });
    if (!deleted.length) throw new NotFoundException("Menu slot not found");
  }

  /**
   * Materialize cycle template onto calendar dates. Returns the same
   * MenuItemSummary[] shape as the old per-date endpoint — no client contract
   * change. The slot id is reused as the summary id (same slot → many dates).
   */
  async listForDateRange(from: string, to: string): Promise<MenuItemSummary[]> {
    const cfg = await this.getConfig();
    const allSlots = await this.ctx
      .db()
      .select()
      .from(menuSlots)
      .where(eq(menuSlots.tenantId, this.ctx.currentTenantId()!));

    if (!allSlots.length) return [];

    const start = new Date(cfg.cycleStartDate + "T12:00:00Z");
    const n = cfg.cycleLengthWeeks;
    const results: MenuItemSummary[] = [];

    for (const dateStr of datesInRange(from, to)) {
      const d = new Date(dateStr + "T12:00:00Z");
      const daysDiff = Math.round((d.getTime() - start.getTime()) / 86400000);
      const weekOffset = Math.floor(daysDiff / 7);
      const cycleWeek = ((weekOffset % n) + n) % n + 1;
      const dow = isoWeekday(d);

      for (const slot of allSlots) {
        if (slot.weekNumber === cycleWeek && slot.dayOfWeek === dow) {
          results.push({
            id: slot.id,
            menuDate: dateStr,
            mealType: slot.mealType as MealType,
            items: slot.items,
          });
        }
      }
    }

    results.sort((a, b) =>
      a.menuDate < b.menuDate
        ? -1
        : a.menuDate > b.menuDate
          ? 1
          : a.mealType < b.mealType
            ? -1
            : 1,
    );

    return results;
  }
}
