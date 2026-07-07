import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTokens } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** The 3-step login progress indicator (design `.dots`). */
function ProgressDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="flex-row gap-1.5" accessibilityLabel={`Step ${step} of 3`}>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          className={cn(
            'h-1.5 rounded-full',
            i <= step ? 'w-[30px] bg-brand' : 'w-[22px] bg-line',
          )}
        />
      ))}
    </View>
  );
}

/** Default hero mark shown before a PG is known (step 1). */
function AppMark() {
  const tokens = useTokens();
  return (
    <View className="h-12 w-12 items-center justify-center rounded-2xl bg-brand">
      <Ionicons name="home" size={22} color={tokens.brandForeground} />
    </View>
  );
}

/**
 * Common chrome for the three login screens: safe area, keyboard avoidance,
 * progress dots, optional PG branding header, title + subtitle, then content.
 * Sections stagger in with a soft downward fade.
 */
export function AuthShell({
  step,
  title,
  subtitle,
  header,
  children,
}: {
  step: 1 | 2 | 3;
  title: string;
  subtitle?: string;
  header?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 pt-4">
          <Animated.View entering={FadeInDown.duration(300)}>
            {header ?? <AppMark />}
            <View className="mt-6">
              <ProgressDots step={step} />
            </View>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(60).duration(320)}>
            <AppText variant="display" className="mt-6">
              {title}
            </AppText>
            {subtitle ? (
              <AppText variant="body" className="mt-2 text-ink2">
                {subtitle}
              </AppText>
            ) : null}
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(140).duration(320)} className="mt-7 flex-1">
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** PG branding header (accent tile with the PG's initial + name) on steps 2–3. */
export function PgBrandHeader({ name }: { name: string }) {
  const initial = (name ?? '').trim().charAt(0).toUpperCase() || 'P';
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="h-9 w-9 items-center justify-center rounded-xl bg-brand">
        <AppText variant="label" className="text-[15px] text-brand-foreground">
          {initial}
        </AppText>
      </View>
      <AppText variant="body" weight="bold">
        {name}
      </AppText>
    </View>
  );
}
