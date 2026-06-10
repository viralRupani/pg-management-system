import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils';

/** A 42px rounded square holding a stroke icon — the design's `.ricon`. */
export function Ricon({
  name,
  className,
  color = '#0b7d73',
}: {
  name: keyof typeof Ionicons.glyphMap;
  className?: string;
  color?: string;
}) {
  return (
    <View
      className={cn(
        'h-[42px] w-[42px] items-center justify-center rounded-[12px] bg-brand-soft',
        className,
      )}
    >
      <Ionicons name={name} size={20} color={color} />
    </View>
  );
}

/**
 * A list row (design `.row`): [leading] [title/subtitle] [trailing]. Tappable
 * when `onPress` is given. Adds a hairline top border unless `first`.
 */
export function Row({
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  first = false,
}: {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const content = (
    <View
      className={cn(
        'flex-row items-center gap-3 py-3.5',
        !first && 'border-t border-line2',
      )}
    >
      {leading}
      <View className="flex-1">
        <Text className="text-[15px] font-semibold text-ink" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-[13px] text-ink2" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} className="active:opacity-60">
      {content}
    </Pressable>
  );
}
