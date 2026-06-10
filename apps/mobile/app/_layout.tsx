import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/components/theme-provider';
import { hydrateTokens } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { queryClient } from '@/lib/query';

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
            <Stack screenOptions={{ headerShown: false }} />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
