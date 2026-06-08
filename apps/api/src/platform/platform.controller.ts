import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  createTenantSchema,
  type CreateTenantInput,
  type SnapshotRequestInput,
  snapshotRequestSchema,
  UserRole,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { MeteringService } from "./metering.service";
import { PlatformService } from "./platform.service";

/**
 * Super-admin (platform owner) endpoints. PLATFORM_ADMIN only. These run on the
 * BYPASSRLS pool and are NOT wrapped in a tenant transaction (the interceptor
 * skips PLATFORM_ADMIN).
 */
@Controller("platform")
@Roles(UserRole.PLATFORM_ADMIN)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly metering: MeteringService,
  ) {}

  @Post("tenants")
  onboardTenant(
    @Body(new ZodBody(createTenantSchema)) dto: CreateTenantInput,
  ) {
    return this.platform.onboardTenant(dto);
  }

  /** Live per-PG headcount + recurring-revenue estimate (the dashboard list). */
  @Get("overview")
  overview() {
    return this.metering.liveOverview();
  }

  /** Run the monthly billing snapshot now (ops/tests; the job runs it on cadence). */
  @Post("billing/snapshot")
  snapshot(@Body(new ZodBody(snapshotRequestSchema)) dto: SnapshotRequestInput) {
    return this.metering.snapshotMonth(dto.period);
  }

  /** Persisted snapshots, optionally filtered to a 'YYYY-MM' period. */
  @Get("billing/snapshots")
  snapshots(@Query("period") period?: string) {
    return this.metering.listSnapshots(period);
  }
}
