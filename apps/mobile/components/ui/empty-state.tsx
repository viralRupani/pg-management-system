import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useTokens } from '@/components/theme-provider';
import { AppText } from '@/components/ui/text';
import { Button } from './button';

/** Friendly empty state (design `.empty`): icon bubble, heading, copy, optional CTA. */
export function EmptyState({
  icon = 'sparkles-outline',
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const tokens = useTokens();
  return (
    <Animated.View entering={FadeInDown.duration(300)} className="items-center px-6 py-16">
      <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name={icon} size={30} color={tokens.brandDeep} />
      </View>
      <AppText variant="heading" className="mt-4 text-center">
        {title}
      </AppText>
      {description ? (
        <AppText variant="sub" className="mt-1.5 max-w-[260px] text-center">
          {description}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} className="mt-5" />
      ) : null}
    </Animated.View>
  );
}
