import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OwnerController } from "./owner.controller";
import { OwnerService } from "./owner.service";

/**
 * Owner module. Imports AuthModule to reuse AuthService for minting PG-scoped
 * tokens. PLATFORM_DB, TenantContextService and STORAGE_PROVIDER are all global
 * providers (DatabaseModule / SecurityModule / StorageModule).
 */
@Module({
  imports: [AuthModule],
  controllers: [OwnerController],
  providers: [OwnerService],
})
export class OwnerModule {}
