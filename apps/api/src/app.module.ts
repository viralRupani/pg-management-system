import { Controller, Get, Module } from "@nestjs/common";
import { Public } from "./common/decorators";
import { DatabaseModule } from "./db/database.module";
import { RedisModule } from "./redis/redis.module";
import { SecurityModule } from "./security/security.module";
import { AuthModule } from "./auth/auth.module";
import { PlatformModule } from "./platform/platform.module";
import { OwnerModule } from "./owner/owner.module";
import { ResidentsModule } from "./residents/residents.module";
import { PropertyModule } from "./property/property.module";
import { AllocationModule } from "./allocation/allocation.module";
import { StorageModule } from "./storage/storage.module";
import { RentModule } from "./rent/rent.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { JobsModule } from "./jobs/jobs.module";
import { DocumentsModule } from "./documents/documents.module";
import { DepositsModule } from "./deposits/deposits.module";
import { ComplaintsModule } from "./complaints/complaints.module";
import { MenuModule } from "./menu/menu.module";
import { AnnouncementsModule } from "./announcements/announcements.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { BrandingModule } from "./branding/branding.module";

@Controller()
class HealthController {
  @Public()
  @Get("health")
  health() {
    return { status: "ok" };
  }
}

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    SecurityModule,
    AuthModule,
    PlatformModule,
    OwnerModule,
    ResidentsModule,
    PropertyModule,
    AllocationModule,
    StorageModule,
    RentModule,
    NotificationsModule,
    JobsModule,
    DocumentsModule,
    DepositsModule,
    ComplaintsModule,
    MenuModule,
    AnnouncementsModule,
    BudgetsModule,
    BrandingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
