import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/components/theme-provider';
import { hydrateTokens } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';

/**
 * Reactive auth guard. app/index.tsx only gates the `/` route, so flipping the
 * session (logout, or a failed token refresh) while deep in the tab stack would
 * otherwise leave the now-signed-out screens mounted. This watches auth state
 * app-wide and bounces the user between the login flow and the app accordingly.
 */
function AuthGate() {
  const { isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/home');
    }
  }, [isAuthenticated, segments, router]);

  return null;
}

/**
 * Root layout — the single place app-wide providers are stacked:
 *   SafeAreaProvider → QueryClientProvider → AuthProvider → ThemeProvider → Stack.
 * We hydrate persisted auth tokens from SecureStore before rendering routes so
 * the auth gate (app/index.tsx) sees the real session on cold start.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateTokens().finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider>
            <AuthGate />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
