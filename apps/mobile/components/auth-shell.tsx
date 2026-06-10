import { Text, View } from 'react-native';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cn } from '@/lib/utils';

/** The 3-step login progress indicator (design `.dots`). */
function ProgressDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <View className="flex-row gap-1.5">
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

/**
 * Common chrome for the three login screens: safe area, keyboard avoidance,
 * progress dots, optional PG branding header, title + subtitle, then content.
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
          {header}
          <View className="mt-6">
            <ProgressDots step={step} />
          </View>
          <Text className="mt-6 text-[25px] font-extrabold text-ink">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-2 text-[15px] leading-6 text-ink2">
              {subtitle}
            </Text>
          ) : null}
          <View className="mt-7 flex-1">{children}</View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** PG branding header (logo dot + name + location) shown on steps 2–3. */
export function PgBrandHeader({ name }: { name: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="h-7 w-7 rounded-lg bg-brand" />
      <Text className="text-[15px] font-bold text-ink">{name}</Text>
    </View>
  );
}
