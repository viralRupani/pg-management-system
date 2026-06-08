import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { PaymentsController } from "./payments.controller";
import { RentService } from "./rent.service";

/**
 * The resident rent loop: invoice generation, screenshot payments, manager
 * approve/reject. Distinct from platform billing/metering (M6) — this is what
 * residents pay their PG, not what the PG pays the platform.
 */
@Module({
  controllers: [InvoicesController, PaymentsController],
  providers: [RentService],
  exports: [RentService],
})
export class RentModule {}
