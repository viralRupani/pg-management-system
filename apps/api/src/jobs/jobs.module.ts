import {
  Inject,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Queue, Worker, type RedisOptions } from "bullmq";
import { ENV, type AppEnv } from "../config/env";
import { MeteringService } from "../platform/metering.service";
import { PlatformModule } from "../platform/platform.module";
import { RentModule } from "../rent/rent.module";
import { BookingsModule } from "../bookings/bookings.module";
import { AllocationModule } from "../allocation/allocation.module";
import { ShortStaysModule } from "../short-stays/short-stays.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

export const RENT_QUEUE = Symbol("RENT_QUEUE");
const QUEUE_NAME = "rent-jobs";

/** Parse REDIS_URL into BullMQ connection options (it owns its own client). */
function redisConnection(url: string): RedisOptions {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * BullMQ scheduling for the rent loop. The repeatable jobs (monthly invoice
 * generation, daily reminders) fan out to JobsService — the same code the
 * platform-admin trigger endpoints call. BullMQ provides cadence/retries;
 * JobsService owns the cross-tenant-under-RLS logic.
 */
@Module({
  imports: [PlatformModule, RentModule, BookingsModule, AllocationModule, ShortStaysModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    {
      provide: RENT_QUEUE,
      inject: [ENV],
      useFactory: (env: AppEnv) =>
        new Queue(QUEUE_NAME, { connection: redisConnection(env.REDIS_URL) }),
    },
  ],
  exports: [JobsService],
})
export class JobsModule implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: AppEnv,
    @Inject(RENT_QUEUE) private readonly queue: Queue,
    private readonly jobs: JobsService,
    private readonly metering: MeteringService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        switch (job.name) {
          case "dispatch-scheduled-invoices":
            return this.jobs.dispatchScheduledInvoices();
          case "mark-overdue":
            return this.jobs.markOverdueAllTenants(job.data?.period);
          case "complete-short-stays":
            return this.jobs.completeShortStaysAllTenants();
          case "activate-bookings":
            return this.jobs.activateBookingsAllTenants();
          case "activate-transfers":
            return this.jobs.activateTransfersAllTenants();
          case "rent-reminders":
            return this.jobs.sendRentReminders(job.data?.period);
          case "monthly-billing-snapshot":
            return this.metering.snapshotMonth(job.data?.period);
          default:
            return;
        }
      },
      { connection: redisConnection(this.env.REDIS_URL) },
    );

    // Drop the old fixed monthly-invoices repeatable (replaced by per-PG
    // schedules dispatched below). No-op if it was never registered; without
    // this, a previously-registered repeat would keep firing a now-unhandled job.
    await this.queue
      .removeRepeatable("monthly-invoices", { pattern: "0 2 1 * *" })
      .catch(() => undefined);

    // Repeatable schedules; BullMQ dedupes by repeat key, so re-adding on every
    // boot is idempotent. Per-PG invoice schedules are dispatched by a 15-min
    // tick (each tenant owns its own day/time in IST — see
    // InvoiceScheduleService); the overdue sweep runs @ 08:00 then reminders @
    // 09:00 (server tz) — overdue first so reminders see the fresh OVERDUE status.
    await this.queue.add(
      "dispatch-scheduled-invoices",
      {},
      { repeat: { pattern: "*/15 * * * *" }, removeOnComplete: true },
    );
    await this.queue.add(
      "mark-overdue",
      {},
      { repeat: { pattern: "0 8 * * *" }, removeOnComplete: true },
    );
    // Complete expired short stays daily @ 00:30 — before activate-bookings
    // (01:00) so that TRANSIENT beds are swept back to RESERVED in time for
    // bookings to activate on the same run.
    await this.queue.add(
      "complete-short-stays",
      {},
      { repeat: { pattern: "30 0 * * *" }, removeOnComplete: true },
    );
    // Activate due future-dated bookings daily @ 01:00 — before monthly invoice
    // generation (02:00 on the 1st), so a resident moving in on the 1st gets
    // their allocation in time to be billed that month.
    await this.queue.add(
      "activate-bookings",
      {},
      { repeat: { pattern: "0 1 * * *" }, removeOnComplete: true },
    );
    // Execute due pre-booked room transfers daily @ 01:30 — after bookings (so a
    // bed freed by an activated booking can be claimed) and before invoicing.
    await this.queue.add(
      "activate-transfers",
      {},
      { repeat: { pattern: "30 1 * * *" }, removeOnComplete: true },
    );
    await this.queue.add(
      "rent-reminders",
      {},
      { repeat: { pattern: "0 9 * * *" }, removeOnComplete: true },
    );
    // Billing headcount snapshot on the 1st @ 03:00 (after invoice generation).
    await this.queue.add(
      "monthly-billing-snapshot",
      {},
      { repeat: { pattern: "0 3 1 * *" }, removeOnComplete: true },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
  }
}
