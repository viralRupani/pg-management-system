import { Module } from "@nestjs/common";
import { AllocationController } from "./allocation.controller";
import { AllocationService } from "./allocation.service";
import { RentModule } from "../rent/rent.module";

@Module({
  imports: [RentModule], // InvoiceScheduleService for late-join auto-invoicing
  controllers: [AllocationController],
  providers: [AllocationService],
  exports: [AllocationService],
})
export class AllocationModule {}
