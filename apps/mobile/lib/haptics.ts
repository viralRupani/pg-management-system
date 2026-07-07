import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin, fire-and-forget haptics seam. Every call is best-effort: haptics must
 * never throw or block UI (web + devices without a vibrator are no-ops).
 */
const canHaptic = Platform.OS !== 'web';

function safely(fn: () => Promise<void>): void {
  if (!canHaptic) return;
  fn().catch(() => {});
}

export const haptics = {
  /** Picker ticks, tab presses, chip toggles. */
  selection: () => safely(() => Haptics.selectionAsync()),
  /** Button presses, sheet snaps. */
  tap: () => safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A completed action (payment submitted, upload done). */
  success: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A failed action (rejected OTP, failed upload). */
  error: () => safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
