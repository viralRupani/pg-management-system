import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { hydrateTokens } from '@/lib/api';
import { queryClient } from '@/lib/query';

/**
 * Root layout — the single place app-wide providers are stacked:
 *   SafeAreaProvider → QueryClientProvider → the expo-router Stack.
 * We hydrate persisted auth tokens from SecureStore before rendering routes so
 * the (future) auth gate sees the real session on cold start.
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
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
