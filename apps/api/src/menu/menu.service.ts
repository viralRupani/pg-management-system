import { Injectable } from "@nestjs/common";
import { and, asc, gte, lte } from "drizzle-orm";
import {
  type MealType,
  type MenuItemSummary,
  type UpsertMenuInput,
} from "@pg/shared";
import { TenantContextService } from "../db/tenant-context";
import { menuItems } from "../db/schema";

/**
 * Menu is tenant-SHARED: every resident sees the same published menu, so reads
 * are NOT user-filtered — RLS tenant-scoping is the whole isolation requirement.
 * Publishing is an upsert keyed by (tenant, date, meal).
 */
@Injectable()
export class MenuService {
  constructor(private readonly ctx: TenantContextService) {}

  /** Manager: publish/replace the menu for one date + meal. */
  async upsert(input: UpsertMenuInput): Promise<{ id: string }> {
    const [row] = await this.ctx
      .db()
      .insert(menuItems)
      .values({
        tenantId: this.ctx.currentTenantId()!,
        menuDate: input.menuDate,
        mealType: input.mealType,
        items: input.items,
      })
      .onConflictDoUpdate({
        target: [menuItems.tenantId, menuItems.menuDate, menuItems.mealType],
        set: { items: input.items, updatedAt: new Date() },
      })
      .returning({ id: menuItems.id });
    return { id: row.id };
  }

  /** Anyone in the tenant: menu for a date range (inclusive), date then meal. */
  async list(from: string, to: string): Promise<MenuItemSummary[]> {
    const rows = await this.ctx
      .db()
      .select()
      .from(menuItems)
      .where(and(gte(menuItems.menuDate, from), lte(menuItems.menuDate, to)))
      .orderBy(asc(menuItems.menuDate), asc(menuItems.mealType));
    return rows.map((r) => ({
      id: r.id,
      menuDate: r.menuDate,
      mealType: r.mealType as MealType,
      items: r.items,
    }));
  }
}
