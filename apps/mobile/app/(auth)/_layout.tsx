import { Stack } from 'expo-router';

/** Login wizard: slug → phone → OTP. State flows forward via router params. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
