import { Body, Controller, Delete, Get, Put, Query } from "@nestjs/common";
import {
  type ReferralSettingsInput,
  referralSettingsInputSchema,
  UserRole,
} from "@pg/shared";
import { Roles } from "../common/decorators";
import { ZodBody } from "../common/zod-validation.pipe";
import { ReferralsService } from "./referrals.service";

@Controller("referrals")
@Roles(UserRole.PG_MANAGER)
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  @Get("settings")
  getSettings() {
    return this.referrals.getSettings();
  }

  @Put("settings")
  setSettings(
    @Body(new ZodBody(referralSettingsInputSchema)) dto: ReferralSettingsInput,
  ) {
    return this.referrals.setSettings(dto.discountPaise);
  }

  @Delete("settings")
  deleteSettings() {
    return this.referrals.clearSettings();
  }

  @Get()
  list(@Query("residentId") residentId: string) {
    return this.referrals.listForResident(residentId);
  }
}
