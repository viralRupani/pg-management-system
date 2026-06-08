import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import {
  createManagerSchema,
  type CreateManagerInput,
  createOwnerPgSchema,
  type CreateOwnerPgInput,
  type JwtPayload,
  UserRole,
} from "@pg/shared";
import { CurrentUser, Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { OwnerService } from "./owner.service";

/**
 * PG-owner endpoints. PG_OWNER only (a manager does NOT satisfy this gate — the
 * role hierarchy is one-way). The global endpoints (pgs, switch) are called with
 * the owner's global token (tenantId null → no tenant interceptor); the manager
 * endpoints are called with a PG-scoped token (tenantId set → RLS context).
 */
@Controller("owner")
@Roles(UserRole.PG_OWNER)
export class OwnerController {
  constructor(private readonly owner: OwnerService) {}

  // --- global (cross-tenant) ---

  @Get("pgs")
  listPgs(@CurrentUser() user: JwtPayload) {
    return this.owner.listPgs(user);
  }

  @Post("pgs")
  createPg(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodBody(createOwnerPgSchema)) dto: CreateOwnerPgInput,
  ) {
    return this.owner.createPg(user, dto);
  }

  /** Mint a PG-scoped token to operate inside one owned PG. */
  @Post("pgs/:tenantId/switch")
  switchPg(
    @CurrentUser() user: JwtPayload,
    @Param("tenantId", new ParseUUIDPipe()) tenantId: string,
  ) {
    return this.owner.switchPg(user, tenantId);
  }

  // --- in-PG (PG-scoped token) ---

  @Get("managers")
  listManagers() {
    return this.owner.listManagers();
  }

  @Post("managers")
  addManager(
    @Body(new ZodBody(createManagerSchema)) dto: CreateManagerInput,
  ) {
    return this.owner.addManager(dto);
  }

  @Delete("managers/:id")
  deactivateManager(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.owner.deactivateManager(id);
  }
}
