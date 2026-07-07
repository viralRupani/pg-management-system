import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TermsController } from "./terms.controller";
import { TermsService } from "./terms.service";

/**
 * Terms & Conditions acceptance gate + platform-admin publishing. Imports
 * AuthModule to reuse `AuthRepository` (resolves the caller's credential from the
 * JWT). The service uses APP_DB directly — the tc_* tables are global (no RLS).
 */
@Module({
  imports: [AuthModule],
  controllers: [TermsController],
  providers: [TermsService],
})
export class TermsModule {}
