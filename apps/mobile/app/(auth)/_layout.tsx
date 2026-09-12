import { Stack } from 'expo-router';

/**
 * Login wizard: slug → email → OTP. State flows forward via router params.
 * SMS_OTP_LOGIN_DISABLED (see docs/backlog.md, root) — this used to be
 * slug → phone → OTP; see docs/disabled-phone-otp-login.tsx.txt.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
