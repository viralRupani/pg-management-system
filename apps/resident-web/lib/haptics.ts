/**
 * Thin, fire-and-forget haptics seam (web port of the mobile lib/haptics.ts).
 * Uses the Vibration API where available (Android browsers); everywhere else
 * it's a silent no-op. Must never throw or block UI.
 */
function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    /* best-effort */
  }
}

export const haptics = {
  /** Picker ticks, tab presses, chip toggles. */
  selection: () => vibrate(8),
  /** Button presses, sheet snaps. */
  tap: () => vibrate(12),
  /** A completed action (payment submitted, upload done). */
  success: () => vibrate([14, 60, 14]),
  /** A failed action (rejected OTP, failed upload). */
  error: () => vibrate([40, 60, 40]),
};
