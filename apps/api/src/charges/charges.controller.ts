import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  type CreateExtraChargeInput,
  createExtraChargeSchema,
  type JwtPayload,
  UserRole,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { ChargesService } from "./charges.service";

@Controller()
export class ChargesController {
  constructor(private readonly charges: ChargesService) {}

  // --- Manager / owner (@Roles(PG_MANAGER) also covers PG_OWNER) ---
  @Post("charges")
  @Roles(UserRole.PG_MANAGER)
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(createExtraChargeSchema)) dto: CreateExtraChargeInput,
  ) {
    return this.charges.create(user.sub, dto);
  }

  @Get("charges")
  @Roles(UserRole.PG_MANAGER)
  list(@Query("residentId") residentId: string) {
    return this.charges.listForResident(residentId);
  }

  @Post("charges/:id/remove")
  @Roles(UserRole.PG_MANAGER)
  remove(@Param("id") id: string) {
    return this.charges.remove(id);
  }

  // --- Shared: invoice breakdown (resident scoped to own; manager sees any) ---
  @Get("invoices/:id/charges")
  @Roles(UserRole.RESIDENT, UserRole.PG_MANAGER)
  invoiceCharges(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    const scope = user.role === UserRole.RESIDENT ? user.sub : undefined;
    return this.charges.listForInvoice(id, scope);
  }
}
