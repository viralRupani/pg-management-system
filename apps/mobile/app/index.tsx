import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/**
 * Auth gate. Tokens are already hydrated (RootLayout awaits hydrateTokens before
 * mounting), so this synchronously routes to the app or the login flow.
 */
export default function Index() {
  const { isAuthenticated } = useAuth();
  return <Redirect href={isAuthenticated ? '/home' : '/(auth)'} />;
}
