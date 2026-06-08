import { Module } from "@nestjs/common";
import { MeteringService } from "./metering.service";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  controllers: [PlatformController],
  providers: [PlatformService, MeteringService],
  exports: [PlatformService, MeteringService],
})
export class PlatformModule {}
