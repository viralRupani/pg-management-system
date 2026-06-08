import { Body, Controller, Post } from "@nestjs/common";
import { z } from "zod";
import { periodSchema, UserRole } from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { JobsService } from "./jobs.service";

const runJobSchema = z.object({ period: periodSchema.optional() });
type RunJobInput = z.infer<typeof runJobSchema>;

/**
 * Platform-admin manual triggers for the scheduled batch jobs. Calls JobsService
 * synchronously (returns the result for ops/verification); the BullMQ worker
 * runs the SAME service methods on a schedule. These routes are PLATFORM_ADMIN,
 * so they are not wrapped in a tenant context — the job sets per-tenant context
 * itself.
 */
@Controller("platform/jobs")
@Roles(UserRole.PLATFORM_ADMIN)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post("generate-invoices")
  generate(@Body(new ZodBody(runJobSchema)) dto: RunJobInput) {
    return this.jobs.generateInvoicesAllTenants(dto.period);
  }

  @Post("rent-reminders")
  reminders(@Body(new ZodBody(runJobSchema)) dto: RunJobInput) {
    return this.jobs.sendRentReminders(dto.period);
  }
}
