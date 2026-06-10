import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

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
  return (
    <View className="items-center px-6 py-16">
      <View className="h-[72px] w-[72px] items-center justify-center rounded-full bg-brand-soft">
        <Ionicons name={icon} size={30} color="#0b7d73" />
      </View>
      <Text className="mt-4 text-center text-base font-bold text-ink">
        {title}
      </Text>
      {description ? (
        <Text className="mt-1.5 max-w-[260px] text-center text-[13px] text-ink2">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} className="mt-5" />
      ) : null}
    </View>
  );
}
