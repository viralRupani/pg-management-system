import { z } from "zod";

/** Resident registers an Expo push token for their device. */
export const registerPushTokenSchema = z.object({
  token: z.string().min(1).max(255),
  platform: z.enum(["ios", "android"]).optional(),
});
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const notificationSummarySchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationSummary = z.infer<typeof notificationSummarySchema>;
