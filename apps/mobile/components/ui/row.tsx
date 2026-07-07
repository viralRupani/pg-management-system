import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTokens } from '@/components/theme-provider';
import { PressableScale } from '@/components/ui/pressable-scale';
import { AppText } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type RiconTone = 'brand' | 'amber' | 'success' | 'danger' | 'info' | 'neutral';

const TONE_BOX: Record<RiconTone, string> = {
  brand: 'bg-brand-soft',
  amber: 'bg-amber-bg',
  success: 'bg-success-bg',
  danger: 'bg-danger-bg',
  info: 'bg-info-bg',
  neutral: 'bg-surface2',
};

/**
 * A 42px rounded square holding a stroke icon — the design's `.ricon`.
 * `tone` picks the soft-fill + icon color pair from the theme (scheme + accent
 * aware); `color` overrides the icon color only.
 */
export function Ricon({
  name,
  tone = 'brand',
  className,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  tone?: RiconTone;
  className?: string;
  color?: string;
}) {
  const tokens = useTokens();
  const toneColor: Record<RiconTone, string> = {
    brand: tokens.brandDeep,
    amber: tokens.amber,
    success: tokens.success,
    danger: tokens.danger,
    info: tokens.info,
    neutral: tokens.ink2,
  };
  return (
    <View
      className={cn(
        'h-[42px] w-[42px] items-center justify-center rounded-[12px]',
        TONE_BOX[tone],
        className,
      )}
    >
      <Ionicons name={name} size={20} color={color ?? toneColor[tone]} />
    </View>
  );
}

/**
 * A list row (design `.row`): [leading] [title/subtitle] [trailing]. Tappable
 * when `onPress` is given (springs + shows a chevron when no trailing slot is
 * passed). Adds a hairline top border unless `first`.
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
  const tokens = useTokens();
  const content = (
    <View
      className={cn(
        'min-h-[56px] flex-row items-center gap-3 py-3',
        !first && 'border-t border-line2',
      )}
    >
      {leading}
      <View className="flex-1">
        <AppText variant="body" weight="semibold" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="sub" className="mt-0.5" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing ??
        (onPress ? <Ionicons name="chevron-forward" size={18} color={tokens.ink4} /> : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <PressableScale onPress={onPress} pressedScale={0.99} accessibilityRole="button">
      {content}
    </PressableScale>
  );
}
