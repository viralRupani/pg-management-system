import { Global, Module } from "@nestjs/common";
import { MailModule } from "../mail/mail.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import {
  ExpoPushStubChannel,
  NOTIFICATION_CHANNEL,
} from "./notification-channel";

/**
 * Global so the JobsModule (rent reminders) can inject NotificationsService
 * without an import cycle. Swap ExpoPushStubChannel for a real Expo/FCM driver
 * at deploy time — call sites don't change. Imports MailModule because notify()
 * also emails the resident (the interim delivery channel until real push).
 */
@Global()
@Module({
  imports: [MailModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: NOTIFICATION_CHANNEL, useClass: ExpoPushStubChannel },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
