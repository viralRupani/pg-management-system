import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { z } from "zod";
import {
  type AllocateBedInput,
  UserRole,
  allocateBedSchema,
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
}
