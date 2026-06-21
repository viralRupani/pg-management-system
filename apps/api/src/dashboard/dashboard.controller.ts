import { Controller, Get } from "@nestjs/common";
import { UserRole } from "@pg/shared";
import { Roles } from "../common/decorators";
import { DashboardService } from "./dashboard.service";

@Controller()
@Roles(UserRole.PG_MANAGER)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("dashboard/stats")
  stats() {
    return this.dashboard.stats();
  }

  @Get("dashboard/alerts")
  alerts() {
    return this.dashboard.alerts();
  }
}
