import '../global.css';

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/components/theme-provider';
import { ToastHost } from '@/components/ui/toast';
import { hydrateTokens } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { setInterLoaded } from '@/lib/fonts';
import { queryClient } from '@/lib/query';

// Hold the splash while tokens hydrate + fonts load (released in RootLayout).
SplashScreen.preventAutoHideAsync().catch(() => {});

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
 *   GestureHandlerRootView → SafeAreaProvider → QueryClientProvider →
 *   AuthProvider → ThemeProvider → Stack.
 * We hydrate persisted auth tokens from SecureStore before rendering routes so
 * the auth gate (app/index.tsx) sees the real session on cold start. Fonts are
 * best-effort: `fontError` still renders (system fonts) — never block login on
 * a font download.
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const fontsSettled = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    hydrateTokens().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready && fontsSettled) SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsSettled]);

  if (!ready || !fontsSettled) return null;
  // Fonts have settled by here (splash was held), so this render-time write is
  // seen by every AppText before anything paints.
  setInterLoaded(fontsLoaded);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <AuthGate />
              <Stack screenOptions={{ headerShown: false }} />
              {/* Inside ThemeProvider's var scope so toasts pick up tokens. */}
              <ToastHost />
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
