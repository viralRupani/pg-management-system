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
  imports: [PlatformModule, RentModule, BookingsModule],
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
          case "monthly-invoices":
            return this.jobs.generateInvoicesAllTenants(job.data?.period);
          case "mark-overdue":
            return this.jobs.markOverdueAllTenants(job.data?.period);
          case "activate-bookings":
            return this.jobs.activateBookingsAllTenants();
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

    // Repeatable schedules; BullMQ dedupes by repeat key, so re-adding on every
    // boot is idempotent. Monthly generation on the 1st @ 02:00; daily the
    // overdue sweep @ 08:00 then reminders @ 09:00 (server tz) — overdue runs
    // first so reminders see the fresh OVERDUE status.
    await this.queue.add(
      "monthly-invoices",
      {},
      { repeat: { pattern: "0 2 1 * *" }, removeOnComplete: true },
    );
    await this.queue.add(
      "mark-overdue",
      {},
      { repeat: { pattern: "0 8 * * *" }, removeOnComplete: true },
    );
    // Activate due future-dated bookings daily @ 01:00 — before monthly invoice
    // generation (02:00 on the 1st), so a resident moving in on the 1st gets
    // their allocation in time to be billed that month.
    await this.queue.add(
      "activate-bookings",
      {},
      { repeat: { pattern: "0 1 * * *" }, removeOnComplete: true },
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
