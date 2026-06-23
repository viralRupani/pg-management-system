import { Module } from "@nestjs/common";
import { ShortStaysController } from "./short-stays.controller";
import { ShortStaysService } from "./short-stays.service";

@Module({
  controllers: [ShortStaysController],
  providers: [ShortStaysService],
  exports: [ShortStaysService],
})
export class ShortStaysModule {}
