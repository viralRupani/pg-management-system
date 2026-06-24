import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  type AllocateBedInput,
  type CreateTransferRequestInput,
  type ExecuteTransferInput,
  UserRole,
  allocateBedSchema,
  createTransferRequestSchema,
  executeTransferSchema,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { AllocationService } from "./allocation.service";

const moveOutSchema = z.object({ residentId: z.string().uuid() });
type MoveOutInput = z.infer<typeof moveOutSchema>;

@Controller("allocations")
@Roles(UserRole.PG_MANAGER)
export class AllocationController {
  constructor(private readonly allocation: AllocationService) {}

  @Post()
  allocate(@Body(new ZodBody(allocateBedSchema)) dto: AllocateBedInput) {
    return this.allocation.allocate(dto);
  }

  @Post("move-out")
  moveOut(@Body(new ZodBody(moveOutSchema)) dto: MoveOutInput) {
    return this.allocation.moveOut(dto.residentId);
  }

  @Get()
  listActive() {
    return this.allocation.listActive();
  }

  @Get("suggestions")
  suggestions(@Query("residentId") residentId: string) {
    return this.allocation.suggestBeds(residentId);
  }

  @Get("exiting-beds")
  exitingBeds() {
    return this.allocation.listExitingBeds();
  }

  @Get("eligible-beds")
  eligibleBeds(@Query("residentId") residentId: string) {
    return this.allocation.listEligibleBeds(residentId);
  }

  // ---- Room transfers (pre-booked move) ----

  @Post("transfers")
  createTransfer(
    @Body(new ZodBody(createTransferRequestSchema))
    dto: CreateTransferRequestInput,
  ) {
    return this.allocation.createTransferRequest(dto);
  }

  @Get("transfers")
  listTransfers() {
    return this.allocation.listTransferRequests();
  }

  @Post("transfers/:id/execute")
  executeTransfer(
    @Param("id") id: string,
    @Body(new ZodBody(executeTransferSchema)) dto: ExecuteTransferInput,
  ) {
    return this.allocation.executeTransferRequest(id, dto.moveDate);
  }

  @Post("transfers/:id/cancel")
  cancelTransfer(@Param("id") id: string) {
    return this.allocation.cancelTransferRequest(id);
  }
}
