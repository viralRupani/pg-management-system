import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import {
  ExpoPushStubChannel,
  NOTIFICATION_CHANNEL,
} from "./notification-channel";

/**
 * Global so the JobsModule (rent reminders) can inject NotificationsService
 * without an import cycle. Swap ExpoPushStubChannel for a real Expo/FCM driver
 * at deploy time — call sites don't change.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_CHANNEL, useClass: ExpoPushStubChannel },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
