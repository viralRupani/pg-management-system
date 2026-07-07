import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTokens } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';
import { Button } from './button';

/**
 * Failed-query state with a retry — render on a screen's `isError` branch
 * (a failed list must not masquerade as an empty one).
 */
export function ErrorState({
  title = "Couldn't load",
  description = 'Something went wrong. Check your connection and try again.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  const tokens = useTokens();
  return (
    <Animated.View entering={FadeInDown.duration(300)} className="items-center px-6 py-14">
      <View className="h-[64px] w-[64px] items-center justify-center rounded-full bg-danger-bg">
        <Ionicons name="cloud-offline-outline" size={28} color={tokens.danger} />
      </View>
      <AppText variant="heading" className="mt-4 text-center">
        {title}
      </AppText>
      <AppText variant="sub" className="mt-1.5 max-w-[260px] text-center">
        {description}
      </AppText>
      {onRetry ? (
        <Button
          title="Try again"
          variant="ghost"
          icon="refresh-outline"
          onPress={onRetry}
          className="mt-5"
        />
      ) : null}
    </Animated.View>
  );
}
